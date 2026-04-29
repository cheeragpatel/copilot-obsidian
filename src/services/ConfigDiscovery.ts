import * as os from "os";
import type { App, TFile, TFolder } from "obsidian";
import type { MCPServerEntry, CustomAgentEntry } from "../types/settings";
import { Logger } from "../utils/Logger";

export interface DiscoveredConfig {
  skills: string[];
  mcpServers: MCPServerEntry[];
  instructions: string;
  agents: CustomAgentEntry[];
}

function isVaultFile(entry: unknown): entry is TFile {
  return !!entry && typeof entry === "object" && "extension" in entry;
}

function isVaultFolder(entry: unknown): entry is TFolder {
  return !!entry && typeof entry === "object" && "children" in entry;
}

type MCPServerSource = NonNullable<MCPServerEntry["source"]>;

interface RawMCPServerEntry {
  type?: string;
  url?: string;
  command?: string;
  args?: unknown;
  env?: unknown;
  headers?: unknown;
  tools?: unknown;
}

const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function asServerRecord(value: unknown): Record<string, RawMCPServerEntry> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const record: Record<string, RawMCPServerEntry> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (DANGEROUS_KEYS.has(key)) continue;
    record[key] = entry as RawMCPServerEntry;
  }
  return record;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    return undefined;
  }

  return value;
}

function asStringRecord(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const entries = Object.entries(value);
  if (entries.some(([, entryValue]) => typeof entryValue !== "string")) {
    return undefined;
  }

  return Object.fromEntries(entries) as Record<string, string>;
}

/**
 * Parse YAML frontmatter from a `.agent.md` file.
 * Handles simple key: "value" pairs without pulling in a YAML library.
 */
function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const result: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const kv = line.match(/^(\w[\w-]*):\s*"?([\s\S]*?)"?\s*$/);
    if (kv) {
      result[kv[1]] = kv[2].replace(/\\n/g, "\n").replace(/^"|"$/g, "");
    }
  }
  return result;
}

export class ConfigDiscovery {
  private app: App;
  private cache?: { result: DiscoveredConfig; timestamp: number };
  private static readonly CACHE_TTL_MS = 5000;

  constructor(app: App, private logger: typeof Logger = Logger) {
    this.app = app;
    this.logger.debug("[ConfigDiscovery] Initialized");
  }

  /**
   * Drop the cached discovery result so the next discover() call re-reads
   * the filesystem. Called when settings change or files are added/removed.
   */
  invalidate(): void {
    this.cache = undefined;
  }

  /**
   * Return the vault DataAdapter if it exposes the methods we need. Used as a
   * fallback for hidden vault folders (.github, .copilot) that Obsidian's
   * vault index does not surface via getAbstractFileByPath.
   */
  private getAdapter(): {
    list: (path: string) => Promise<{ files: string[]; folders: string[] }>;
    read: (path: string) => Promise<string>;
    exists: (path: string) => Promise<boolean>;
  } | null {
    const adapter = this.app.vault.adapter as
      | {
          list?: (path: string) => Promise<{ files: string[]; folders: string[] }>;
          read?: (path: string) => Promise<string>;
          exists?: (path: string) => Promise<boolean>;
        }
      | undefined;
    if (!adapter || !adapter.list || !adapter.read || !adapter.exists) return null;
    return adapter as {
      list: (path: string) => Promise<{ files: string[]; folders: string[] }>;
      read: (path: string) => Promise<string>;
      exists: (path: string) => Promise<boolean>;
    };
  }

  /** True if a vault folder exists, checking the index first and adapter as fallback. */
  private async vaultFolderExists(path: string): Promise<boolean> {
    if (isVaultFolder(this.app.vault.getAbstractFileByPath(path))) return true;
    const adapter = this.getAdapter();
    if (!adapter) return false;
    try {
      return await adapter.exists(path);
    } catch {
      return false;
    }
  }

  /** Read a vault file, falling back to the adapter when the index doesn't see it. */
  private async readVaultFile(path: string): Promise<string | null> {
    const indexed = this.app.vault.getAbstractFileByPath(path);
    if (isVaultFile(indexed)) {
      try {
        return await this.app.vault.read(indexed);
      } catch (error) {
        this.logger.warn(`[ConfigDiscovery] Failed to read ${path}:`, (error as Error)?.message || "Unknown error");
        return null;
      }
    }
    const adapter = this.getAdapter();
    if (!adapter) return null;
    try {
      if (!(await adapter.exists(path))) return null;
      return await adapter.read(path);
    } catch (error) {
      this.logger.warn(`[ConfigDiscovery] Failed to read ${path}:`, (error as Error)?.message || "Unknown error");
      return null;
    }
  }

  /** List markdown file paths inside a vault folder, with adapter fallback. */
  private async listVaultMarkdown(folderPath: string): Promise<string[]> {
    const folder = this.app.vault.getAbstractFileByPath(folderPath);
    if (isVaultFolder(folder)) {
      return folder.children
        .filter((child): child is TFile => isVaultFile(child) && child.extension === "md")
        .map((file) => file.path)
        .sort((left, right) => left.localeCompare(right));
    }
    const adapter = this.getAdapter();
    if (!adapter) return [];
    try {
      if (!(await adapter.exists(folderPath))) return [];
      const listing = await adapter.list(folderPath);
      return listing.files.filter((p) => p.endsWith(".md")).sort((a, b) => a.localeCompare(b));
    } catch {
      return [];
    }
  }

  /**
   * Discover all Copilot config from standard locations in the vault and user home directory.
   * Looks in:
   *   .github/skills/              — repo skills
   *   .copilot/skills/             — personal skills
   *   .github/copilot/mcp.json     — repo MCP servers
   *   .copilot/mcp.json            — personal MCP servers
   *   $HOME/.copilot/mcp-config.json — global Copilot CLI MCP servers (all OS)
   *   $HOME/.copilot/mcp.json        — global Copilot MCP servers (all OS)
   *   $HOME/.copilot/config.json     — global Copilot config with mcpServers (all OS)
   *   $HOME/Library/Application Support/github-copilot/mcp.json — macOS global MCP servers
   *   $HOME/.config/github-copilot/mcp.json — Linux global MCP servers
   *   .github/copilot-instructions.md — repo instructions
   *   .copilot/instructions/       — personal instruction files (*.md)
   *   .copilot/agents/             — personal agents (*.agent.md)
   *   .github/agents/              — repo agents (*.agent.md or *.md)
   *   $HOME/.copilot/agents/       — global personal agents (filesystem)
   */
  async discover(): Promise<DiscoveredConfig> {
    const now = Date.now();
    if (this.cache && now - this.cache.timestamp < ConfigDiscovery.CACHE_TTL_MS) {
      return this.cache.result;
    }

    const [skills, mcpServers, instructions, agents] = await Promise.all([
      this.discoverSkills(),
      this.discoverMCPServers(),
      this.discoverInstructions(),
      this.discoverAgents(),
    ]);

    const result = { skills, mcpServers, instructions, agents };
    this.cache = { result, timestamp: now };
    return result;
  }

  private async discoverSkills(): Promise<string[]> {
    const directories: string[] = [];
    const candidates = [".github/skills", ".copilot/skills"];

    for (const candidate of candidates) {
      if (await this.vaultFolderExists(candidate)) {
        directories.push(candidate);
      }
    }

    return directories;
  }

  private async discoverMCPServers(): Promise<MCPServerEntry[]> {
    const servers: MCPServerEntry[] = [];
    const seen = new Set<string>();
    const vaultCandidates = [".github/copilot/mcp.json", ".copilot/mcp.json"];

    for (const candidate of vaultCandidates) {
      const content = await this.readVaultFile(candidate);
      if (content === null) continue;

      try {
        this.appendMCPServers(servers, seen, JSON.parse(content), "vault");
      } catch (error) {
        this.logger.warn(`[ConfigDiscovery] Failed to parse ${candidate}:`, (error as Error)?.message || "Unknown error");
      }
    }

    try {
      const fs = window.require("fs");
      const path = window.require("path");
      const home = os.homedir();
      if (!home || !path.isAbsolute(home)) {
        return servers;
      }

      // Copilot's primary global config lives under $HOME/.copilot on all platforms.
      const homeCandidates = [
        path.join(home, ".copilot", "mcp-config.json"),
        path.join(home, ".copilot", "mcp.json"),
        path.join(home, ".copilot", "config.json"),
      ];

      // Legacy platform-specific fallback locations used by some setups.
      const legacyCandidates = [
        path.join(home, "Library", "Application Support", "github-copilot", "mcp.json"),
        path.join(home, ".config", "github-copilot", "mcp.json"),
      ].filter(Boolean);

      for (const candidate of [...homeCandidates, ...legacyCandidates]) {
        if (!fs.existsSync(candidate)) {
          continue;
        }

        try {
          const content = fs.readFileSync(candidate, "utf-8");
          this.appendMCPServers(servers, seen, JSON.parse(content), "home");
        } catch (error) {
          this.logger.warn(`[ConfigDiscovery] Failed to parse ${candidate}:`, (error as Error)?.message || "Unknown error");
        }
      }
    } catch {
      // fs not available (non-Electron) — skip filesystem discovery
    }

    return servers;
  }

  private appendMCPServers(
    servers: MCPServerEntry[],
    seen: Set<string>,
    parsed: unknown,
    source: MCPServerSource,
  ): void {
    const config = parsed && typeof parsed === "object"
      ? parsed as { servers?: unknown; mcpServers?: unknown }
      : {};

    for (const serverEntries of [asServerRecord(config.servers), asServerRecord(config.mcpServers)]) {
      for (const [name, rawConfig] of Object.entries(serverEntries)) {
        if (seen.has(name)) {
          continue;
        }

        const entry = rawConfig && typeof rawConfig === "object" && !Array.isArray(rawConfig)
          ? rawConfig as RawMCPServerEntry
          : {};

        const type: "stdio" | "http" =
          (entry.type === "stdio" || entry.type === "local") ? "stdio" : "http";

        // Validate transport requirements: an HTTP server needs a URL,
        // a stdio server needs a command. Skip silently-broken entries
        // so a typo in one server doesn't sink the whole config.
        if (type === "http" && !entry.url) {
          this.logger.warn(`[ConfigDiscovery] Skipping MCP server "${name}": http transport requires a url`);
          continue;
        }
        if (type === "stdio" && !entry.command) {
          this.logger.warn(`[ConfigDiscovery] Skipping MCP server "${name}": stdio transport requires a command`);
          continue;
        }

        seen.add(name);
        servers.push({
          name,
          type,
          url: entry.url,
          command: entry.command,
          args: asStringArray(entry.args),
          env: asStringRecord(entry.env),
          headers: asStringRecord(entry.headers),
          configTools: asStringArray(entry.tools),
          enabled: true,
          source,
        });
      }
    }
  }

  private async discoverInstructions(): Promise<string> {
    const parts: string[] = [];

    const repo = await this.readVaultFile(".github/copilot-instructions.md");
    if (repo !== null) parts.push(repo);

    const personalPaths = await this.listVaultMarkdown(".copilot/instructions");
    for (const filePath of personalPaths) {
      const content = await this.readVaultFile(filePath);
      if (content !== null) parts.push(content);
    }

    return parts.join("\n\n");
  }

  /**
   * Discover agents from:
   *   1. Vault: .copilot/agents/*.agent.md, .github/agents/*.md
   *   2. Filesystem (global): ~/.copilot/agents/*.agent.md
   *   3. Installed plugins: ~/.copilot/installed-plugins/ * /agents/*.md
   */
  async discoverAgents(): Promise<CustomAgentEntry[]> {
    const agents: CustomAgentEntry[] = [];
    const seen = new Set<string>();

    // 1. Vault-local agents. listVaultMarkdown handles hidden vault folders
    // (.github, .copilot) by falling back to the DataAdapter when the vault
    // index doesn't surface them.
    const vaultAgentDirs = [".copilot/agents", ".github/agents"];
    for (const dir of vaultAgentDirs) {
      const filePaths = await this.listVaultMarkdown(dir);
      for (const filePath of filePaths) {
        const content = await this.readVaultFile(filePath);
        if (content === null) continue;
        const basename = (filePath.split("/").pop() || filePath).replace(/\.md$/, "");
        const agent = this.parseAgentFile(content, basename);
        if (agent && !seen.has(agent.name)) {
          seen.add(agent.name);
          agents.push(agent);
        }
      }
    }

    // 2. Global personal agents from $HOME/.copilot/agents/
    try {
      const fs = window.require("fs");
      const path = window.require("path");
      const home = os.homedir();
      if (!home || !path.isAbsolute(home)) {
        return agents;
      }
      const globalAgentDirs = [
        path.join(home, ".copilot", "agents"),
      ];

      // 3. Also scan installed plugins for agents
      const pluginsDir = path.join(home, ".copilot", "installed-plugins");
      try {
        if (fs.existsSync(pluginsDir)) {
          for (const org of fs.readdirSync(pluginsDir)) {
            try {
              const orgPath = path.join(pluginsDir, org);
              if (!fs.statSync(orgPath).isDirectory()) continue;
              for (const plugin of fs.readdirSync(orgPath)) {
                try {
                  const agentsDir = path.join(orgPath, plugin, "agents");
                  if (fs.existsSync(agentsDir) && fs.statSync(agentsDir).isDirectory()) {
                    globalAgentDirs.push(agentsDir);
                  }
                } catch {
                  // Skip individual plugin scan errors
                }
              }
            } catch {
              // Skip individual org scan errors
            }
          }
        }
      } catch {
        // Ignore installed-plugins scan errors
      }

      for (const dir of globalAgentDirs) {
        if (!fs.existsSync(dir)) continue;
        const files: string[] = fs.readdirSync(dir);
        for (const filename of files) {
          if (!filename.endsWith(".md")) continue;
          const fullPath = path.join(dir, filename);
          try {
            const content = fs.readFileSync(fullPath, "utf-8");
            const basename = filename.replace(/\.agent\.md$/, "").replace(/\.md$/, "");
            const agent = this.parseAgentFile(content, basename);
            if (agent && !seen.has(agent.name)) {
              seen.add(agent.name);
              agents.push(agent);
            }
          } catch {
            // Skip unreadable files
          }
        }
      }
    } catch {
      // fs not available (non-Electron) — skip filesystem discovery
    }

    return agents;
  }

  private parseAgentFile(content: string, fallbackName: string): CustomAgentEntry | null {
    const fm = parseFrontmatter(content);
    const name = fm.name || fallbackName;
    if (!name) return null;

    // Extract body (after frontmatter) for the prompt
    const bodyMatch = content.match(/^---[\s\S]*?---\r?\n([\s\S]*)$/);
    const body = bodyMatch ? bodyMatch[1].trim() : content.trim();

    return {
      name: name.toLowerCase().replace(/\s+/g, "-"),
      displayName: fm.name || fallbackName.replace(/-/g, " ").replace(/\.agent$/, ""),
      description: (fm.description || "").substring(0, 200) || `Agent: ${name}`,
      prompt: body || `You are the ${name} agent.`,
      enabled: true,
    };
  }
}
