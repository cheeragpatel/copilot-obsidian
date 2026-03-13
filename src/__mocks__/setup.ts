import "@testing-library/jest-dom/vitest";
import React from "react";
import { beforeAll, beforeEach, vi } from "vitest";
import { useChatStore } from "../store/chatStore";
import { ChatMode } from "../types/constants";

vi.mock("obsidian");
vi.mock("@github/copilot-sdk", () => ({
  defineTool: (name: string, config: any) => ({ name, ...config }),
}));
vi.mock("react-markdown", () => ({
  default: ({ children }: any) =>
    React.createElement("div", { "data-testid": "markdown" }, children),
}));
vi.mock("remark-gfm", () => ({ default: () => {} }));
vi.mock("react-syntax-highlighter", () => ({
  Prism: ({ children }: any) =>
    React.createElement("pre", { "data-testid": "syntax-highlighter" }, children),
}));


beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    value: vi.fn(),
    writable: true,
  });

  Object.defineProperty(globalThis.navigator, "clipboard", {
    value: { writeText: vi.fn() },
    configurable: true,
  });
});

beforeEach(() => {
  useChatStore.setState({
    messages: [],
    currentMode: ChatMode.Ask,
    currentModel: "gpt-4.1",
    isLoading: false,
    currentSessionId: null,
    error: null,
    selectedAgent: null,
    conversations: [],
  });
  vi.clearAllMocks();
});
