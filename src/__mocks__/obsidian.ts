// Mock Obsidian API for testing
import { vi } from "vitest";

export class Plugin {
  app: any = {};
  manifest: any = {};
  addSettingTab = vi.fn();
  addRibbonIcon = vi.fn();
  addCommand = vi.fn();
  registerView = vi.fn();
  registerEditorExtension = vi.fn();
  loadData = vi.fn().mockResolvedValue({});
  saveData = vi.fn().mockResolvedValue(undefined);
}

export class PluginSettingTab {
  app: any;
  plugin: any;
  containerEl: any;

  constructor(app: any, plugin: any) {
    this.app = app;
    this.plugin = plugin;
    this.containerEl = {
      empty: vi.fn(),
      createEl: vi.fn().mockReturnValue(document.createElement("div")),
      createDiv: vi.fn().mockReturnValue(document.createElement("div")),
    };
  }
}

export class ItemView {
  app: any = {};
  leaf: any;
  containerEl: any;
  contentEl: any;

  constructor(leaf: any) {
    this.leaf = leaf;
    const container = document.createElement("div");
    const content = document.createElement("div");
    container.appendChild(content);
    this.containerEl = {
      children: [container, content],
      empty: vi.fn(),
    };
    this.contentEl = content;
  }

  getViewType(): string { return ""; }
  getDisplayText(): string { return ""; }
  getIcon(): string { return ""; }
  async onOpen(): Promise<void> {}
  async onClose(): Promise<void> {}
}

export class WorkspaceLeaf {
  view: any = {};
  setViewState = vi.fn().mockResolvedValue(undefined);
}

export class Notice {
  constructor(message: string, timeout?: number) {}
}

export class Setting {
  settingEl: HTMLElement;
  
  constructor(containerEl: any) {
    this.settingEl = document.createElement("div");
    if (containerEl?.appendChild) {
      containerEl.appendChild(this.settingEl);
    }
  }
  
  setName = vi.fn().mockReturnThis();
  setDesc = vi.fn().mockReturnThis();
  addText = vi.fn((cb: any) => { cb({ setPlaceholder: vi.fn().mockReturnThis(), setValue: vi.fn().mockReturnThis(), onChange: vi.fn().mockReturnThis() }); return this; });
  addTextArea = vi.fn((cb: any) => { cb({ setPlaceholder: vi.fn().mockReturnThis(), setValue: vi.fn().mockReturnThis(), onChange: vi.fn().mockReturnThis() }); return this; });
  addToggle = vi.fn((cb: any) => { cb({ setValue: vi.fn().mockReturnThis(), onChange: vi.fn().mockReturnThis() }); return this; });
  addDropdown = vi.fn((cb: any) => { cb({ addOption: vi.fn().mockReturnThis(), setValue: vi.fn().mockReturnThis(), onChange: vi.fn().mockReturnThis() }); return this; });
  addButton = vi.fn((cb: any) => { cb({ setButtonText: vi.fn().mockReturnThis(), onClick: vi.fn().mockReturnThis() }); return this; });
  addExtraButton = vi.fn((cb: any) => { cb({ setIcon: vi.fn().mockReturnThis(), setTooltip: vi.fn().mockReturnThis(), onClick: vi.fn().mockReturnThis() }); return this; });
}

export class TFile {
  path: string;
  basename: string;
  stat: { size: number; mtime: number; ctime: number };

  constructor(path: string) {
    this.path = path;
    this.basename = path.split("/").pop()?.replace(".md", "") || "";
    this.stat = { size: 100, mtime: Date.now(), ctime: Date.now() };
  }
}

export class TFolder {
  path: string;
  children: any[] = [];

  constructor(path: string) {
    this.path = path;
  }
}

// Helper to create a mock App
export function createMockApp(overrides: any = {}): any {
  return {
    workspace: {
      getActiveFile: vi.fn().mockReturnValue(null),
      getLeavesOfType: vi.fn().mockReturnValue([]),
      getRightLeaf: vi.fn().mockReturnValue(new WorkspaceLeaf()),
      revealLeaf: vi.fn(),
      detachLeavesOfType: vi.fn(),
      onLayoutReady: vi.fn((cb: any) => cb()),
      ...overrides.workspace,
    },
    vault: {
      getAbstractFileByPath: vi.fn().mockReturnValue(null),
      getFileByPath: vi.fn().mockReturnValue(null),
      getMarkdownFiles: vi.fn().mockReturnValue([]),
      cachedRead: vi.fn().mockResolvedValue(""),
      read: vi.fn().mockResolvedValue(""),
      create: vi.fn().mockResolvedValue(undefined),
      createFolder: vi.fn().mockResolvedValue(undefined),
      modify: vi.fn().mockResolvedValue(undefined),
      ...overrides.vault,
    },
    metadataCache: {
      getFileCache: vi.fn().mockReturnValue(null),
      ...overrides.metadataCache,
    },
    ...overrides,
  };
}
