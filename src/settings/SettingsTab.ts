import { App, PluginSettingTab, Setting } from "obsidian";
import type { PluginSettings, MCPServerEntry, CustomAgentEntry } from "../types/settings";
import { DEFAULT_SETTINGS } from "../types/settings";
import { AVAILABLE_MODELS, ChatMode } from "../types/constants";

export class CopilotSettingsTab extends PluginSettingTab {
  private plugin: any; // CopilotPlugin type — avoid circular import
  private settings: PluginSettings;

  constructor(app: App, plugin: any) {
    super(app, plugin);
    this.plugin = plugin;
    this.settings = plugin.settings;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

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

    // ── MCP Servers ──
    containerEl.createEl("h2", { text: "MCP Servers" });
    containerEl.createEl("p", {
      text: "Configure Model Context Protocol servers for additional tool capabilities.",
      cls: "setting-item-description",
    });

    for (let i = 0; i < this.settings.mcpServers.length; i++) {
      const server = this.settings.mcpServers[i];
      const serverContainer = containerEl.createDiv({ cls: "copilot-settings-mcp-server" });

      new Setting(serverContainer)
        .setName(`Server: ${server.name}`)
        .setDesc(`Type: ${server.type} | ${server.type === "http" ? server.url : server.command}`)
        .addToggle((toggle) =>
          toggle.setValue(server.enabled).onChange(async (value) => {
            this.settings.mcpServers[i].enabled = value;
            await this.plugin.saveSettings();
          }),
        )
        .addExtraButton((btn) =>
          btn.setIcon("trash").setTooltip("Remove").onClick(async () => {
            this.settings.mcpServers.splice(i, 1);
            await this.plugin.saveSettings();
            this.display();
          }),
        );
    }

    new Setting(containerEl).setName("Add MCP server").addButton((btn) =>
      btn.setButtonText("Add").onClick(async () => {
        this.settings.mcpServers.push({
          name: "new-server",
          type: "http",
          url: "https://",
          enabled: true,
        });
        await this.plugin.saveSettings();
        this.display();
      }),
    );

    // ── Custom Agents ──
    containerEl.createEl("h2", { text: "Custom Agents" });
    containerEl.createEl("p", {
      text: "Define specialized AI personas for specific tasks.",
      cls: "setting-item-description",
    });

    for (let i = 0; i < this.settings.customAgents.length; i++) {
      const agent = this.settings.customAgents[i];

      new Setting(containerEl)
        .setName(`@${agent.name}`)
        .setDesc(agent.description || agent.displayName)
        .addToggle((toggle) =>
          toggle.setValue(agent.enabled).onChange(async (value) => {
            this.settings.customAgents[i].enabled = value;
            await this.plugin.saveSettings();
          }),
        )
        .addExtraButton((btn) =>
          btn.setIcon("trash").setTooltip("Remove").onClick(async () => {
            this.settings.customAgents.splice(i, 1);
            await this.plugin.saveSettings();
            this.display();
          }),
        );
    }

    new Setting(containerEl).setName("Add custom agent").addButton((btn) =>
      btn.setButtonText("Add").onClick(async () => {
        this.settings.customAgents.push({
          name: "my-agent",
          displayName: "My Agent",
          description: "A custom agent",
          prompt: "You are a helpful assistant.",
          enabled: true,
        });
        await this.plugin.saveSettings();
        this.display();
      }),
    );

    // ── Skills ──
    containerEl.createEl("h2", { text: "Skills" });

    new Setting(containerEl)
      .setName("Skill directories")
      .setDesc("Comma-separated list of directories containing skill definitions")
      .addTextArea((text) =>
        text
          .setPlaceholder("/path/to/skills")
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
}
