import { Notice, Plugin, WorkspaceLeaf } from "obsidian";
import { CopilotService } from "./services/CopilotService";
import { CopilotChatView } from "./views/CopilotChatView";
import { CopilotSettingsTab } from "./settings/SettingsTab";
import { COPILOT_CHAT_VIEW_TYPE } from "./types/constants";
import type { PluginSettings } from "./types/settings";
import { DEFAULT_SETTINGS } from "./types/settings";
import { clearSessionPermissions } from "./views/PermissionModal";

export default class CopilotPlugin extends Plugin {
  settings: PluginSettings = DEFAULT_SETTINGS;
  copilotService: CopilotService;

  async onload() {
    await this.loadSettings();

    this.copilotService = new CopilotService(this.app, this.settings);

    // Register the chat view
    this.registerView(
      COPILOT_CHAT_VIEW_TYPE,
      (leaf) => new CopilotChatView(leaf, this),
    );

    // Add ribbon icon
    this.addRibbonIcon("bot-message-square", "Open Copilot Chat", () => {
      this.activateView();
    });

    // Register commands
    this.addCommand({
      id: "open-copilot-chat",
      name: "Open Copilot Chat",
      hotkeys: [{ modifiers: ["Mod", "Shift"], key: "l" }],
      callback: () => {
        this.activateView();
      },
    });

    this.addCommand({
      id: "new-copilot-conversation",
      name: "New Copilot Conversation",
      callback: () => {
        this.activateView();
        // The view will handle creating a new conversation
      },
    });

    // Add settings tab
    this.addSettingTab(new CopilotSettingsTab(this.app, this));

    // Open chat sidebar when the layout is ready if openOnStartup is set
    this.app.workspace.onLayoutReady(() => {
      if (this.settings.openOnStartup) {
        this.activateView();
      }
    });
  }

  async onunload() {
    // Clear session-scoped permission cache
    clearSessionPermissions();

    // Clean up the copilot service
    if (this.copilotService) {
      try {
        await this.copilotService.destroy();
      } catch {
        // Ignore cleanup errors
      }
    }

    // Detach all chat view leaves
    this.app.workspace.detachLeavesOfType(COPILOT_CHAT_VIEW_TYPE);
  }

  async activateView(): Promise<void> {
    const { workspace } = this.app;

    let leaf: WorkspaceLeaf | null = null;
    const leaves = workspace.getLeavesOfType(COPILOT_CHAT_VIEW_TYPE);

    if (leaves.length > 0) {
      leaf = leaves[0];
    } else {
      // getRightLeaf(false) can return null if no right panel exists
      // Use getRightLeaf(true) to split/create a new leaf in the right sidebar
      const rightLeaf = workspace.getRightLeaf(false);
      if (rightLeaf) {
        leaf = rightLeaf;
      } else {
        // Fallback: create a new leaf in the right split
        leaf = workspace.getLeaf("split", "vertical");
      }
      if (leaf) {
        await leaf.setViewState({
          type: COPILOT_CHAT_VIEW_TYPE,
          active: true,
        });
      }
    }

    if (leaf) {
      workspace.revealLeaf(leaf);
    }
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
    // Update service with new settings
    if (this.copilotService) {
      this.copilotService.updateSettings(this.settings);
    }
  }
}
