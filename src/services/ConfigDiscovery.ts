import * as os from "os";
import type { App, TFile, TFolder } from "obsidian";
import type { MCPServerEntry, CustomAgentEntry } from "../types/settings";

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

function asServerRecord(value: unknown): Record<string, RawMCPServerEntry> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, RawMCPServerEntry>;
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

  constructor(app: App) {
    this.app = app;
  }

  /**
   * Discover all Copilot config from standard locations in the vault and user home directory.
   * Looks in:
   *   .github/skills/              — repo skills
   *   .copilot/skills/             — personal skills
   *   .github/copilot/mcp.json     — repo MCP servers
   *   .copilot/mcp.json            — personal MCP servers
   *   ~/.copilot/mcp-config.json   — global Copilot CLI MCP servers
   *   ~/.copilot/mcp.json          — global Copilot MCP servers
   *   ~/.copilot/config.json       — global Copilot config with mcpServers
   *   ~/Library/Application Support/github-copilot/mcp.json — macOS global MCP servers
   *   ~/.config/github-copilot/mcp.json — Linux global MCP servers
   *   .github/copilot-instructions.md — repo instructions
   *   .copilot/instructions/       — personal instruction files (*.md)
   *   .copilot/agents/             — personal agents (*.agent.md)
   *   .github/agents/              — repo agents (*.agent.md or *.md)
   *   ~/.copilot/agents/           — global personal agents (filesystem)
   */
  async discover(): Promise<DiscoveredConfig> {
    const [skills, mcpServers, instructions, agents] = await Promise.all([
      this.discoverSkills(),
      this.discoverMCPServers(),
      this.discoverInstructions(),
      this.discoverAgents(),
    ]);

    return { skills, mcpServers, instructions, agents };
  }

  private async discoverSkills(): Promise<string[]> {
    const directories: string[] = [];
    const candidates = [".github/skills", ".copilot/skills"];

    for (const candidate of candidates) {
      const folder = this.app.vault.getAbstractFileByPath(candidate);
      if (isVaultFolder(folder)) {
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
      const file = this.app.vault.getAbstractFileByPath(candidate);
      if (!isVaultFile(file)) {
        continue;
      }

      try {
        const content = await this.app.vault.read(file);
        this.appendMCPServers(servers, seen, JSON.parse(content), "vault");
      } catch (error) {
        console.warn(`[Copilot] Failed to parse ${candidate}:`, error);
      }
    }

    try {
      const fs = window.require("fs");
      const path = window.require("path");
      const home = os.homedir() || process.env.HOME || process.env.USERPROFILE || "";

      if (!home) {
        return servers;
      }

      const homeCandidates = [
        path.join(home, ".copilot", "mcp-config.json"),
        path.join(home, ".copilot", "mcp.json"),
        path.join(home, ".copilot", "config.json"),
        path.join(home, "Library", "Application Support", "github-copilot", "mcp.json"),
        path.join(home, ".config", "github-copilot", "mcp.json"),
      ];

      for (const candidate of homeCandidates) {
        if (!fs.existsSync(candidate)) {
          continue;
        }

        try {
          const content = fs.readFileSync(candidate, "utf-8");
          this.appendMCPServers(servers, seen, JSON.parse(content), "home");
        } catch (error) {
          console.warn(`[Copilot] Failed to parse ${candidate}:`, error);
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

        seen.add(name);
        const entry = rawConfig && typeof rawConfig === "object" && !Array.isArray(rawConfig)
          ? rawConfig as RawMCPServerEntry
          : {};

        servers.push({
          name,
          type: (entry.type === "stdio" || entry.type === "local") ? "stdio" : "http",
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

    const repoInstructions = this.app.vault.getAbstractFileByPath(".github/copilot-instructions.md");
    if (isVaultFile(repoInstructions)) {
      try {
        parts.push(await this.app.vault.read(repoInstructions));
      } catch (error) {
        console.warn("[Copilot] Failed to read .github/copilot-instructions.md:", error);
      }
    }

    const personalInstructions = this.app.vault.getAbstractFileByPath(".copilot/instructions");
    if (isVaultFolder(personalInstructions)) {
      const markdownFiles = personalInstructions.children
        .filter((child): child is TFile => isVaultFile(child) && child.extension === "md")
        .sort((left, right) => left.path.localeCompare(right.path));

      for (const file of markdownFiles) {
        try {
          parts.push(await this.app.vault.read(file));
        } catch (error) {
          console.warn(`[Copilot] Failed to read ${file.path}:`, error);
        }
      }
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

    // 1. Vault-local agents
    const vaultAgentDirs = [".copilot/agents", ".github/agents"];
    for (const dir of vaultAgentDirs) {
      const folder = this.app.vault.getAbstractFileByPath(dir);
      if (!isVaultFolder(folder)) continue;

      const mdFiles = folder.children
        .filter((child): child is TFile => isVaultFile(child) && child.extension === "md")
        .sort((left, right) => left.path.localeCompare(right.path));

      for (const file of mdFiles) {
        try {
          const content = await this.app.vault.read(file);
          const agent = this.parseAgentFile(content, file.basename);
          if (agent && !seen.has(agent.name)) {
            seen.add(agent.name);
            agents.push(agent);
          }
        } catch (error) {
          console.warn(`[Copilot] Failed to read agent ${file.path}:`, error);
        }
      }
    }

    // 2. Global personal agents from ~/.copilot/agents/
    try {
      const fs = window.require("fs");
      const path = window.require("path");
      const home = process.env.HOME || process.env.USERPROFILE || "";
      const globalAgentDirs = [
        path.join(home, ".copilot", "agents"),
      ];

      // 3. Also scan installed plugins for agents
      const pluginsDir = path.join(home, ".copilot", "installed-plugins");
      try {
        if (fs.existsSync(pluginsDir)) {
          for (const org of fs.readdirSync(pluginsDir)) {
            const orgPath = path.join(pluginsDir, org);
            if (!fs.statSync(orgPath).isDirectory()) continue;
            for (const plugin of fs.readdirSync(orgPath)) {
              const agentsDir = path.join(orgPath, plugin, "agents");
              if (fs.existsSync(agentsDir) && fs.statSync(agentsDir).isDirectory()) {
                globalAgentDirs.push(agentsDir);
              }
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
