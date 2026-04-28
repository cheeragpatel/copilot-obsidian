import { ChatMode } from "./constants";
import type { CustomAgentEntry, MCPServerEntry, PluginSettings } from "./settings";

const ALLOWED_MODES = new Set<string>([ChatMode.Ask, ChatMode.Agent]);
const ALLOWED_LOG_LEVELS = new Set<PluginSettings["logLevel"]>([
  "debug",
  "info",
  "warn",
  "error",
]);
const ALLOWED_MCP_SOURCES = new Set<NonNullable<MCPServerEntry["source"]>>([
  "settings",
  "vault",
  "home",
]);

function trimString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asBool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);
}

function normalizeMcpServer(raw: unknown): MCPServerEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const entry = raw as Record<string, unknown>;

  const name = trimString(entry.name);
  if (!name) return null;

  const type = entry.type === "stdio" ? "stdio" : entry.type === "http" ? "http" : null;
  if (!type) return null;

  const enabled = asBool(entry.enabled, true);
  const sourceCandidate = entry.source;
  const source =
    typeof sourceCandidate === "string" &&
    ALLOWED_MCP_SOURCES.has(sourceCandidate as NonNullable<MCPServerEntry["source"]>)
      ? (sourceCandidate as NonNullable<MCPServerEntry["source"]>)
      : "settings";

  if (type === "http") {
    const url = trimString(entry.url);
    if (!url) return null;
    const headers = normalizeStringRecord(entry.headers);
    const configTools = asStringArray(entry.configTools);
    const out: MCPServerEntry = { name, type, url, enabled, source };
    if (headers) out.headers = headers;
    if (configTools.length > 0) out.configTools = configTools;
    return out;
  }

  // stdio
  const command = trimString(entry.command);
  if (!command) return null;
  const env = normalizeStringRecord(entry.env);
  const args = asStringArray(entry.args);
  const configTools = asStringArray(entry.configTools);
  const stdio: MCPServerEntry = { name, type, command, enabled, source };
  if (args.length > 0) stdio.args = args;
  if (env) stdio.env = env;
  if (configTools.length > 0) stdio.configTools = configTools;
  return stdio;
}

function normalizeStringRecord(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object") return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof k === "string" && k.trim() && typeof v === "string") {
      out[k] = v;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function normalizeCustomAgent(raw: unknown): CustomAgentEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const entry = raw as Record<string, unknown>;
  const name = trimString(entry.name);
  if (!name) return null;
  return {
    name,
    displayName: trimString(entry.displayName) ?? name,
    description: typeof entry.description === "string" ? entry.description : "",
    prompt: typeof entry.prompt === "string" ? entry.prompt : "",
    enabled: asBool(entry.enabled, true),
  };
}

function dedupeByName<T extends { name: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    if (seen.has(item.name)) continue;
    seen.add(item.name);
    out.push(item);
  }
  return out;
}

export function normalizeSettings(raw: unknown, defaults: PluginSettings): PluginSettings {
  const source =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : ({} as Record<string, unknown>);

  const defaultModeCandidate = source.defaultMode;
  const defaultMode =
    typeof defaultModeCandidate === "string" && ALLOWED_MODES.has(defaultModeCandidate)
      ? (defaultModeCandidate as ChatMode)
      : defaults.defaultMode;

  const logLevelCandidate = source.logLevel;
  const logLevel =
    typeof logLevelCandidate === "string" &&
    ALLOWED_LOG_LEVELS.has(logLevelCandidate as PluginSettings["logLevel"])
      ? (logLevelCandidate as PluginSettings["logLevel"])
      : defaults.logLevel;

  const cliPath = trimString(source.cliPath) ?? defaults.cliPath;
  const defaultModel = trimString(source.defaultModel) ?? defaults.defaultModel;
  const systemMessage = typeof source.systemMessage === "string" ? source.systemMessage : defaults.systemMessage;

  const mcpServers = Array.isArray(source.mcpServers)
    ? dedupeByName(
        source.mcpServers
          .map(normalizeMcpServer)
          .filter((s): s is MCPServerEntry => s !== null),
      )
    : [];

  const customAgents = Array.isArray(source.customAgents)
    ? dedupeByName(
        source.customAgents
          .map(normalizeCustomAgent)
          .filter((a): a is CustomAgentEntry => a !== null),
      )
    : [];

  const skillDirectories =
    Array.isArray(source.skillDirectories)
      ? asStringArray(source.skillDirectories)
      : [...defaults.skillDirectories];

  const disabledSkills = asStringArray(source.disabledSkills);
  const excludedTools = asStringArray(source.excludedTools);
  const exportFolder = trimString(source.exportFolder) ?? defaults.exportFolder;

  return {
    cliPath,
    defaultModel,
    streaming: asBool(source.streaming, defaults.streaming),
    openOnStartup: asBool(source.openOnStartup, defaults.openOnStartup),
    defaultMode,
    mcpServers,
    customAgents,
    skillDirectories,
    inheritConfig: asBool(source.inheritConfig, defaults.inheritConfig),
    disabledSkills,
    excludedTools,
    systemMessage,
    logLevel,
    autoIncludeCurrentNote: asBool(
      source.autoIncludeCurrentNote,
      defaults.autoIncludeCurrentNote,
    ),
    exportFolder,
    defaultVaultToolPermissions: asBool(source.defaultVaultToolPermissions, defaults.defaultVaultToolPermissions),
    defaultAutopilotPermissions: asBool(source.defaultAutopilotPermissions, defaults.defaultAutopilotPermissions),
  };
}
