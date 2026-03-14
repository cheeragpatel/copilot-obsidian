import { App, PluginSettingTab, Setting } from "obsidian";
import type { PluginSettings, MCPServerEntry, CustomAgentEntry } from "../types/settings";
import { DEFAULT_SETTINGS } from "../types/settings";
import { AVAILABLE_MODELS, ChatMode } from "../types/constants";

export class CopilotSettingsTab extends PluginSettingTab {
  private plugin: any; // CopilotPlugin type — avoid circular import
  private settings: PluginSettings;
  private expandedMcpServers = new Set<number>();
  private expandedCustomAgents = new Set<number>();

  constructor(app: App, plugin: any) {
    super(app, plugin);
    this.plugin = plugin;
    this.settings = plugin.settings;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    this.pruneExpandedEntries();

    // ── General ──
    containerEl.createEl("h2", { text: "General" });

    new Setting(containerEl)
      .setName("Copilot CLI path")
      .setDesc('Path to the Copilot CLI executable. Leave as "copilot" to use PATH.')
      .addText((text) =>
        text
          .setPlaceholder("copilot")
          .setValue(this.settings.cliPath)
          .onChange(async (value) => {
            this.settings.cliPath = value || DEFAULT_SETTINGS.cliPath;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Default model")
      .setDesc("The default model to use for new conversations")
      .addDropdown((dropdown) => {
        for (const model of AVAILABLE_MODELS) {
          dropdown.addOption(model, model);
        }
        dropdown.setValue(this.settings.defaultModel);
        dropdown.onChange(async (value) => {
          this.settings.defaultModel = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Streaming responses")
      .setDesc("Enable real-time streaming of responses (token by token)")
      .addToggle((toggle) =>
        toggle.setValue(this.settings.streaming).onChange(async (value) => {
          this.settings.streaming = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Open chat on startup")
      .setDesc("Automatically open the Copilot Chat panel when Obsidian starts")
      .addToggle((toggle) =>
        toggle.setValue(this.settings.openOnStartup).onChange(async (value) => {
          this.settings.openOnStartup = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Default mode")
      .setDesc("Default chat mode when opening a new conversation")
      .addDropdown((dropdown) => {
        dropdown.addOption(ChatMode.Ask, "Ask (Q&A only)");
        dropdown.addOption(ChatMode.Agent, "Agent (with vault tools)");
        dropdown.setValue(this.settings.defaultMode);
        dropdown.onChange(async (value) => {
          this.settings.defaultMode = value as ChatMode;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Auto-discover configuration")
      .setDesc(
        "Automatically load skills, MCP servers, and instructions from .github/ and .copilot/ directories in your vault",
      )
      .addToggle((toggle) =>
        toggle.setValue(this.settings.inheritConfig).onChange(async (value) => {
          this.settings.inheritConfig = value;
          await this.plugin.saveSettings();
        }),
      );

    // ── MCP Servers ──
    containerEl.createEl("h2", { text: "MCP Servers" });
    containerEl.createEl("p", {
      text: "Configure Model Context Protocol servers for additional tool capabilities.",
      cls: "setting-item-description",
    });
    this.renderMcpServersSection(containerEl);

    // ── Custom Agents ──
    containerEl.createEl("h2", { text: "Custom Agents" });
    containerEl.createEl("p", {
      text: "Define specialized AI personas for specific tasks.",
      cls: "setting-item-description",
    });
    this.renderCustomAgentsSection(containerEl);

    // ── Skills ──
    containerEl.createEl("h2", { text: "Skills" });

    new Setting(containerEl)
      .setName("Skill directories")
      .setDesc("Comma-separated list of directories containing skill definitions")
      .addTextArea((text) =>
        text
          .setPlaceholder(".github/skills, .copilot/skills")
          .setValue(this.settings.skillDirectories.join(", "))
          .onChange(async (value) => {
            this.settings.skillDirectories = value
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Disabled skills")
      .setDesc("Comma-separated list of skill names to disable")
      .addTextArea((text) =>
        text
          .setPlaceholder("skill-name-1, skill-name-2")
          .setValue(this.settings.disabledSkills.join(", "))
          .onChange(async (value) => {
            this.settings.disabledSkills = value
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            await this.plugin.saveSettings();
          }),
      );

    // ── Advanced ──
    containerEl.createEl("h2", { text: "Advanced" });

    new Setting(containerEl)
      .setName("Excluded tools")
      .setDesc("Comma-separated list of tool names to disable in agent mode")
      .addTextArea((text) =>
        text
          .setPlaceholder("tool1, tool2")
          .setValue(this.settings.excludedTools.join(", "))
          .onChange(async (value) => {
            this.settings.excludedTools = value
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("System message")
      .setDesc("Additional system instructions appended to the default system prompt")
      .addTextArea((text) =>
        text
          .setPlaceholder("You are a helpful assistant for my Obsidian vault...")
          .setValue(this.settings.systemMessage)
          .onChange(async (value) => {
            this.settings.systemMessage = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Log level")
      .setDesc("Copilot SDK logging verbosity")
      .addDropdown((dropdown) => {
        dropdown.addOption("debug", "Debug");
        dropdown.addOption("info", "Info");
        dropdown.addOption("warn", "Warning");
        dropdown.addOption("error", "Error");
        dropdown.setValue(this.settings.logLevel);
        dropdown.onChange(async (value) => {
          this.settings.logLevel = value as PluginSettings["logLevel"];
          await this.plugin.saveSettings();
        });
      });
  }

  private renderMcpServersSection(containerEl: HTMLElement): void {
    const listEl = containerEl.createDiv({ cls: "copilot-settings-list" });

    this.settings.mcpServers.forEach((server, index) => {
      const itemEl = document.createElement("div");
      itemEl.className = "copilot-settings-entry copilot-settings-mcp-server";
      listEl.appendChild(itemEl);

      const header = new Setting(itemEl);
      const updateHeader = () => {
        header.setName(`${this.expandedMcpServers.has(index) ? "▼" : "▶"} ${server.name || "Untitled server"}`);
        header.setDesc(this.getMcpServerSummary(server));
      };

      updateHeader();
      this.bindExpandableHeader(header, () => {
        this.toggleExpanded(this.expandedMcpServers, index);
      });

      if (!this.expandedMcpServers.has(index)) {
        return;
      }

      const detailsEl = document.createElement("div");
      detailsEl.className = "copilot-settings-entry-details";
      itemEl.appendChild(detailsEl);

      new Setting(detailsEl).setName("Name").addText((text) =>
        text
          .setPlaceholder("filesystem")
          .setValue(server.name)
          .onChange(async (value) => {
            this.settings.mcpServers[index].name = value;
            updateHeader();
            await this.plugin.saveSettings();
          }),
      );

      new Setting(detailsEl).setName("Type").addDropdown((dropdown) => {
        dropdown.addOption("http", "http");
        dropdown.addOption("stdio", "stdio");
        dropdown.setValue(server.type);
        dropdown.onChange(async (value) => {
          const nextType = value as MCPServerEntry["type"];
          this.settings.mcpServers[index].type = nextType;
          if (nextType === "http" && !this.settings.mcpServers[index].url) {
            this.settings.mcpServers[index].url = "https://";
          }
          if (nextType === "stdio") {
            this.settings.mcpServers[index].command = this.settings.mcpServers[index].command || "";
            this.settings.mcpServers[index].args = this.settings.mcpServers[index].args || [];
          }
          await this.plugin.saveSettings();
          this.display();
        });
      });

      if (server.type === "http") {
        new Setting(detailsEl).setName("URL").addText((text) =>
          text
            .setPlaceholder("https://example.com/mcp")
            .setValue(server.url || "")
            .onChange(async (value) => {
              this.settings.mcpServers[index].url = value;
              updateHeader();
              await this.plugin.saveSettings();
            }),
        );
      } else {
        new Setting(detailsEl).setName("Command").addText((text) =>
          text
            .setPlaceholder("npx @modelcontextprotocol/server-filesystem /vault")
            .setValue(server.command || "")
            .onChange(async (value) => {
              this.settings.mcpServers[index].command = value;
              updateHeader();
              await this.plugin.saveSettings();
            }),
        );

        new Setting(detailsEl).setName("Args").addText((text) =>
          text
            .setPlaceholder("--flag value \"quoted value\"")
            .setValue(this.formatArgs(server.args))
            .onChange(async (value) => {
              this.settings.mcpServers[index].args = this.parseArgs(value);
              updateHeader();
              await this.plugin.saveSettings();
            }),
        );
      }

      new Setting(detailsEl)
        .setName("Enabled")
        .setDesc("Enable this MCP server for Copilot sessions")
        .addToggle((toggle) =>
          toggle.setValue(server.enabled).onChange(async (value) => {
            this.settings.mcpServers[index].enabled = value;
            await this.plugin.saveSettings();
          }),
        );

      new Setting(detailsEl)
        .setName("Delete")
        .setDesc("Remove this MCP server configuration")
        .addButton((btn) =>
          btn.setButtonText("Delete").onClick(async () => {
            await this.removeIndexedEntry(this.settings.mcpServers, this.expandedMcpServers, index);
          }),
        );
    });

    new Setting(containerEl).setName("Add MCP server").addButton((btn) =>
      btn.setButtonText("Add").onClick(async () => {
        this.settings.mcpServers.push({
          name: "new-server",
          type: "http",
          url: "https://",
          enabled: true,
        });
        this.expandedMcpServers.add(this.settings.mcpServers.length - 1);
        await this.plugin.saveSettings();
        this.display();
      }),
    );
  }

  private renderCustomAgentsSection(containerEl: HTMLElement): void {
    const listEl = containerEl.createDiv({ cls: "copilot-settings-list" });

    this.settings.customAgents.forEach((agent, index) => {
      const itemEl = document.createElement("div");
      itemEl.className = "copilot-settings-entry copilot-settings-custom-agent";
      listEl.appendChild(itemEl);

      const header = new Setting(itemEl);
      const updateHeader = () => {
        header.setName(`${this.expandedCustomAgents.has(index) ? "▼" : "▶"} @${agent.name || "unnamed-agent"}`);
        header.setDesc(this.getCustomAgentSummary(agent));
      };

      updateHeader();
      this.bindExpandableHeader(header, () => {
        this.toggleExpanded(this.expandedCustomAgents, index);
      });

      if (!this.expandedCustomAgents.has(index)) {
        return;
      }

      const detailsEl = document.createElement("div");
      detailsEl.className = "copilot-settings-entry-details";
      itemEl.appendChild(detailsEl);

      new Setting(detailsEl).setName("Name").addText((text) =>
        text
          .setPlaceholder("my-agent")
          .setValue(agent.name)
          .onChange(async (value) => {
            this.settings.customAgents[index].name = value;
            updateHeader();
            await this.plugin.saveSettings();
          }),
      );

      new Setting(detailsEl).setName("Display Name").addText((text) =>
        text
          .setPlaceholder("My Agent")
          .setValue(agent.displayName)
          .onChange(async (value) => {
            this.settings.customAgents[index].displayName = value;
            updateHeader();
            await this.plugin.saveSettings();
          }),
      );

      new Setting(detailsEl).setName("Description").addTextArea((text) =>
        text
          .setPlaceholder("Describe what this agent is best at")
          .setValue(agent.description)
          .onChange(async (value) => {
            this.settings.customAgents[index].description = value;
            updateHeader();
            await this.plugin.saveSettings();
          }),
      );

      new Setting(detailsEl).setName("Prompt/Instructions").addTextArea((text) =>
        text
          .setPlaceholder("You are a helpful assistant.")
          .setValue(agent.prompt)
          .onChange(async (value) => {
            this.settings.customAgents[index].prompt = value;
            updateHeader();
            await this.plugin.saveSettings();
          }),
      );

      new Setting(detailsEl)
        .setName("Enabled")
        .setDesc("Enable this custom agent in Copilot sessions")
        .addToggle((toggle) =>
          toggle.setValue(agent.enabled).onChange(async (value) => {
            this.settings.customAgents[index].enabled = value;
            await this.plugin.saveSettings();
          }),
        );

      new Setting(detailsEl)
        .setName("Delete")
        .setDesc("Remove this custom agent")
        .addButton((btn) =>
          btn.setButtonText("Delete").onClick(async () => {
            await this.removeIndexedEntry(this.settings.customAgents, this.expandedCustomAgents, index);
          }),
        );
    });

    new Setting(containerEl).setName("Add custom agent").addButton((btn) =>
      btn.setButtonText("Add").onClick(async () => {
        this.settings.customAgents.push({
          name: "my-agent",
          displayName: "My Agent",
          description: "A custom agent",
          prompt: "You are a helpful assistant.",
          enabled: true,
        });
        this.expandedCustomAgents.add(this.settings.customAgents.length - 1);
        await this.plugin.saveSettings();
        this.display();
      }),
    );
  }

  private bindExpandableHeader(header: Setting, onToggle: () => void): void {
    header.settingEl.classList.add("copilot-settings-entry-header");
    header.settingEl.style.cursor = "pointer";
    header.settingEl.tabIndex = 0;
    header.settingEl.setAttribute("role", "button");

    header.settingEl.addEventListener("click", (event) => {
      if (event.target instanceof HTMLElement && event.target.closest("input, textarea, select, button")) {
        return;
      }
      onToggle();
    });

    header.settingEl.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      onToggle();
    });
  }

  private toggleExpanded(expandedEntries: Set<number>, index: number): void {
    if (expandedEntries.has(index)) {
      expandedEntries.delete(index);
    } else {
      expandedEntries.add(index);
    }
    this.display();
  }

  private pruneExpandedEntries(): void {
    this.expandedMcpServers = this.pruneExpandedIndexes(
      this.expandedMcpServers,
      this.settings.mcpServers.length,
    );
    this.expandedCustomAgents = this.pruneExpandedIndexes(
      this.expandedCustomAgents,
      this.settings.customAgents.length,
    );
  }

  private pruneExpandedIndexes(expandedEntries: Set<number>, length: number): Set<number> {
    return new Set([...expandedEntries].filter((index) => index >= 0 && index < length));
  }

  private async removeIndexedEntry<T>(entries: T[], expandedEntries: Set<number>, index: number): Promise<void> {
    entries.splice(index, 1);
    const nextExpandedEntries = new Set<number>();

    for (const expandedIndex of expandedEntries) {
      if (expandedIndex === index) {
        continue;
      }
      nextExpandedEntries.add(expandedIndex > index ? expandedIndex - 1 : expandedIndex);
    }

    if (entries === this.settings.mcpServers) {
      this.expandedMcpServers = nextExpandedEntries;
    } else {
      this.expandedCustomAgents = nextExpandedEntries;
    }

    await this.plugin.saveSettings();
    this.display();
  }

  private getMcpServerSummary(server: MCPServerEntry): string {
    if (server.type === "http") {
      return server.url || "HTTP MCP server";
    }

    const command = [server.command, this.formatArgs(server.args)].filter(Boolean).join(" ").trim();
    return command || "Stdio MCP server";
  }

  private getCustomAgentSummary(agent: CustomAgentEntry): string {
    return agent.description || agent.displayName || agent.prompt || "Custom agent";
  }

  private formatArgs(args?: string[]): string {
    return (args || [])
      .map((arg) => (/[\s"']/.test(arg) ? JSON.stringify(arg) : arg))
      .join(" ");
  }

  private parseArgs(value: string): string[] {
    const trimmed = value.trim();
    if (!trimmed) {
      return [];
    }

    const args: string[] = [];
    const pattern = /"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|(\S+)/g;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(trimmed)) !== null) {
      const token = match[1] ?? match[2] ?? match[3] ?? "";
      args.push(token.replace(/\\([\\"'])/g, "$1"));
    }

    return args;
  }
}
