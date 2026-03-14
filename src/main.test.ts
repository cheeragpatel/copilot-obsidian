import CopilotPlugin from "./main";
import { CopilotSettingsTab } from "./settings/SettingsTab";
import { CopilotService } from "./services/CopilotService";
import { STORAGE_KEY } from "./services/ConversationStore";
import { COPILOT_CHAT_VIEW_TYPE } from "./types/constants";
import { DEFAULT_SETTINGS } from "./types/settings";

vi.mock("obsidian");
vi.mock("@github/copilot-sdk", () => import("./__mocks__/copilot-sdk"));
vi.mock("./services/CopilotService", () => ({
  CopilotService: vi.fn().mockImplementation(function () {
    return {
      initialize: vi.fn().mockResolvedValue(undefined),
      createSession: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn().mockResolvedValue(undefined),
      updateSettings: vi.fn(),
    };
  }),
}));
vi.mock("./views/CopilotChatView", () => ({
  CopilotChatView: vi.fn(),
  COPILOT_CHAT_VIEW_TYPE: "copilot-chat-view",
}));
vi.mock("./settings/SettingsTab", () => ({
  CopilotSettingsTab: vi.fn(),
}));

const mockManifest = {
  id: "github-copilot-for-obsidian",
  name: "Copilot Obsidian",
} as any;

function createWorkspaceLeaf() {
  return {
    setViewState: vi.fn().mockResolvedValue(undefined),
  } as any;
}

function createApp(overrides: Record<string, any> = {}) {
  const {
    workspace: workspaceOverrides = {},
    vault: vaultOverrides = {},
    metadataCache: metadataCacheOverrides = {},
    ...appOverrides
  } = overrides;

  return {
    workspace: {
      getActiveFile: vi.fn().mockReturnValue(null),
      getLeavesOfType: vi.fn().mockReturnValue([]),
      getRightLeaf: vi.fn().mockReturnValue(createWorkspaceLeaf()),
      getLeaf: vi.fn().mockReturnValue(createWorkspaceLeaf()),
      revealLeaf: vi.fn(),
      detachLeavesOfType: vi.fn(),
      onLayoutReady: vi.fn((cb: () => void) => cb()),
      ...workspaceOverrides,
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
      ...vaultOverrides,
    },
    metadataCache: {
      getFileCache: vi.fn().mockReturnValue(null),
      ...metadataCacheOverrides,
    },
    ...appOverrides,
  } as any;
}

function createPlugin(appOverrides: Record<string, any> = {}) {
  const app = createApp(appOverrides);
  const plugin = new CopilotPlugin(app, mockManifest);

  Object.defineProperties(plugin, {
    app: {
      value: app,
      writable: true,
      configurable: true,
    },
    manifest: {
      value: mockManifest,
      writable: true,
      configurable: true,
    },
  });

  Object.assign(plugin, {
    addSettingTab: vi.fn(),
    addRibbonIcon: vi.fn(),
    addCommand: vi.fn(),
    registerView: vi.fn(),
    registerEditorExtension: vi.fn(),
    loadData: vi.fn().mockResolvedValue({}),
    saveData: vi.fn().mockResolvedValue(undefined),
  });

  return { plugin, app };
}

describe("CopilotPlugin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("onload() registers view", async () => {
    const { plugin } = createPlugin();

    await plugin.onload();

    expect(plugin.registerView).toHaveBeenCalledWith(
      COPILOT_CHAT_VIEW_TYPE,
      expect.any(Function),
    );
  });

  it("onload() adds ribbon icon", async () => {
    const { plugin } = createPlugin();

    await plugin.onload();

    expect(plugin.addRibbonIcon).toHaveBeenCalledWith(
      "bot-message-square",
      "Open Copilot Chat",
      expect.any(Function),
    );
  });

  it("onload() registers commands", async () => {
    const { plugin } = createPlugin();

    await plugin.onload();

    expect(plugin.addCommand).toHaveBeenCalledTimes(2);
    expect(plugin.addCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "open-copilot-chat",
        name: "Open Copilot Chat",
        callback: expect.any(Function),
      }),
    );
    expect(plugin.addCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "new-copilot-conversation",
        name: "New Copilot Conversation",
        callback: expect.any(Function),
      }),
    );
  });

  it("onload() adds settings tab", async () => {
    const { plugin } = createPlugin();

    await plugin.onload();

    expect(CopilotSettingsTab).toHaveBeenCalledWith(plugin.app, plugin);
    expect(plugin.addSettingTab).toHaveBeenCalledWith(
      vi.mocked(CopilotSettingsTab).mock.instances[0],
    );
  });

  it("onload() creates CopilotService", async () => {
    const { plugin, app } = createPlugin();

    await plugin.onload();

    expect(CopilotService).toHaveBeenCalledWith(app, plugin.settings);
    expect(plugin.copilotService).toBe(
      vi.mocked(CopilotService).mock.results[0]?.value,
    );
  });

  it("onload() creates ConversationStore", async () => {
    const { plugin } = createPlugin();

    await plugin.onload();

    expect(plugin.conversationStore).toBeDefined();
    expect(typeof plugin.conversationStore.getConversationMetas).toBe("function");
  });

  it("onload() auto-opens chat when openOnStartup is true", async () => {
    const { plugin, app } = createPlugin();
    vi.mocked(plugin.loadData).mockResolvedValue({ openOnStartup: true });
    const activateViewSpy = vi
      .spyOn(plugin, "activateView")
      .mockResolvedValue(undefined);

    await plugin.onload();

    expect(plugin.settings.openOnStartup).toBe(true);
    expect(app.workspace.onLayoutReady).toHaveBeenCalledTimes(1);
    expect(activateViewSpy).toHaveBeenCalledTimes(1);
  });

  it("onload() does NOT auto-open when openOnStartup is false", async () => {
    const { plugin, app } = createPlugin();
    vi.mocked(plugin.loadData).mockResolvedValue({ openOnStartup: false });
    const activateViewSpy = vi
      .spyOn(plugin, "activateView")
      .mockResolvedValue(undefined);

    await plugin.onload();

    expect(plugin.settings.openOnStartup).toBe(false);
    expect(app.workspace.onLayoutReady).toHaveBeenCalledTimes(1);
    expect(activateViewSpy).not.toHaveBeenCalled();
  });

  it("onunload() destroys service", async () => {
    const { plugin } = createPlugin();

    await plugin.onload();
    const service = vi.mocked(CopilotService).mock.results[0]?.value as {
      destroy: ReturnType<typeof vi.fn>;
    };

    await plugin.onunload();

    expect(service.destroy).toHaveBeenCalledTimes(1);
  });

  it("onunload() detaches views", async () => {
    const { plugin, app } = createPlugin();

    await plugin.onload();
    await plugin.onunload();

    expect(app.workspace.detachLeavesOfType).toHaveBeenCalledWith(
      COPILOT_CHAT_VIEW_TYPE,
    );
  });

  it("activateView() creates new leaf with fallback when getRightLeaf returns null", async () => {
    const fallbackLeaf = createWorkspaceLeaf();
    const { plugin, app } = createPlugin({
      workspace: {
        getLeavesOfType: vi.fn().mockReturnValue([]),
        getRightLeaf: vi.fn().mockReturnValue(null),
        getLeaf: vi.fn().mockReturnValue(fallbackLeaf),
      },
    });

    await CopilotPlugin.prototype.activateView.call(plugin);

    expect(app.workspace.getRightLeaf).toHaveBeenCalledWith(false);
    expect(app.workspace.getLeaf).toHaveBeenCalledWith("split", "vertical");
    expect(fallbackLeaf.setViewState).toHaveBeenCalledWith({
      type: COPILOT_CHAT_VIEW_TYPE,
      active: true,
    });
    expect(app.workspace.revealLeaf).toHaveBeenCalledWith(fallbackLeaf);
  });

  it("activateView() reuses existing leaf", async () => {
    const existingLeaf = createWorkspaceLeaf();
    const { plugin, app } = createPlugin({
      workspace: {
        getLeavesOfType: vi.fn().mockReturnValue([existingLeaf]),
      },
    });

    await CopilotPlugin.prototype.activateView.call(plugin);

    expect(app.workspace.getRightLeaf).not.toHaveBeenCalled();
    expect(existingLeaf.setViewState).not.toHaveBeenCalled();
    expect(app.workspace.revealLeaf).toHaveBeenCalledWith(existingLeaf);
  });

  it("loadSettings() loads data, merges defaults, and normalizes settings MCP sources", async () => {
    const { plugin } = createPlugin();
    vi.mocked(plugin.loadData).mockResolvedValue({
      cliPath: "gh-copilot",
      openOnStartup: true,
      [STORAGE_KEY]: [
        {
          sessionId: "session-1",
          title: "Stored conversation",
          model: "gpt-4.1",
          mode: "ask",
          messages: [],
          lastUpdated: 1,
          createdAt: 1,
        },
      ],
      mcpServers: [
        {
          name: "docs",
          type: "http",
          url: "https://docs.example.com",
          enabled: true,
        },
      ],
    });

    await plugin.loadSettings();

    expect(plugin.loadData).toHaveBeenCalledTimes(1);
    expect(plugin.settings).toEqual({
      ...DEFAULT_SETTINGS,
      cliPath: "gh-copilot",
      openOnStartup: true,
      mcpServers: [
        {
          name: "docs",
          type: "http",
          url: "https://docs.example.com",
          enabled: true,
          source: "settings",
        },
      ],
    });
    expect(plugin.settings).not.toHaveProperty(STORAGE_KEY);
  });

  it("saveSettings() preserves stored conversations and updates service settings", async () => {
    const { plugin } = createPlugin();
    const updateSettings = vi.fn();
    const storedConversations = [
      {
        sessionId: "session-1",
        title: "Stored conversation",
        model: "gpt-4.1",
        mode: "ask",
        messages: [],
        lastUpdated: 1,
        createdAt: 1,
      },
    ];

    vi.mocked(plugin.loadData).mockResolvedValue({ [STORAGE_KEY]: storedConversations });
    plugin.settings = {
      ...DEFAULT_SETTINGS,
      cliPath: "custom-copilot",
      openOnStartup: true,
    };
    plugin.copilotService = { updateSettings } as any;

    await plugin.saveSettings();

    expect(plugin.saveData).toHaveBeenCalledWith({
      ...plugin.settings,
      [STORAGE_KEY]: storedConversations,
    });
    expect(updateSettings).toHaveBeenCalledWith(plugin.settings);
  });
});
