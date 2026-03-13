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
  sendMessage: vi.fn().mockResolvedValue(undefined),
  abort: vi.fn().mockResolvedValue(undefined),
  onEvent: vi.fn().mockReturnValue(vi.fn()),
  switchMode: vi.fn().mockResolvedValue(undefined),
  getMode: vi.fn().mockReturnValue("ask"),
  getSessionId: vi.fn().mockReturnValue("test-session"),
  isConnected: vi.fn().mockReturnValue(true),
  destroy: vi.fn().mockResolvedValue(undefined),
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
        cachedRead: vi.fn().mockResolvedValue(""),
        ...(overrides.app?.vault ?? {}),
      },
      ...(overrides.app ?? {}),
    },
    settings: {
      defaultModel: "gpt-4.1",
      defaultMode: "ask",
      customAgents: [],
      streaming: true,
      ...(overrides.settings ?? {}),
    },
    copilotService: {
      ...mockService,
      ...(overrides.copilotService ?? {}),
    },
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
