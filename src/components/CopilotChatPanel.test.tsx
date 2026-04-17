import { vi } from "vitest";

vi.mock("../tools/vaultTools", () => ({
  createVaultTools: vi.fn().mockReturnValue([]),
}));

import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useChatStore } from "../store/chatStore";
import type { ChatMessage, ConversationMeta, MCPServerState } from "../types/chat";
import { ChatMode } from "../types/constants";
import { ConfigDiscovery } from "../services/ConfigDiscovery";
import { CopilotChatPanel } from "./CopilotChatPanel";
import { mockConversationStore, mockService, renderWithContext } from "./testUtils";

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
  mockService.listTools.mockResolvedValue([]);
  mockService.sendMessage.mockResolvedValue(undefined);
  mockService.abort.mockResolvedValue(undefined);
  mockService.onEvent.mockReturnValue(vi.fn());
  mockService.resumeSession.mockResolvedValue(undefined);
  mockService.listSessions.mockResolvedValue([]);
  mockService.getSessionId.mockReturnValue("test-session");
  mockConversationStore.loadAll.mockResolvedValue([]);
  mockConversationStore.save.mockResolvedValue(undefined);
  mockConversationStore.delete.mockResolvedValue(undefined);
  mockConversationStore.getConversationMetas.mockResolvedValue([]);
  mockConversationStore.getMessages.mockResolvedValue([]);

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

  it("discovers MCP tools after creating a session", async () => {
    mockService.listTools.mockResolvedValueOnce([
      {
        name: "query-docs",
        namespacedName: "context7/query-docs",
        description: "Query docs",
      },
    ]);

    await renderPanel({
      settings: {
        mcpServers: [
          {
            name: "context7",
            type: "http",
            url: "https://mcp.context7.com/mcp",
            enabled: true,
          },
        ],
      },
    });

    await waitFor(() => {
      expect(mockService.listTools).toHaveBeenCalledTimes(1);
    });
    expect(useChatStore.getState().mcpServers).toEqual([
      expect.objectContaining({
        server: expect.objectContaining({ name: "context7" }),
        tools: [{ name: "query-docs", description: "Query docs", enabled: true }],
      }),
    ]);
  });

  it("shows an error banner and clears it when dismissed", async () => {
    const user = userEvent.setup();
    useChatStore.setState({ error: "Something went wrong" });

    await renderPanel();

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "✕" }));

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

    // Only the user message should exist; assistant message is created lazily on first delta
    expect(useChatStore.getState().messages).toHaveLength(1);
    expect(useChatStore.getState().messages[0]).toMatchObject({
      role: "user",
      content: "Hello Copilot",
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
          headers: { CONTEXT7_API_KEY: "secret" },
          configTools: ["query-docs", "resolve-library-id"],
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
      tools: server.tools.map((tool) => ({ name: tool.name, enabled: tool.enabled })),
    }))).toEqual([
      { name: "shared", source: "settings", serverSource: "settings", tools: [] },
      { name: "settings-only", source: "settings", serverSource: "settings", tools: [] },
      { name: "vault-only", source: "vault", serverSource: "vault", tools: [] },
      {
        name: "home-only",
        source: "home",
        serverSource: "home",
        tools: [
          { name: "query-docs", enabled: true },
          { name: "resolve-library-id", enabled: true },
        ],
      },
    ]);

    expect(mockService.createSession).toHaveBeenLastCalledWith(
      expect.objectContaining({
        mcpServers: {
          shared: {
            type: "http",
            url: "https://settings.example.com",
            tools: ["*"],
          },
          "settings-only": {
            type: "stdio",
            command: "node",
            args: ["settings.js"],
            env: {},
            tools: ["*"],
          },
          "vault-only": {
            type: "http",
            url: "https://vault-only.example.com",
            tools: ["*"],
          },
          "home-only": {
            type: "http",
            url: "https://home-only.example.com",
            headers: { CONTEXT7_API_KEY: "secret" },
            tools: ["query-docs", "resolve-library-id"],
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
            tools: ["search"],
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
            tools: ["*"],
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

  it("loads persisted conversation history and restores messages on selection", async () => {
    const user = userEvent.setup();
    const restoredMessages: ChatMessage[] = [
      {
        id: "message-1",
        role: "user",
        content: "Restored question",
        timestamp: 1,
        isStreaming: false,
      },
      {
        id: "message-2",
        role: "assistant",
        content: "Restored answer",
        timestamp: 2,
        isStreaming: false,
      },
    ];

    mockConversationStore.getConversationMetas.mockResolvedValueOnce([
      {
        sessionId: "session-2",
        title: "Older thread",
        model: "gpt-4.1",
        messageCount: 2,
        lastUpdated: new Date("2024-01-01T00:00:00Z").getTime(),
      },
      {
        sessionId: "session-1",
        title: "Recent thread",
        model: "gpt-4o",
        messageCount: 4,
        lastUpdated: new Date("2024-01-02T00:00:00Z").getTime(),
      },
    ] satisfies ConversationMeta[]);
    mockConversationStore.getMessages.mockResolvedValueOnce(restoredMessages);
    mockService.getSessionId.mockReturnValue("resumed-session");

    await renderPanel();
    await user.click(screen.getByTitle("Conversation history"));

    await waitFor(() => {
      expect(mockConversationStore.getConversationMetas).toHaveBeenCalledTimes(1);
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
      expect(mockConversationStore.getMessages).toHaveBeenCalledWith("session-1");
      expect(mockService.resumeSession).toHaveBeenCalledWith("session-1");
    });
    expect(useChatStore.getState().currentSessionId).toBe("resumed-session");
    expect(useChatStore.getState().messages).toEqual(restoredMessages);
    await waitFor(() => {
      expect(screen.queryByText("Conversations")).not.toBeInTheDocument();
    });
  });

  it("creates a fresh session when resuming a persisted conversation fails", async () => {
    const user = userEvent.setup();
    const restoredMessages: ChatMessage[] = [
      {
        id: "message-1",
        role: "user",
        content: "Persisted thread",
        timestamp: 1,
        isStreaming: false,
      },
    ];

    mockConversationStore.getConversationMetas.mockResolvedValueOnce([
      {
        sessionId: "session-1",
        title: "Persisted thread",
        model: "gpt-4.1",
        messageCount: 1,
        lastUpdated: 1,
      },
    ]);
    mockConversationStore.getMessages.mockResolvedValueOnce(restoredMessages);
    mockService.resumeSession.mockRejectedValueOnce(new Error("expired"));

    await renderPanel();
    await user.click(screen.getByTitle("Conversation history"));
    await user.click(await screen.findByText("Persisted thread"));

    await waitFor(() => {
      expect(mockService.resumeSession).toHaveBeenCalledWith("session-1");
      expect(mockService.createSession).toHaveBeenCalledTimes(2);
    });
    expect(useChatStore.getState().messages).toEqual(restoredMessages);
  });

  it("saves conversations when a response finishes", async () => {
    const handlers: Array<(event: any) => void> = [];
    mockService.onEvent.mockImplementation((handler: (event: any) => void) => {
      handlers.push(handler);
      return vi.fn();
    });

    await renderPanel();
    useChatStore.setState({
      messages: [
        {
          id: "message-1",
          role: "user",
          content: "Summarize this note",
          timestamp: 1,
          isStreaming: false,
        },
        {
          id: "message-2",
          role: "assistant",
          content: "Done",
          timestamp: 2,
          isStreaming: false,
        },
      ],
      currentSessionId: "session-1",
    });

    await act(async () => {
      handlers[0]?.({ type: "session.idle", data: {} });
    });

    await waitFor(() => {
      expect(mockConversationStore.save).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: "session-1",
          title: "Summarize this note",
          model: "gpt-4.1",
          mode: ChatMode.Ask,
          messages: [
            expect.objectContaining({ role: "user", content: "Summarize this note" }),
            expect.objectContaining({ role: "assistant", content: "Done" }),
          ],
        }),
      );
    });
  });

  it("saves the current conversation before starting a new one", async () => {
    const user = userEvent.setup();
    mockService.getSessionId.mockReturnValue("session-1");
    useChatStore.setState({
      messages: [
        {
          id: "message-1",
          role: "user",
          content: "Keep this thread",
          timestamp: 1,
          isStreaming: false,
        },
      ],
      currentSessionId: "session-1",
    });

    await renderPanel();
    await user.click(screen.getByTitle("New conversation"));

    await waitFor(() => {
      expect(mockConversationStore.save).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: "session-1",
          title: "Keep this thread",
        }),
      );
      expect(mockService.createSession).toHaveBeenCalledTimes(2);
    });
    expect(useChatStore.getState().messages).toEqual([]);
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

  it("creates assistant message lazily on first streaming delta", async () => {
    const handlers: Array<(event: any) => void> = [];
    mockService.onEvent.mockImplementation((handler: (event: any) => void) => {
      handlers.push(handler);
      return vi.fn();
    });

    await renderPanel();

    // Simulate user sending a message (no assistant message pre-created)
    useChatStore.setState({
      messages: [
        {
          id: "message-1",
          role: "user",
          content: "Hello",
          timestamp: 1,
          isStreaming: false,
        },
      ],
      isLoading: true,
    });

    // First delta should create the assistant message
    await act(async () => {
      handlers[0]?.({ type: "assistant.message_delta", data: { deltaContent: "Hi " } });
    });

    const msgs = useChatStore.getState().messages;
    expect(msgs).toHaveLength(2);
    expect(msgs[1]).toMatchObject({
      role: "assistant",
      content: "Hi ",
      isStreaming: true,
    });

    // Second delta appends to existing message
    await act(async () => {
      handlers[0]?.({ type: "assistant.message_delta", data: { deltaContent: "there!" } });
    });

    const updatedMsgs = useChatStore.getState().messages;
    expect(updatedMsgs).toHaveLength(2);
    expect(updatedMsgs[1].content).toBe("Hi there!");
  });

  it("does not leave a ghost message when sendMessage fails", async () => {
    const user = userEvent.setup();
    mockService.sendMessage.mockRejectedValueOnce(new Error("network error"));

    await renderPanel();

    await user.type(screen.getByRole("textbox"), "Will fail");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(mockService.sendMessage).toHaveBeenCalled();
    });

    // Should only have the user message, no ghost assistant message
    const msgs = useChatStore.getState().messages;
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({ role: "user", content: "Will fail" });
    expect(useChatStore.getState().error).toBeTruthy();
    expect(useChatStore.getState().isLoading).toBe(false);
  });

  it("shows a retry button on error when there is a previous prompt", async () => {
    const user = userEvent.setup();
    mockService.sendMessage.mockRejectedValueOnce(new Error("network error"));

    await renderPanel();

    await user.type(screen.getByRole("textbox"), "Try this");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(useChatStore.getState().error).toBeTruthy();
    });

    // Retry button should be visible
    const retryBtn = screen.getByRole("button", { name: "Retry" });
    expect(retryBtn).toBeInTheDocument();

    // Click retry should re-send the message
    mockService.sendMessage.mockResolvedValueOnce(undefined);
    await user.click(retryBtn);

    await waitFor(() => {
      expect(mockService.sendMessage).toHaveBeenCalledTimes(2);
      expect(mockService.sendMessage).toHaveBeenLastCalledWith("Try this");
    });
  });

  it("creates assistant message on tool execution start when none exists", async () => {
    const handlers: Array<(event: any) => void> = [];
    mockService.onEvent.mockImplementation((handler: (event: any) => void) => {
      handlers.push(handler);
      return vi.fn();
    });

    await renderPanel();

    useChatStore.setState({
      messages: [
        {
          id: "message-1",
          role: "user",
          content: "Search for docs",
          timestamp: 1,
          isStreaming: false,
        },
      ],
      isLoading: true,
    });

    await act(async () => {
      handlers[0]?.({
        type: "tool.execution_start",
        data: { name: "search", description: "Search docs" },
      });
    });

    const msgs = useChatStore.getState().messages;
    expect(msgs).toHaveLength(2);
    expect(msgs[1]).toMatchObject({
      role: "assistant",
      content: "",
      isStreaming: true,
    });
    expect(msgs[1].toolCalls).toEqual([
      expect.objectContaining({ name: "search", status: "running" }),
    ]);
  });

  describe("error recovery", () => {
    it("shows error banner when sendMessage fails", async () => {
      const user = userEvent.setup();
      mockService.sendMessage.mockRejectedValueOnce(new Error("network failure"));

      await renderPanel();

      await user.type(screen.getByRole("textbox"), "Hello Copilot");
      await user.click(screen.getByRole("button", { name: "Send" }));

      await waitFor(() => {
        expect(useChatStore.getState().error).toBeTruthy();
      });
    });

    it("clears error on new message send", async () => {
      const user = userEvent.setup();
      mockService.sendMessage.mockRejectedValueOnce(new Error("first failure"));

      await renderPanel();

      // Trigger error
      await user.type(screen.getByRole("textbox"), "fail");
      await user.click(screen.getByRole("button", { name: "Send" }));

      await waitFor(() => {
        expect(useChatStore.getState().error).toBeTruthy();
      });

      // Send another message — error should clear
      mockService.sendMessage.mockResolvedValueOnce(undefined);
      await user.type(screen.getByRole("textbox"), "retry");
      await user.click(screen.getByRole("button", { name: "Send" }));

      await waitFor(() => {
        expect(useChatStore.getState().error).toBeNull();
      });
    });

    it("handles rapid send clicks gracefully", async () => {
      const user = userEvent.setup();
      // Make sendMessage take a while
      mockService.sendMessage.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100)),
      );

      await renderPanel();

      await user.type(screen.getByRole("textbox"), "first message");
      await user.click(screen.getByRole("button", { name: "Send" }));

      // Verify loading state prevents second send (stop button shown instead)
      await waitFor(() => {
        expect(useChatStore.getState().isLoading).toBe(true);
      });

      // With loading=true, the Send button should be replaced by Stop
      expect(screen.queryByRole("button", { name: "Send" })).not.toBeInTheDocument();
    });
  });
});
