import * as React from "react";
import { Root, createRoot } from "react-dom/client";
import { ItemView, WorkspaceLeaf } from "obsidian";
import { COPILOT_CHAT_VIEW_TYPE } from "../types/constants";
import { CopilotChatPanel } from "../components/CopilotChatPanel";

// Context for passing plugin reference to React components
export interface CopilotPluginContext {
  app: any;
  settings: any;
  copilotService: any;
  saveSettings: () => Promise<void>;
}

export const PluginContext = React.createContext<CopilotPluginContext | null>(null);

export class CopilotChatView extends ItemView {
  private root: Root | null = null;
  private plugin: any;

  constructor(leaf: WorkspaceLeaf, plugin: any) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return COPILOT_CHAT_VIEW_TYPE;
  }

  getIcon(): string {
    return "bot-message-square";
  }

  getDisplayText(): string {
    return "Copilot Chat";
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1];
    container.empty();

    this.root = createRoot(container);
    this.root.render(
      <React.StrictMode>
        <PluginContext.Provider
          value={{
            app: this.plugin.app,
            settings: this.plugin.settings,
            copilotService: this.plugin.copilotService,
            saveSettings: () => this.plugin.saveSettings(),
          }}
        >
          <CopilotChatPanel />
        </PluginContext.Provider>
      </React.StrictMode>,
    );
  }

  async onClose(): Promise<void> {
    if (this.root) {
      this.root.unmount();
      this.root = null;
    }
  }
}
