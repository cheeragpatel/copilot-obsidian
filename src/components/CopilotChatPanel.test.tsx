import { vi } from "vitest";

vi.mock("../tools/vaultTools", () => ({
  createVaultTools: vi.fn().mockReturnValue([]),
}));

import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useChatStore } from "../store/chatStore";
import type { ChatMessage, ConversationMeta, MCPServerState } from "../types/chat";
import { ChatMode } from "../types/constants";
import { ConfigDiscovery } from "../services/ConfigDiscovery";
import { CopilotChatPanel } from "./CopilotChatPanel";
import { mockService, renderWithContext } from "./testUtils";

const emptyDiscovery = {
  skills: [],
  mcpServers: [],
  instructions: "",
  agents: [],
};

async function renderPanel(overrides?: Parameters<typeof renderWithContext>[1]) {
  const view = renderWithContext(<CopilotChatPanel />, overrides);
  await waitFor(() => expect(mockService.initialize).toHaveBeenCalled());
  await waitFor(() => expect(mockService.createSession).toHaveBeenCalled());
  return view;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(ConfigDiscovery.prototype, "discover").mockResolvedValue(emptyDiscovery);
  mockService.initialize.mockResolvedValue(undefined);
  mockService.createSession.mockResolvedValue(undefined);
  mockService.sendMessage.mockResolvedValue(undefined);
  mockService.abort.mockResolvedValue(undefined);
  mockService.onEvent.mockReturnValue(vi.fn());
  mockService.resumeSession.mockResolvedValue(undefined);
  mockService.listSessions.mockResolvedValue([]);
  mockService.getSessionId.mockReturnValue("test-session");

  useChatStore.setState({
    messages: [],
    currentMode: ChatMode.Ask,
    currentModel: "gpt-4.1",
    availableModels: [],
    isLoading: false,
    currentSessionId: null,
    error: null,
    selectedAgent: null,
    conversations: [],
    discoveredAgents: [],
    mcpServers: [],
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CopilotChatPanel", () => {
  it("renders in the initial state with the empty state", async () => {
    await renderPanel();

    expect(screen.getByText("GitHub Copilot for Obsidian")).toBeInTheDocument();
    expect(mockService.createSession).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gpt-4.1", mode: "ask", mcpServers: {} }),
    );
  });

  it("renders the message list when messages exist", async () => {
    const messages: ChatMessage[] = [
      {
        id: "message-1",
        role: "user",
        content: "Existing message",
        timestamp: 1,
        isStreaming: false,
      },
    ];
    useChatStore.setState({ messages });

    await renderPanel();

    expect(screen.getByText("Existing message")).toBeInTheDocument();
    expect(screen.queryByText("GitHub Copilot for Obsidian")).not.toBeInTheDocument();
  });

  it("shows an error banner and clears it when dismissed", async () => {
    const user = userEvent.setup();
    useChatStore.setState({ error: "Something went wrong" });

    await renderPanel();

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "×" }));

    await waitFor(() => {
      expect(screen.queryByText("Something went wrong")).not.toBeInTheDocument();
    });
    expect(useChatStore.getState().error).toBeNull();
  });

  it("sends a message on user input", async () => {
    const user = userEvent.setup();
    await renderPanel();

    await user.type(screen.getByRole("textbox"), "Hello Copilot");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(mockService.sendMessage).toHaveBeenCalledWith("Hello Copilot");
    });

    expect(useChatStore.getState().messages).toHaveLength(2);
    expect(useChatStore.getState().messages[0]).toMatchObject({
      role: "user",
      content: "Hello Copilot",
    });
    expect(useChatStore.getState().messages[1]).toMatchObject({
      role: "assistant",
      content: "",
      isStreaming: true,
    });
  });

  it("passes attachments through handleSend", async () => {
    const user = userEvent.setup();
    const file = new File(["# note"], "test.md", { type: "text/markdown" });
    Object.defineProperty(file, "path", { value: "/vault/Notes/test.md" });

    const view = await renderPanel({
      app: {
        vault: {
          adapter: {
            getBasePath: vi.fn().mockReturnValue("/vault"),
          },
          getAbstractFileByPath: vi.fn((path: string) =>
            path === "Notes/test.md" ? { path: "Notes/test.md", name: "test.md" } : null,
          ),
        },
      },
    });

    await user.type(screen.getByRole("textbox"), "Review this file");
    const input = view.container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(mockService.sendMessage).toHaveBeenCalledWith("Review this file", [
        { path: "Notes/test.md", name: "test.md", type: "text/markdown" },
      ]);
    });

    expect(useChatStore.getState().messages[0]).toMatchObject({
      role: "user",
      attachments: [{ path: "Notes/test.md", name: "test.md", type: "text/markdown" }],
    });
  });

  it("merges settings and discovered MCP servers with source priority", async () => {
    vi.spyOn(ConfigDiscovery.prototype, "discover").mockResolvedValue({
      skills: [],
      instructions: "",
      agents: [],
      mcpServers: [
        {
          name: "shared",
          type: "http",
          url: "https://vault.example.com",
          enabled: true,
          source: "vault",
        },
        {
          name: "vault-only",
          type: "http",
          url: "https://vault-only.example.com",
          enabled: true,
          source: "vault",
        },
        {
          name: "home-only",
          type: "http",
          url: "https://home-only.example.com",
          enabled: true,
          source: "home",
        },
      ],
    });

    await renderPanel({
      settings: {
        mcpServers: [
          {
            name: "shared",
            type: "http",
            url: "https://settings.example.com",
            enabled: true,
          },
          {
            name: "settings-only",
            type: "stdio",
            command: "node",
            args: ["settings.js"],
            enabled: true,
          },
        ],
      },
    });

    expect(useChatStore.getState().mcpServers.map((server) => ({
      name: server.server.name,
      source: server.source,
      serverSource: server.server.source,
    }))).toEqual([
      { name: "shared", source: "settings", serverSource: "settings" },
      { name: "settings-only", source: "settings", serverSource: "settings" },
      { name: "vault-only", source: "vault", serverSource: "vault" },
      { name: "home-only", source: "home", serverSource: "home" },
    ]);

    expect(mockService.createSession).toHaveBeenLastCalledWith(
      expect.objectContaining({
        mcpServers: {
          shared: {
            type: "http",
            url: "https://settings.example.com",
          },
          "settings-only": {
            type: "stdio",
            command: "node",
            args: ["settings.js"],
            env: {},
          },
          "vault-only": {
            type: "http",
            url: "https://vault-only.example.com",
          },
          "home-only": {
            type: "http",
            url: "https://home-only.example.com",
          },
        },
      }),
    );
  });

  it("recreates the session when MCP servers or tools change", async () => {
    const user = userEvent.setup();
    const docsServer: MCPServerState = {
      server: {
        name: "docs",
        type: "http",
        url: "https://docs.example.com",
        enabled: true,
        source: "settings",
      },
      enabled: true,
      source: "settings",
      tools: [
        { name: "search", enabled: true },
        { name: "fetch", enabled: false },
      ],
    };
    useChatStore.setState({ mcpServers: [docsServer] });

    await renderPanel({
      settings: {
        mcpServers: [
          {
            name: "docs",
            type: "http",
            url: "https://docs.example.com",
            enabled: true,
          },
        ],
      },
    });

    expect(mockService.createSession).toHaveBeenLastCalledWith(
      expect.objectContaining({
        mcpServers: {
          docs: {
            type: "http",
            url: "https://docs.example.com",
            excludedTools: ["fetch"],
          },
        },
      }),
    );

    await user.click(screen.getByRole("button", { name: "Configure MCP servers" }));
    await user.click(screen.getByRole("button", { name: "Expand docs tools" }));
    await user.click(screen.getByRole("checkbox", { name: /search/i }));

    await waitFor(() => {
      expect(mockService.createSession).toHaveBeenCalledTimes(2);
    });
    expect(mockService.createSession).toHaveBeenLastCalledWith(
      expect.objectContaining({
        mcpServers: {
          docs: {
            type: "http",
            url: "https://docs.example.com",
            excludedTools: ["search", "fetch"],
          },
        },
      }),
    );

    await user.click(screen.getByRole("checkbox", { name: /^docs$/i }));

    await waitFor(() => {
      expect(mockService.createSession).toHaveBeenCalledTimes(3);
    });
    expect(mockService.createSession).toHaveBeenLastCalledWith(
      expect.objectContaining({ mcpServers: {} }),
    );
  });

  it("switches modes, preserves messages, and appends a system notice", async () => {
    const user = userEvent.setup();
    useChatStore.setState({
      messages: [
        {
          id: "message-1",
          role: "user",
          content: "Keep me",
          timestamp: 1,
          isStreaming: false,
        },
      ],
    });

    await renderPanel();
    const modeSelect = screen.getByRole("option", { name: "Agent" }).closest("select")!;
    await user.selectOptions(modeSelect, ChatMode.Agent);

    await waitFor(() => {
      expect(mockService.createSession).toHaveBeenCalledTimes(2);
    });
    expect(mockService.createSession).toHaveBeenLastCalledWith(
      expect.objectContaining({
        model: "gpt-4.1",
        mode: ChatMode.Agent,
        tools: [],
        mcpServers: {},
      }),
    );

    expect(useChatStore.getState().currentMode).toBe(ChatMode.Agent);
    expect(useChatStore.getState().messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "user", content: "Keep me" }),
        expect.objectContaining({ role: "system", content: "Switched to agent mode" }),
      ]),
    );
    expect(screen.getByText("Switched to agent mode")).toBeInTheDocument();
  });

  it("loads conversation history and resumes a selected session", async () => {
    const user = userEvent.setup();
    const sessions = [
      {
        sessionId: "session-2",
        summary: "Older thread",
        model: "gpt-4.1",
        messageCount: 2,
        modifiedTime: new Date("2024-01-01T00:00:00Z"),
      },
      {
        sessionId: "session-1",
        summary: "Recent thread",
        model: "gpt-4o",
        messageCount: 4,
        modifiedTime: new Date("2024-01-02T00:00:00Z"),
      },
    ];
    mockService.listSessions.mockResolvedValueOnce(sessions);
    mockService.getSessionId.mockReturnValue("resumed-session");
    useChatStore.setState({
      messages: [
        {
          id: "message-1",
          role: "user",
          content: "Current thread",
          timestamp: 1,
          isStreaming: false,
        },
      ],
    });

    await renderPanel();
    await user.click(screen.getByTitle("Conversation history"));

    await waitFor(() => {
      expect(mockService.listSessions).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText("Recent thread")).toBeInTheDocument();
    expect(useChatStore.getState().conversations).toEqual([
      {
        sessionId: "session-1",
        title: "Recent thread",
        model: "gpt-4o",
        messageCount: 4,
        lastUpdated: new Date("2024-01-02T00:00:00Z").getTime(),
      },
      {
        sessionId: "session-2",
        title: "Older thread",
        model: "gpt-4.1",
        messageCount: 2,
        lastUpdated: new Date("2024-01-01T00:00:00Z").getTime(),
      },
    ] satisfies ConversationMeta[]);

    await user.click(screen.getByText("Recent thread"));

    await waitFor(() => {
      expect(mockService.resumeSession).toHaveBeenCalledWith("session-1");
    });
    expect(useChatStore.getState().currentSessionId).toBe("resumed-session");
    expect(useChatStore.getState().messages).toEqual([]);
    await waitFor(() => {
      expect(screen.queryByText("Conversations")).not.toBeInTheDocument();
    });
  });

  it("calls abort from the stop button and resets loading state", async () => {
    const user = userEvent.setup();
    const messages: ChatMessage[] = [
      {
        id: "message-1",
        role: "assistant",
        content: "Thinking...",
        timestamp: 1,
        isStreaming: true,
      },
    ];
    useChatStore.setState({ isLoading: true, messages });

    await renderPanel();
    await user.click(screen.getByRole("button", { name: /Stop/ }));

    await waitFor(() => {
      expect(mockService.abort).toHaveBeenCalledTimes(1);
    });
    expect(useChatStore.getState().isLoading).toBe(false);
    expect(useChatStore.getState().messages[0]).toMatchObject({
      isStreaming: false,
    });
  });
});
