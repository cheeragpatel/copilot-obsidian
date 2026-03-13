import React from "react";
import { createRoot } from "react-dom/client";
import { ItemView } from "obsidian";
import { COPILOT_CHAT_VIEW_TYPE } from "../types/constants";
import { CopilotChatView } from "./CopilotChatView";

vi.mock("obsidian");
vi.mock("react-dom/client", () => ({
  createRoot: vi.fn().mockReturnValue({
    render: vi.fn(),
    unmount: vi.fn(),
  }),
}));

vi.mock("../components/CopilotChatPanel", () => ({
  CopilotChatPanel: () => null,
}));

vi.mock("../tools/vaultTools", () => ({
  createVaultTools: vi.fn().mockReturnValue([]),
}));

const mockPlugin = {
  app: {},
  settings: { defaultModel: "gpt-4.1", defaultMode: "ask" },
  copilotService: {},
  saveSettings: vi.fn(),
};

describe("CopilotChatView", () => {
  let leaf: any;
  let view: CopilotChatView;
  let contentContainer: HTMLElement & { empty: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    vi.clearAllMocks();

    const { ItemView: MockItemView, WorkspaceLeaf: MockWorkspaceLeaf } =
      await vi.importActual<typeof import("../__mocks__/obsidian")>("../__mocks__/obsidian");

    (ItemView as any).mockImplementation(function (this: any, incomingLeaf: any) {
      const instance = new MockItemView(incomingLeaf);
      this.app = instance.app;
      this.leaf = instance.leaf;
      this.containerEl = instance.containerEl;
      this.contentEl = instance.contentEl;
    });

    leaf = new MockWorkspaceLeaf();
    view = new CopilotChatView(leaf, mockPlugin);
    contentContainer = view.containerEl.children[1] as HTMLElement & {
      empty: ReturnType<typeof vi.fn>;
    };
    contentContainer.empty = vi.fn();
  });

  it("getViewType() returns COPILOT_CHAT_VIEW_TYPE", () => {
    expect(view.getViewType()).toBe(COPILOT_CHAT_VIEW_TYPE);
  });

  it("getIcon() returns the chat icon", () => {
    expect(view.getIcon()).toBe("bot-message-square");
  });

  it("getDisplayText() returns Copilot Chat", () => {
    expect(view.getDisplayText()).toBe("Copilot Chat");
  });

  it("onOpen() creates a React root and renders the panel", async () => {
    await view.onOpen();

    expect(contentContainer.empty).toHaveBeenCalledTimes(1);
    expect(createRoot).toHaveBeenCalledWith(contentContainer);

    const root = vi.mocked(createRoot).mock.results[0]?.value as {
      render: ReturnType<typeof vi.fn>;
    };
    expect(root.render).toHaveBeenCalledTimes(1);

    const renderedTree = root.render.mock.calls[0][0];
    expect(React.isValidElement(renderedTree)).toBe(true);
  });

  it("onClose() unmounts the React root", async () => {
    await view.onOpen();

    const root = vi.mocked(createRoot).mock.results[0]?.value as {
      unmount: ReturnType<typeof vi.fn>;
    };

    await view.onClose();

    expect(root.unmount).toHaveBeenCalledTimes(1);
  });

  it("onClose() does nothing when no React root exists", async () => {
    await expect(view.onClose()).resolves.toBeUndefined();
    expect(createRoot).not.toHaveBeenCalled();
  });
});
