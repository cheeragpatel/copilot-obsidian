import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import { vi } from "vitest";
import {
  PluginContext,
  type CopilotPluginContext,
} from "../views/CopilotChatView";

export const mockService = {
  initialize: vi.fn().mockResolvedValue(undefined),
  createSession: vi.fn().mockResolvedValue(undefined),
  listTools: vi.fn().mockResolvedValue([]),
  sendMessage: vi.fn().mockResolvedValue(undefined),
  abort: vi.fn().mockResolvedValue(undefined),
  onEvent: vi.fn().mockReturnValue(vi.fn()),
  switchMode: vi.fn().mockResolvedValue(undefined),
  resumeSession: vi.fn().mockResolvedValue(undefined),
  listSessions: vi.fn().mockResolvedValue([]),
  getMode: vi.fn().mockReturnValue("ask"),
  getSessionId: vi.fn().mockReturnValue("test-session"),
  isConnected: vi.fn().mockReturnValue(true),
  destroy: vi.fn().mockResolvedValue(undefined),
};

export const mockConversationStore = {
  loadAll: vi.fn().mockResolvedValue([]),
  save: vi.fn().mockResolvedValue(undefined),
  delete: vi.fn().mockResolvedValue(undefined),
  getConversationMetas: vi.fn().mockResolvedValue([]),
  getMessages: vi.fn().mockResolvedValue([]),
};

type ContextOverrides = Partial<CopilotPluginContext> & {
  app?: any;
  settings?: Record<string, any>;
  copilotService?: Record<string, any>;
};

export function createPluginContext(
  overrides: ContextOverrides = {},
): CopilotPluginContext {
  return {
    app: {
      workspace: {
        getActiveFile: vi.fn(),
        getLeavesOfType: vi.fn().mockReturnValue([]),
        on: vi.fn().mockReturnValue({}),
        offref: vi.fn(),
        ...(overrides.app?.workspace ?? {}),
      },
      vault: {
        getMarkdownFiles: vi.fn().mockReturnValue([]),
        getAllLoadedFiles: vi.fn().mockReturnValue([]),
        getAbstractFileByPath: vi.fn().mockReturnValue(null),
        read: vi.fn().mockResolvedValue(""),
        cachedRead: vi.fn().mockResolvedValue(""),
        ...(overrides.app?.vault ?? {}),
      },
      ...(overrides.app ?? {}),
    },
    settings: {
      defaultModel: "gpt-4.1",
      defaultMode: "ask",
      customAgents: [],
      mcpServers: [],
      inheritConfig: true,
      streaming: true,
      ...(overrides.settings ?? {}),
    },
    copilotService: {
      ...mockService,
      ...(overrides.copilotService ?? {}),
    },
    conversationStore: overrides.conversationStore ?? mockConversationStore,
    saveSettings: overrides.saveSettings ?? vi.fn(),
  };
}

export function renderWithContext(
  ui: ReactElement,
  overrides: ContextOverrides = {},
) {
  return render(
    <PluginContext.Provider value={createPluginContext(overrides)}>
      {ui}
    </PluginContext.Provider>,
  );
}
