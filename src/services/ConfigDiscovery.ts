import type { App, TFile, TFolder } from "obsidian";
import type { MCPServerEntry } from "../types/settings";

export interface DiscoveredConfig {
  skills: string[];
  mcpServers: MCPServerEntry[];
  instructions: string;
}

function isVaultFile(entry: unknown): entry is TFile {
  return !!entry && typeof entry === "object" && "extension" in entry;
}

function isVaultFolder(entry: unknown): entry is TFolder {
  return !!entry && typeof entry === "object" && "children" in entry;
}

export class ConfigDiscovery {
  private app: App;

  constructor(app: App) {
    this.app = app;
  }

  /**
   * Discover all Copilot config from standard locations in the vault.
   * Looks in:
   *   .github/skills/              — repo skills
   *   .copilot/skills/             — personal skills
   *   .github/copilot/mcp.json     — repo MCP servers
   *   .copilot/mcp.json            — personal MCP servers
   *   .github/copilot-instructions.md — repo instructions
   *   .copilot/instructions/       — personal instruction files (*.md)
   */
  async discover(): Promise<DiscoveredConfig> {
    const [skills, mcpServers, instructions] = await Promise.all([
      this.discoverSkills(),
      this.discoverMCPServers(),
      this.discoverInstructions(),
    ]);

    return { skills, mcpServers, instructions };
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
    const candidates = [".github/copilot/mcp.json", ".copilot/mcp.json"];

    for (const candidate of candidates) {
      const file = this.app.vault.getAbstractFileByPath(candidate);
      if (!isVaultFile(file)) {
        continue;
      }

      try {
        const content = await this.app.vault.read(file);
        const parsed = JSON.parse(content) as {
          servers?: Record<string, Partial<MCPServerEntry>>;
          mcpServers?: Record<string, Partial<MCPServerEntry>>;
        };
        const serverEntries = parsed.servers || parsed.mcpServers || {};

        for (const [name, config] of Object.entries(serverEntries)) {
          servers.push({
            name,
            type: config.type === "stdio" ? "stdio" : "http",
            url: config.url,
            command: config.command,
            args: config.args,
            env: config.env,
            enabled: true,
          });
        }
      } catch (error) {
        console.warn(`[Copilot] Failed to parse ${candidate}:`, error);
      }
    }

    return servers;
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
}
