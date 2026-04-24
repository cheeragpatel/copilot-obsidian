import * as os from "os";
import * as path from "path";
import { CopilotClient, defineTool, SessionEvent } from "@github/copilot-sdk";
import type { App } from "obsidian";
import { ChatMode, DEFAULT_MODEL, toCliAgentMode } from "../types/constants";
import type { PluginSettings, MCPServerEntry, CustomAgentEntry } from "../types/settings";
import type { FileAttachment } from "../types/chat";
import { ConfigDiscovery } from "./ConfigDiscovery";
import { promptPermission, setAutopilot } from "../views/PermissionModal";
import {
  discoverTools as sdkDiscoverTools,
  normalizeToolInfo,
  normalizeEventType,
  type DiscoveredTool,
} from "./SDKCompat";

type EventCallback = (event: SessionEvent) => void;

interface SessionOptions {
  model?: string;
  mode?: ChatMode;
  tools?: ReturnType<typeof defineTool>[];
  mcpServers?: Record<string, any>;
  customAgents?: any[];
  skillDirectories?: string[];
  disabledSkills?: string[];
  excludedTools?: string[];
  systemMessage?: string;
}

const hasOwn = (obj: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(obj, key);

export class CopilotService {
  private client: CopilotClient | null = null;
  private session: any = null;
  private settings: PluginSettings;
  private app: App;
  private eventListeners: Set<EventCallback> = new Set();
  private discoveredTools: Map<string, DiscoveredTool> = new Map();
  private currentMode: ChatMode;
  private unsubscribeSession?: () => void;
  private unsubscribeClientHealth?: () => void;
  // Serializes session creation/replacement so concurrent createSession()
  // and resumeSession() calls don't interleave destroy+create steps.
  private sessionLock: Promise<void> = Promise.resolve();

  constructor(app: App, settings: PluginSettings) {
    this.app = app;
    this.settings = settings;
    this.currentMode = settings.defaultMode;
  }

  /**
   * Resolve the Copilot CLI path. Electron apps don't inherit the shell PATH,
   * so we probe common install locations when the default "copilot" fails.
   */
  private resolveCliPath(): string {
    const configured = this.settings.cliPath;
    if (configured && configured !== "copilot") {
      return configured;
    }

    const home = os.homedir();

    const candidates = [
      "/opt/homebrew/bin/copilot",
      "/usr/local/bin/copilot",
      "/usr/bin/copilot",
      `${home}/.npm-global/bin/copilot`,
      `${home}/.local/bin/copilot`,
      `${home}/.nvm/versions/node/${process.version}/bin/copilot`,
      `${process.env.LOCALAPPDATA || ""}\\npm\\copilot.cmd`,
      `${process.env.APPDATA || ""}\\npm\\copilot.cmd`,
    ];

    try {
      const fs = window.require("fs");
      for (const candidate of candidates) {
        if (candidate && fs.existsSync(candidate)) {
          console.log(`[Copilot] Found CLI at ${candidate}`);
          return candidate;
        }
      }
    } catch {
      // fs not available — fall through
    }

    return "copilot";
  }

  /**
   * Ensure common bin directories are in PATH so the CLI's
   * `#!/usr/bin/env node` shebang can find the node binary.
   */
  private ensurePath(): void {
    const home = os.homedir();
    const pathDelimiter = process.platform === "win32" ? ";" : ":";
    const homeBasedExtraPaths =
      home && path.isAbsolute(home)
        ? [
            path.join(home, ".npm-global", "bin"),
            path.join(home, ".local", "bin"),
            path.join(home, ".nvm", "versions", "node", process.version, "bin"),
          ]
        : [];
    const extraPaths = [
      "/opt/homebrew/bin",
      "/usr/local/bin",
      "/usr/bin",
      ...homeBasedExtraPaths,
    ].filter((entry) => path.isAbsolute(entry));

    const trailingSepRe = process.platform === "win32" ? /\\+$/ : /\/+$/;
    const normalizeEntry = (value: string) => {
      const normalized = path.normalize(value).replace(trailingSepRe, "");
      return process.platform === "win32" ? normalized.toLowerCase() : normalized;
    };

    const currentPath = process.env.PATH || "";
    const currentEntries = currentPath.split(pathDelimiter);
    const existingEntries = new Set(currentEntries.map(normalizeEntry));
    const missing = extraPaths.filter((entry) => !existingEntries.has(normalizeEntry(entry)));
    if (missing.length > 0) {
      process.env.PATH = [...missing, ...currentEntries].join(pathDelimiter);
    }
  }

  async initialize(): Promise<void> {
    try {
      const cliPath = this.resolveCliPath();
      this.ensurePath();

      const client = new CopilotClient({
        cliPath,
        logLevel: this.settings.logLevel === "warn" ? "warning" : this.settings.logLevel,
      });
      // Only commit the client to instance state once start() succeeds, so a
      // failed initialize doesn't leave a half-constructed client around.
      await client.start();
      this.client = client;

      this.attachClientHealthListener();
    } catch (error) {
      console.error("[Copilot] Failed to initialize client:", (error as Error)?.message || "Unknown error");
      throw error;
    }
  }

  /**
   * Subscribe once to client-level disconnect/error events so a CLI crash
   * fans out a synthetic session.error + session.idle to UI listeners. The
   * registration lives for the lifetime of this CopilotService — re-attaching
   * per session would leak handlers on the long-lived client object.
   */
  private attachClientHealthListener(): void {
    if (!this.client || typeof (this.client as any).on !== "function") return;

    const unsubscribe = (this.client as any).on((event: any) => {
      const type = typeof event?.type === "string" ? event.type : "";
      if (type !== "error" && type !== "disconnect") return;

      const errorEvent = {
        type: "session.error",
        data: { message: `CLI process ${type}: ${event?.data?.message || "unknown"}` },
      } as SessionEvent;
      const idleEvent = { type: "session.idle", data: {} } as SessionEvent;

      for (const listener of this.eventListeners) {
        listener(errorEvent);
        listener(idleEvent);
      }
    });

    if (typeof unsubscribe === "function") {
      this.unsubscribeClientHealth = unsubscribe;
    }
  }

  /**
   * Replace the active session atomically. Callers pass a factory that
   * builds the new session. This serializes through `sessionLock` so two
   * concurrent createSession()/resumeSession() calls cannot interleave the
   * destroy of the previous session with the construction of the next.
   */
  private replaceSession(factory: () => Promise<any>): Promise<void> {
    const next = this.sessionLock.then(async () => {
      if (this.session) {
        this.unsubscribeSession?.();
        this.unsubscribeSession = undefined;
        try {
          await this.session.destroy();
        } catch {
          // Ignore session cleanup errors
        }
        this.session = null;
      }

      this.discoveredTools.clear();

      const created = await factory();
      this.session = created;
      this.attachSessionListener();
    });

    this.sessionLock = next.catch(() => {});
    return next;
  }

  async createSession(options: SessionOptions = {}): Promise<void> {
    if (!this.client) {
      throw new Error("CopilotClient not initialized. Call initialize() first.");
    }

    const model = options.model ?? this.settings.defaultModel ?? DEFAULT_MODEL;
    const mode = options.mode ?? this.currentMode;

    let discoveredConfig: {
      skills: string[];
      mcpServers: any[];
      instructions: string;
      agents: CustomAgentEntry[];
    } = { skills: [], mcpServers: [], instructions: "", agents: [] };

    if (this.settings.inheritConfig) {
      const discovery = new ConfigDiscovery(this.app);
      const result = await discovery.discover();
      discoveredConfig = {
        skills: result.skills ?? [],
        mcpServers: result.mcpServers ?? [],
        instructions: result.instructions ?? "",
        agents: result.agents ?? [],
      };
    }

    const hasExplicitMCPServers = hasOwn(options, "mcpServers");

    const mcpServers = hasExplicitMCPServers
      ? { ...(options.mcpServers || {}) }
      : this.buildMCPConfig();

    if (!hasExplicitMCPServers) {
      for (const discovered of discoveredConfig.mcpServers) {
        if (!mcpServers[discovered.name]) {
          const discoveredServer = this.serializeMCPServer(discovered);
          if (discoveredServer) {
            mcpServers[discovered.name] = discoveredServer;
          }
        }
      }
    }

    const allSkillDirs = [...new Set([
      ...this.settings.skillDirectories,
      ...discoveredConfig.skills,
    ])];

    // Custom agents: settings/options take precedence; discovered agents
    // fill in by name. Use hasOwnProperty so callers can pass [] to clear.
    const baseAgents = hasOwn(options, "customAgents")
      ? (options.customAgents ?? [])
      : this.buildAgentsConfig();
    const seenAgentNames = new Set<string>(baseAgents.map((a: any) => a?.name).filter(Boolean));
    const mergedAgents = [...baseAgents];
    for (const agent of discoveredConfig.agents) {
      if (!agent || seenAgentNames.has(agent.name)) continue;
      seenAgentNames.add(agent.name);
      mergedAgents.push({
        name: agent.name,
        displayName: agent.displayName,
        description: agent.description,
        prompt: agent.prompt,
      });
    }

    const sessionConfig: any = {
      model,
      streaming: this.settings.streaming,
      onPermissionRequest: (request: any) => promptPermission(this.app, request),
    };

    if ((mode === ChatMode.Agent || mode === ChatMode.Autopilot) && options.tools) {
      sessionConfig.tools = options.tools;
    }

    if (Object.keys(mcpServers).length > 0) {
      sessionConfig.mcpServers = mcpServers;
    }

    if (mergedAgents.length > 0) {
      sessionConfig.customAgents = mergedAgents;
    }

    const skillDirectories = hasOwn(options, "skillDirectories")
      ? (options.skillDirectories ?? [])
      : allSkillDirs;
    if (skillDirectories.length > 0) {
      sessionConfig.skillDirectories = skillDirectories;
    }

    const disabledSkills = hasOwn(options, "disabledSkills")
      ? (options.disabledSkills ?? [])
      : this.settings.disabledSkills;
    if (disabledSkills.length > 0) {
      sessionConfig.disabledSkills = disabledSkills;
    }

    const excludedTools = hasOwn(options, "excludedTools")
      ? (options.excludedTools ?? [])
      : this.settings.excludedTools;
    if (excludedTools.length > 0) {
      sessionConfig.excludedTools = excludedTools;
    }

    const systemMsg = hasOwn(options, "systemMessage")
      ? (options.systemMessage ?? "")
      : this.settings.systemMessage;
    const combinedSystemMsg = [discoveredConfig.instructions, systemMsg]
      .filter(Boolean)
      .join("\n\n");

    if (combinedSystemMsg) {
      sessionConfig.systemMessage = {
        mode: "append",
        content: combinedSystemMsg,
      };
    }

    await this.replaceSession(async () => {
      if (!this.client) {
        throw new Error("CopilotClient not initialized.");
      }
      return this.client.createSession(sessionConfig);
    });

    // Mode reflects the active session, so update only after it's wired.
    this.currentMode = mode;

    // Push the CLI-side agent mode (interactive vs. autopilot). Autopilot
    // tells the CLI to auto-approve tool execution rather than firing
    // onPermissionRequest callbacks.
    await this.applyCliAgentMode(mode);
  }

  async sendMessage(prompt: string, attachments?: FileAttachment[]): Promise<void> {
    if (!this.session) {
      throw new Error("No active session. Call createSession() first.");
    }

    const messageOptions: any = { prompt };

    if (attachments && attachments.length > 0) {
      messageOptions.attachments = attachments.map((a) => ({
        type: "file" as const,
        path: a.path,
        displayName: a.name,
      }));
    }

    await this.session.send(messageOptions);
  }

  async sendAndWait(prompt: string, timeout = 120000): Promise<string | null> {
    if (!this.session) {
      throw new Error("No active session. Call createSession() first.");
    }

    const response = await this.session.sendAndWait({ prompt }, timeout);
    return response?.data?.content || null;
  }

  async abort(): Promise<void> {
    if (this.session) {
      await this.session.abort();
    }
  }

  onEvent(callback: EventCallback): () => void {
    this.eventListeners.add(callback);
    return () => {
      this.eventListeners.delete(callback);
    };
  }

  async switchMode(mode: ChatMode, tools?: ReturnType<typeof defineTool>[]): Promise<void> {
    await this.createSession({ mode, tools });
  }

  getMode(): ChatMode {
    return this.currentMode;
  }

  getSessionId(): string | null {
    return this.session?.sessionId || null;
  }

  async listTools(): Promise<DiscoveredTool[]> {
    try {
      const tools = await sdkDiscoverTools(this.session, this.client);
      return this.rememberDiscoveredTools(tools);
    } catch (error) {
      console.warn(
        "[Copilot] Tool discovery failed:",
        (error as Error)?.message || error,
      );
      return this.rememberDiscoveredTools([]);
    }
  }

  async resumeSession(sessionId: string, tools?: ReturnType<typeof defineTool>[]): Promise<void> {
    if (!this.client) {
      throw new Error("CopilotClient not initialized.");
    }

    await this.replaceSession(async () => {
      if (!this.client) {
        throw new Error("CopilotClient not initialized.");
      }
      return this.client.resumeSession(sessionId, {
        tools: tools || [],
        onPermissionRequest: (request: any) => promptPermission(this.app, request),
      });
    });

    // Re-apply the desired CLI agent mode to the resumed session — the CLI
    // does not necessarily restore the previous mode for resumed sessions.
    await this.applyCliAgentMode(this.currentMode);
  }

  /**
   * Push the UI mode down to the CLI agent mode (interactive | autopilot).
   * Best-effort: older CLI/SDK versions may not expose the rpc.mode hook,
   * in which case we silently fall back to interactive (with permission
   * prompts) rather than failing session creation.
   */
  private async applyCliAgentMode(mode: ChatMode): Promise<void> {
    const cliMode = toCliAgentMode(mode);
    // Mirror the mode into the host-side permission handler so any prompts
    // the CLI still emits (older versions, MCP-only requests) get auto-approved
    // when the user has chosen autopilot.
    setAutopilot(cliMode === "autopilot");

    const setter = this.session?.rpc?.mode?.set;
    if (typeof setter !== "function") return;

    try {
      await setter.call(this.session.rpc.mode, { mode: cliMode });
    } catch (error) {
      console.warn(
        "[Copilot] Failed to set CLI agent mode:",
        (error as Error)?.message || error,
      );
    }
  }

  async listSessions(): Promise<any[]> {
    if (!this.client) return [];
    return await this.client.listSessions();
  }

  async deleteSession(sessionId: string): Promise<void> {
    if (!this.client) return;
    await this.client.deleteSession(sessionId);
  }

  async getAvailableModels(): Promise<{ id: string; name: string }[]> {
    if (!this.client) return [];
    try {
      const models = await this.client.listModels();
      return models.map((m: any) => ({ id: m.id, name: m.name || m.id }));
    } catch {
      return [];
    }
  }

  isConnected(): boolean {
    if (!this.client) return false;
    return this.client.getState() === "connected";
  }

  updateSettings(settings: PluginSettings): void {
    this.settings = settings;
  }

  private attachSessionListener(): void {
    if (!this.session?.on) return;

    // Capture the specific session this listener belongs to. If the session
    // is later replaced and the SDK leaks events from the destroyed object,
    // the staleness guard prevents forwarding them to UI listeners.
    const sessionRef = this.session;

    this.unsubscribeSession = this.session.on((event: SessionEvent) => {
      if (this.session !== sessionRef) return;

      const normalized: SessionEvent = {
        ...event,
        type: normalizeEventType(event.type),
      } as SessionEvent;

      const eventType = normalized.type as string;
      if (eventType === "tool.execution_start") {
        const discoveredTool = normalizeToolInfo(normalized.data);
        if (discoveredTool) {
          this.rememberDiscoveredTools([discoveredTool]);
        }
      }

      for (const listener of this.eventListeners) {
        listener(normalized);
      }
    });
  }

  private rememberDiscoveredTools(tools: any[]): DiscoveredTool[] {
    for (const tool of tools) {
      const normalized = normalizeToolInfo(tool);
      if (!normalized) continue;

      const key = normalized.namespacedName || normalized.name;
      const existing = this.discoveredTools.get(key);
      this.discoveredTools.set(key, {
        ...existing,
        ...normalized,
        description: normalized.description || existing?.description || "",
      });
    }

    return Array.from(this.discoveredTools.values()).sort((left, right) =>
      (left.namespacedName || left.name).localeCompare(right.namespacedName || right.name),
    );
  }

  private serializeMCPServer(server: MCPServerEntry): Record<string, any> | null {
    const toolConfig = server.configTools && server.configTools.length > 0
      ? { tools: server.configTools }
      : {};

    if (server.type === "http" && server.url) {
      return {
        type: "http",
        url: server.url,
        ...(server.headers ? { headers: server.headers } : {}),
        ...toolConfig,
      };
    }

    if (server.type === "stdio" && server.command) {
      return {
        type: "stdio",
        command: server.command,
        args: server.args || [],
        env: server.env || {},
        ...toolConfig,
      };
    }

    return null;
  }

  private buildMCPConfig(): Record<string, any> {
    const config: Record<string, any> = {};
    for (const server of this.settings.mcpServers) {
      if (!server.enabled) continue;
      const serialized = this.serializeMCPServer(server);
      if (serialized) {
        config[server.name] = serialized;
      }
    }
    return config;
  }

  private buildAgentsConfig(): any[] {
    return this.settings.customAgents
      .filter((a) => a.enabled)
      .map((a) => ({
        name: a.name,
        displayName: a.displayName,
        description: a.description,
        prompt: a.prompt,
      }));
  }

  async destroy(): Promise<void> {
    this.unsubscribeSession?.();
    this.unsubscribeSession = undefined;

    this.unsubscribeClientHealth?.();
    this.unsubscribeClientHealth = undefined;

    try {
      if (this.session) {
        await this.session.destroy();
        this.session = null;
      }
    } catch {
      // Ignore session cleanup errors
    }

    try {
      if (this.client) {
        await this.client.stop();
        this.client = null;
      }
    } catch {
      // Ignore client cleanup errors
    }

    this.eventListeners.clear();
    this.discoveredTools.clear();
  }
}
