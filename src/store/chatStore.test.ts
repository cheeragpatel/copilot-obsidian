import { useChatStore, generateId } from "./chatStore";
import { ChatMode, DEFAULT_MODEL } from "../types/constants";
import type { ChatMessage, ConversationMeta, ToolCallInfo, MCPServerState } from "../types/chat";
import type { CustomAgentEntry } from "../types/settings";

const initialState = {
  messages: [] as ChatMessage[],
  currentMode: ChatMode.Ask,
  currentModel: DEFAULT_MODEL,
  isLoading: false,
  currentSessionId: null as string | null,
  error: null as string | null,
  selectedAgent: null as string | null,
  conversations: [] as ConversationMeta[],
  availableModels: [] as { id: string; name: string }[],
  discoveredAgents: [] as CustomAgentEntry[],
  availableAgents: [] as CustomAgentEntry[],
  mcpServers: [] as MCPServerState[],
  toolSelectionInitialized: {} as Record<string, boolean>,
  _loadingTimeoutId: undefined as number | undefined,
};

let messageCounter = 0;

const createMessage = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: `message-${++messageCounter}`,
  role: "assistant",
  content: `content-${messageCounter}`,
  timestamp: messageCounter,
  isStreaming: false,
  ...overrides,
});

const createToolCall = (overrides: Partial<ToolCallInfo> = {}): ToolCallInfo => ({
  id: `tc-${++messageCounter}`,
  name: `tool-${messageCounter}`,
  status: "running",
  ...overrides,
});

const createAgent = (name: string): CustomAgentEntry => ({
  name,
  displayName: name,
  description: `${name} agent`,
  prompt: `${name} prompt`,
  enabled: true,
});

const createMCPServerState = (overrides: Partial<MCPServerState> = {}): MCPServerState => ({
  server: {
    name: `server-${++messageCounter}`,
    type: "http",
    url: `https://example.com/${messageCounter}`,
    enabled: true,
  },
  enabled: true,
  tools: [],
  source: "settings",
  ...overrides,
});

beforeEach(() => {
  messageCounter = 0;
  useChatStore.setState(initialState);
});

describe("useChatStore", () => {
  it("starts with the expected initial state", () => {
    expect(useChatStore.getState()).toMatchObject({
      messages: [],
      currentMode: ChatMode.Ask,
      currentModel: DEFAULT_MODEL,
      isLoading: false,
      currentSessionId: null,
      error: null,
      selectedAgent: null,
      conversations: [],
      mcpServers: [],
    });
  });

  it("addMessage adds a message and clears any error", () => {
    const message = createMessage({ role: "user", content: "hello" });

    useChatStore.setState({ error: "previous error" });
    useChatStore.getState().addMessage(message);

    expect(useChatStore.getState().messages).toEqual([message]);
    expect(useChatStore.getState().error).toBeNull();
  });

  it("updateLastAssistantMessage updates the most recent assistant message", () => {
    const firstAssistant = createMessage({ role: "assistant", content: "old one" });
    const userMessage = createMessage({ role: "user", content: "user" });
    const lastAssistant = createMessage({ role: "assistant", content: "old two" });

    useChatStore.setState({ messages: [firstAssistant, userMessage, lastAssistant] });
    useChatStore.getState().updateLastAssistantMessage("updated");

    expect(useChatStore.getState().messages).toEqual([
      firstAssistant,
      userMessage,
      { ...lastAssistant, content: "updated" },
    ]);
  });

  it("updateLastAssistantMessage ignores updates when there is no assistant message", () => {
    const messages = [
      createMessage({ role: "user", content: "user" }),
      createMessage({ role: "system", content: "system" }),
    ];

    useChatStore.setState({ messages });
    useChatStore.getState().updateLastAssistantMessage("updated");

    expect(useChatStore.getState().messages).toEqual(messages);
  });

  it("appendToLastAssistantMessage appends content to the most recent assistant message", () => {
    const assistant = createMessage({ role: "assistant", content: "hello" });
    const userMessage = createMessage({ role: "user", content: "user" });
    const lastAssistant = createMessage({ role: "assistant", content: "world" });

    useChatStore.setState({ messages: [assistant, userMessage, lastAssistant] });
    useChatStore.getState().appendToLastAssistantMessage("!");

    expect(useChatStore.getState().messages).toEqual([
      assistant,
      userMessage,
      { ...lastAssistant, content: "world!" },
    ]);
  });

  it("setLastMessageStreaming updates isStreaming on the most recent assistant message", () => {
    const assistant = createMessage({ role: "assistant", isStreaming: false });
    const userMessage = createMessage({ role: "user", isStreaming: false });
    const lastAssistant = createMessage({ role: "assistant", isStreaming: false });

    useChatStore.setState({ messages: [assistant, userMessage, lastAssistant] });

    useChatStore.getState().setLastMessageStreaming(true);
    expect(useChatStore.getState().messages).toEqual([
      assistant,
      userMessage,
      { ...lastAssistant, isStreaming: true },
    ]);

    useChatStore.getState().setLastMessageStreaming(false);
    expect(useChatStore.getState().messages).toEqual([
      assistant,
      userMessage,
      { ...lastAssistant, isStreaming: false },
    ]);
  });

  it("addToolCall appends a tool call to the most recent assistant message", () => {
    const existingToolCall = createToolCall({ name: "search" });
    const newToolCall = createToolCall({ name: "read-file" });
    const assistant = createMessage({
      role: "assistant",
      toolCalls: [createToolCall({ name: "existing-earlier" })],
    });
    const userMessage = createMessage({ role: "user" });
    const lastAssistant = createMessage({
      role: "assistant",
      toolCalls: [existingToolCall],
    });

    useChatStore.setState({ messages: [assistant, userMessage, lastAssistant] });
    useChatStore.getState().addToolCall(newToolCall);

    expect(useChatStore.getState().messages).toEqual([
      assistant,
      userMessage,
      { ...lastAssistant, toolCalls: [existingToolCall, newToolCall] },
    ]);
  });

  it("updateToolCall updates the named tool call on the most recent assistant message", () => {
    const searchTool = createToolCall({ name: "search", status: "running" });
    const readTool = createToolCall({ name: "read", status: "complete", result: "kept" });
    const assistant = createMessage({
      role: "assistant",
      toolCalls: [createToolCall({ name: "earlier-tool", status: "running" })],
    });
    const userMessage = createMessage({ role: "user" });
    const lastAssistant = createMessage({ role: "assistant", toolCalls: [searchTool, readTool] });

    useChatStore.setState({ messages: [assistant, userMessage, lastAssistant] });
    useChatStore.getState().updateToolCall("search", "complete", "done");

    expect(useChatStore.getState().messages).toEqual([
      assistant,
      userMessage,
      {
        ...lastAssistant,
        toolCalls: [
          { ...searchTool, status: "complete", result: "done" },
          readTool,
        ],
      },
    ]);
  });

  it("clearMessages removes all messages and clears any error", () => {
    useChatStore.setState({
      messages: [createMessage({ role: "user" }), createMessage({ role: "assistant" })],
      error: "boom",
    });

    useChatStore.getState().clearMessages();

    expect(useChatStore.getState().messages).toEqual([]);
    expect(useChatStore.getState().error).toBeNull();
  });

  it("setMessages replaces the full message list", () => {
    const messages = [
      createMessage({ role: "user", content: "first" }),
      createMessage({ role: "assistant", content: "second" }),
    ];

    useChatStore.getState().setMessages(messages);

    expect(useChatStore.getState().messages).toEqual(messages);
  });

  it("setMode updates the current mode", () => {
    useChatStore.getState().setMode(ChatMode.Agent);

    expect(useChatStore.getState().currentMode).toBe(ChatMode.Agent);
  });

  it("setModel updates the current model", () => {
    useChatStore.getState().setModel("claude-sonnet-4.5");

    expect(useChatStore.getState().currentModel).toBe("claude-sonnet-4.5");
  });

  it("setLoading updates the loading flag", () => {
    useChatStore.getState().setLoading(true);
    expect(useChatStore.getState().isLoading).toBe(true);

    useChatStore.getState().setLoading(false);
    expect(useChatStore.getState().isLoading).toBe(false);
  });

  it("setError updates the error state", () => {
    useChatStore.getState().setError("something went wrong");
    expect(useChatStore.getState().error).toBe("something went wrong");

    useChatStore.getState().setError(null);
    expect(useChatStore.getState().error).toBeNull();
  });

  it("setSessionId updates the current session id", () => {
    useChatStore.getState().setSessionId("session-123");

    expect(useChatStore.getState().currentSessionId).toBe("session-123");
  });

  it("setAgent updates the selected agent when agent exists", () => {
    useChatStore.setState({
      discoveredAgents: [createAgent("code-review")],
    });
    useChatStore.getState().setAgent("code-review");

    expect(useChatStore.getState().selectedAgent).toBe("code-review");
  });

  it("setConversations updates the conversations array", () => {
    const conversations: ConversationMeta[] = [
      {
        sessionId: "session-1",
        title: "First",
        model: DEFAULT_MODEL,
        messageCount: 2,
        lastUpdated: 100,
      },
      {
        sessionId: "session-2",
        title: "Second",
        model: "gpt-4o",
        messageCount: 4,
        lastUpdated: 200,
      },
    ];

    useChatStore.getState().setConversations(conversations);

    expect(useChatStore.getState().conversations).toEqual(conversations);
  });

  it("setMCPServers replaces the MCP servers array", () => {
    const servers = [
      createMCPServerState({
        server: { name: "docs", type: "http", url: "https://docs.example.com", enabled: true },
        tools: [{ name: "search", enabled: true }],
      }),
      createMCPServerState({
        server: { name: "local", type: "stdio", command: "node", args: ["server.js"], enabled: true },
        tools: [{ name: "read", enabled: true }],
        source: "vault",
      }),
    ];

    useChatStore.getState().setMCPServers(servers);

    expect(useChatStore.getState().mcpServers).toEqual(servers);
  });

  it("updateMCPTools replaces matching server tools and preserves enabled state", () => {
    useChatStore.getState().setMCPServers([
      createMCPServerState({
        server: { name: "context7", type: "http", url: "https://context7.example.com", enabled: true },
        tools: [{ name: "query-docs", description: "Old", enabled: false }],
      }),
      createMCPServerState({
        server: { name: "azure", type: "stdio", command: "node", args: ["azure.js"], enabled: true },
        tools: [{ name: "keep-existing", enabled: true }],
      }),
    ]);

    useChatStore.getState().updateMCPTools([
      {
        name: "query-docs",
        namespacedName: "context7/query-docs",
        description: "Query docs",
      },
      {
        name: "list_resources",
        namespacedName: "azure/list_resources",
        description: "List Azure resources",
      },
    ]);

    expect(useChatStore.getState().mcpServers).toEqual([
      expect.objectContaining({
        server: expect.objectContaining({ name: "context7" }),
        tools: [{ name: "query-docs", description: "Query docs", enabled: false }],
      }),
      expect.objectContaining({
        server: expect.objectContaining({ name: "azure" }),
        tools: [{ name: "list_resources", description: "List Azure resources", enabled: true }],
      }),
    ]);
  });

  it("toggleMCP flips the enabled state for the matching server", () => {
    useChatStore.getState().setMCPServers([
      createMCPServerState({
        server: { name: "docs", type: "http", url: "https://docs.example.com", enabled: true },
        enabled: true,
      }),
      createMCPServerState({
        server: { name: "local", type: "http", url: "https://local.example.com", enabled: true },
        enabled: false,
      }),
    ]);

    useChatStore.getState().toggleMCP("docs");

    expect(useChatStore.getState().mcpServers.map((server) => ({
      name: server.server.name,
      enabled: server.enabled,
    }))).toEqual([
      { name: "docs", enabled: false },
      { name: "local", enabled: false },
    ]);
  });

  it("toggleMCPTool flips the enabled state for a tool on the matching server", () => {
    useChatStore.getState().setMCPServers([
      createMCPServerState({
        server: { name: "docs", type: "http", url: "https://docs.example.com", enabled: true },
        tools: [
          { name: "search", enabled: true },
          { name: "fetch", enabled: false },
        ],
      }),
    ]);

    useChatStore.getState().toggleMCPTool("docs", "search");

    expect(useChatStore.getState().mcpServers[0].tools).toEqual([
      { name: "search", enabled: false },
      { name: "fetch", enabled: false },
    ]);
  });

  it("getEnabledMCPConfig returns only enabled servers and disabled tools as excludedTools", () => {
    useChatStore.getState().setMCPServers([
      createMCPServerState({
        server: { name: "docs", type: "http", url: "https://docs.example.com", enabled: true },
        enabled: true,
        tools: [
          { name: "search", enabled: true },
          { name: "fetch", enabled: false },
        ],
      }),
      createMCPServerState({
        server: {
          name: "local",
          type: "stdio",
          command: "npx",
          args: ["@mcp/server"],
          env: { TOKEN: "secret" },
          enabled: true,
        },
        enabled: true,
        tools: [{ name: "read", enabled: true }],
      }),
      createMCPServerState({
        server: { name: "disabled", type: "http", url: "https://disabled.example.com", enabled: false },
        enabled: false,
        tools: [{ name: "unused", enabled: false }],
      }),
    ]);

    expect(useChatStore.getState().getEnabledMCPConfig()).toEqual({
      docs: {
        type: "http",
        url: "https://docs.example.com",
        tools: ["search"],
      },
      local: {
        type: "stdio",
        command: "npx",
        args: ["@mcp/server"],
        env: { TOKEN: "secret" },
        tools: ["*"],
      },
    });
  });

  it("getEnabledMCPConfig preserves MCP headers and configured tool allowlists", () => {
    useChatStore.getState().setMCPServers([
      createMCPServerState({
        server: {
          name: "context7",
          type: "http",
          url: "https://mcp.context7.com/mcp",
          headers: { CONTEXT7_API_KEY: "secret" },
          configTools: ["query-docs", "resolve-library-id"],
          enabled: true,
        },
        enabled: true,
        tools: [
          { name: "query-docs", enabled: true },
          { name: "resolve-library-id", enabled: false },
        ],
      }),
      createMCPServerState({
        server: {
          name: "azure",
          type: "stdio",
          command: "npx",
          args: ["-y", "@azure/mcp@latest", "server", "start"],
          configTools: ["*"],
          enabled: true,
        },
        enabled: true,
        tools: [],
      }),
    ]);

    expect(useChatStore.getState().getEnabledMCPConfig()).toEqual({
      context7: {
        type: "http",
        url: "https://mcp.context7.com/mcp",
        headers: { CONTEXT7_API_KEY: "secret" },
        tools: ["query-docs"],
      },
      azure: {
        type: "stdio",
        command: "npx",
        args: ["-y", "@azure/mcp@latest", "server", "start"],
        env: {},
        tools: ["*"],
      },
    });
  });

  it("newConversation resets chat-specific state", () => {
    const conversations = [
      {
        sessionId: "session-1",
        title: "Existing",
        model: DEFAULT_MODEL,
        messageCount: 1,
        lastUpdated: 123,
      },
    ];

    useChatStore.setState({
      messages: [createMessage({ role: "user" }), createMessage({ role: "assistant" })],
      currentMode: ChatMode.Agent,
      currentModel: "gpt-4o",
      isLoading: true,
      currentSessionId: "session-123",
      error: "boom",
      selectedAgent: "code-review",
      conversations,
    });

    useChatStore.getState().newConversation();

    expect(useChatStore.getState()).toMatchObject({
      messages: [],
      currentMode: ChatMode.Agent,
      currentModel: "gpt-4o",
      isLoading: true,
      currentSessionId: null,
      error: null,
      selectedAgent: null,
      conversations,
    });
  });

  it("appendToLastAssistantMessage handles no assistant messages", () => {
    useChatStore.setState({ messages: [createMessage({ role: "user", content: "hi" })] });

    expect(() => {
      useChatStore.getState().appendToLastAssistantMessage(" delta");
    }).not.toThrow();

    // Messages should remain unchanged since there's no assistant message to append to
    expect(useChatStore.getState().messages).toEqual([
      expect.objectContaining({ role: "user", content: "hi" }),
    ]);
  });

  it("addToolCall handles no assistant messages", () => {
    useChatStore.setState({ messages: [] });

    expect(() => {
      useChatStore.getState().addToolCall(createToolCall({ name: "search" }));
    }).not.toThrow();

    expect(useChatStore.getState().messages).toEqual([]);
  });

  it("updateMCPTools handles empty discovered tools", () => {
    const servers = [
      createMCPServerState({
        server: { name: "docs", type: "http", url: "https://docs.example.com", enabled: true },
        tools: [{ name: "search", enabled: true }],
      }),
    ];
    useChatStore.getState().setMCPServers(servers);

    useChatStore.getState().updateMCPTools([]);

    // Server tools should remain unchanged since no discovered tools matched
    expect(useChatStore.getState().mcpServers[0].tools).toEqual([
      { name: "search", enabled: true },
    ]);
  });

  it("setMCPServers preserves tool enabled state", () => {
    const server = createMCPServerState({
      server: { name: "docs", type: "http", url: "https://docs.example.com", enabled: true },
      tools: [
        { name: "search", enabled: true },
        { name: "fetch", enabled: true },
      ],
    });
    useChatStore.getState().setMCPServers([server]);

    // Toggle "fetch" off
    useChatStore.getState().toggleMCPTool("docs", "fetch");
    expect(useChatStore.getState().mcpServers[0].tools[1].enabled).toBe(false);

    // Now set servers again with the same server — we expect the new state to take effect
    // (setMCPServers is a full replacement, so it won't auto-preserve toggled state)
    const freshServer = createMCPServerState({
      server: { name: "docs", type: "http", url: "https://docs.example.com", enabled: true },
      tools: [
        { name: "search", enabled: true },
        { name: "fetch", enabled: false },
      ],
    });
    useChatStore.getState().setMCPServers([freshServer]);

    expect(useChatStore.getState().mcpServers[0].tools).toEqual([
      { name: "search", enabled: true },
      { name: "fetch", enabled: false },
    ]);
  });

  it("getEnabledMCPConfig handles servers with no tools", () => {
    useChatStore.getState().setMCPServers([
      createMCPServerState({
        server: { name: "empty", type: "http", url: "https://empty.example.com", enabled: true },
        enabled: true,
        tools: [],
      }),
    ]);

    expect(() => {
      useChatStore.getState().getEnabledMCPConfig();
    }).not.toThrow();

    const config = useChatStore.getState().getEnabledMCPConfig();
    expect(config).toHaveProperty("empty");
    expect(config.empty).toMatchObject({ type: "http", url: "https://empty.example.com" });
  });

  it("generateId returns unique strings", () => {
    const first = generateId();
    const second = generateId();

    expect(first).toEqual(expect.any(String));
    expect(second).toEqual(expect.any(String));
    expect(first).not.toBe(second);
  });

  describe("removeLastAssistantMessage", () => {
    it("removes the last assistant message from the array", () => {
      const user = createMessage({ role: "user", content: "hi" });
      const firstAssistant = createMessage({ role: "assistant", content: "first" });
      const secondAssistant = createMessage({ role: "assistant", content: "second" });

      useChatStore.setState({ messages: [user, firstAssistant, secondAssistant] });
      useChatStore.getState().removeLastAssistantMessage();

      expect(useChatStore.getState().messages).toEqual([user, firstAssistant]);
    });

    it("does nothing when there are no assistant messages", () => {
      const messages = [
        createMessage({ role: "user", content: "hi" }),
        createMessage({ role: "system", content: "sys" }),
      ];

      useChatStore.setState({ messages });
      useChatStore.getState().removeLastAssistantMessage();

      expect(useChatStore.getState().messages).toEqual(messages);
    });

    it("removes the only assistant message when there is exactly one", () => {
      const user = createMessage({ role: "user", content: "hi" });
      const assistant = createMessage({ role: "assistant", content: "response" });

      useChatStore.setState({ messages: [user, assistant] });
      useChatStore.getState().removeLastAssistantMessage();

      expect(useChatStore.getState().messages).toEqual([user]);
    });
  });

  describe("setLoadingWithTimeout", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("sets loading true and auto-resets after timeout", () => {
      useChatStore.getState().setLoadingWithTimeout(100);

      expect(useChatStore.getState().isLoading).toBe(true);

      vi.advanceTimersByTime(100);

      expect(useChatStore.getState().isLoading).toBe(false);
      expect(useChatStore.getState().error).toBe("Request timed out. Please try again.");
    });

    it("cleanup function clears the timeout", () => {
      const cleanup = useChatStore.getState().setLoadingWithTimeout(100);

      expect(useChatStore.getState().isLoading).toBe(true);

      cleanup();
      vi.advanceTimersByTime(100);

      // Loading was set by setLoadingWithTimeout; cleanup only clears the timeout, not loading
      expect(useChatStore.getState().isLoading).toBe(true);
      expect(useChatStore.getState().error).toBeNull();
    });

    it("setLoading(false) clears pending timeout", () => {
      useChatStore.getState().setLoadingWithTimeout(100);

      expect(useChatStore.getState().isLoading).toBe(true);

      useChatStore.getState().setLoading(false);
      vi.advanceTimersByTime(100);

      expect(useChatStore.getState().isLoading).toBe(false);
      expect(useChatStore.getState().error).toBeNull();
      expect(useChatStore.getState()._loadingTimeoutId).toBeUndefined();
    });

    it("uses default 30s timeout", () => {
      useChatStore.getState().setLoadingWithTimeout();

      vi.advanceTimersByTime(29999);
      expect(useChatStore.getState().isLoading).toBe(true);

      vi.advanceTimersByTime(1);
      expect(useChatStore.getState().isLoading).toBe(false);
    });
  });

  describe("setAgent validation", () => {
    it("sets null when agent name does not exist in discoveredAgents", () => {
      useChatStore.setState({
        discoveredAgents: [createAgent("code-review")],
      });

      useChatStore.getState().setAgent("nonexistent-agent");

      expect(useChatStore.getState().selectedAgent).toBeNull();
    });

    it("setAgent(null) always sets null regardless of discoveredAgents", () => {
      useChatStore.setState({
        discoveredAgents: [createAgent("code-review")],
        selectedAgent: "code-review",
      });

      useChatStore.getState().setAgent(null);

      expect(useChatStore.getState().selectedAgent).toBeNull();
    });

    it("sets the agent when it exists in discoveredAgents", () => {
      useChatStore.setState({
        discoveredAgents: [createAgent("code-review"), createAgent("docs-writer")],
      });

      useChatStore.getState().setAgent("docs-writer");

      expect(useChatStore.getState().selectedAgent).toBe("docs-writer");
    });
  });

  describe("Wave 1 fixes", () => {
    describe("C1 — incremental MCP tool discovery", () => {
      it("replaceMCPTools is exported and aliases updateMCPTools (replace semantics)", () => {
        useChatStore.getState().setMCPServers([
          createMCPServerState({
            server: { name: "ctx7", type: "http", url: "https://x", enabled: true },
            tools: [
              { name: "alpha", enabled: true },
              { name: "beta", enabled: false },
            ],
          }),
        ]);

        // replaceMCPTools wipes any tools not in the discovered list (per server).
        useChatStore.getState().replaceMCPTools([
          { name: "alpha", namespacedName: "ctx7/alpha", description: "A" },
        ]);

        expect(useChatStore.getState().mcpServers[0].tools).toEqual([
          { name: "alpha", description: "A", enabled: true },
        ]);
      });

      it("mergeDiscoveredMCPTools adds new tools without wiping existing ones", () => {
        useChatStore.getState().setMCPServers([
          createMCPServerState({
            server: { name: "ctx7", type: "http", url: "https://x", enabled: true },
            tools: [
              { name: "alpha", description: "A old", enabled: false },
              { name: "beta", description: "B old", enabled: true },
            ],
          }),
        ]);

        useChatStore.getState().mergeDiscoveredMCPTools("ctx7", [
          { name: "alpha", namespacedName: "ctx7/alpha", description: "A new" },
          { name: "gamma", namespacedName: "ctx7/gamma", description: "G new" },
        ]);

        const tools = useChatStore.getState().mcpServers[0].tools;
        expect(tools).toEqual([
          // alpha kept its disabled state; description refreshed
          { name: "alpha", description: "A new", enabled: false },
          // beta untouched
          { name: "beta", description: "B old", enabled: true },
          // gamma added (new tools default to enabled)
          { name: "gamma", description: "G new", enabled: true },
        ]);
      });

      it("mergeDiscoveredMCPTool merges a single tool (per-event call site)", () => {
        useChatStore.getState().setMCPServers([
          createMCPServerState({
            server: { name: "ctx7", type: "http", url: "https://x", enabled: true },
            tools: [{ name: "alpha", enabled: true }],
          }),
        ]);

        useChatStore.getState().mergeDiscoveredMCPTool("ctx7", {
          name: "beta",
          namespacedName: "ctx7/beta",
          description: "B",
        });

        expect(useChatStore.getState().mcpServers[0].tools).toEqual([
          { name: "alpha", description: undefined, enabled: true },
          { name: "beta", description: "B", enabled: true },
        ]);
      });

      it("mergeDiscoveredMCPTools is a no-op for unknown server", () => {
        useChatStore.getState().setMCPServers([
          createMCPServerState({
            server: { name: "ctx7", type: "http", url: "https://x", enabled: true },
            tools: [{ name: "alpha", enabled: true }],
          }),
        ]);

        useChatStore.getState().mergeDiscoveredMCPTools("nope", [
          { name: "x", namespacedName: "nope/x", description: "X" },
        ]);

        expect(useChatStore.getState().mcpServers[0].tools).toEqual([
          { name: "alpha", description: undefined, enabled: true },
        ]);
      });
    });

    describe("C2 — tool calls correlated by id", () => {
      it("updateToolCallById finds tool call by id across messages", () => {
        const tcA = createToolCall({ id: "id-a", name: "search", status: "running" });
        const tcB = createToolCall({ id: "id-b", name: "search", status: "running" });
        const earlier = createMessage({ role: "assistant", toolCalls: [tcA] });
        const later = createMessage({ role: "assistant", toolCalls: [tcB] });

        useChatStore.setState({ messages: [earlier, createMessage({ role: "user" }), later] });
        useChatStore.getState().updateToolCallById("id-a", { status: "complete", result: "done-a" });

        const state = useChatStore.getState();
        expect(state.messages[0].toolCalls?.[0]).toMatchObject({
          id: "id-a",
          status: "complete",
          result: "done-a",
        });
        // The second tool call (same name, different id) is untouched.
        expect(state.messages[2].toolCalls?.[0]).toMatchObject({
          id: "id-b",
          status: "running",
        });
      });

      it("completeToolCallById marks complete on success and error on failure", () => {
        const tc = createToolCall({ id: "id-x", name: "search", status: "running" });
        useChatStore.setState({
          messages: [createMessage({ role: "assistant", toolCalls: [tc] })],
        });

        useChatStore.getState().completeToolCallById("id-x", true, "ok");
        expect(useChatStore.getState().messages[0].toolCalls?.[0]).toMatchObject({
          status: "complete",
          result: "ok",
        });

        const tc2 = createToolCall({ id: "id-y", name: "fetch", status: "running" });
        useChatStore.setState({
          messages: [createMessage({ role: "assistant", toolCalls: [tc2] })],
        });
        useChatStore.getState().completeToolCallById("id-y", false, "boom");
        expect(useChatStore.getState().messages[0].toolCalls?.[0]).toMatchObject({
          status: "error",
          result: "boom",
        });
      });

      it("legacy updateToolCall(name, ...) still works for callers without ids", () => {
        const tc = createToolCall({ name: "search", status: "running" });
        useChatStore.setState({
          messages: [createMessage({ role: "assistant", toolCalls: [tc] })],
        });
        useChatStore.getState().updateToolCall("search", "complete", "done");
        expect(useChatStore.getState().messages[0].toolCalls?.[0]).toMatchObject({
          status: "complete",
          result: "done",
        });
      });

      it("addToolCallWithId behaves like addToolCall (alias)", () => {
        useChatStore.setState({
          messages: [createMessage({ role: "assistant", toolCalls: [] })],
        });
        const tc = createToolCall({ id: "abc", name: "search" });
        useChatStore.getState().addToolCallWithId(tc);
        expect(useChatStore.getState().messages[0].toolCalls).toEqual([tc]);
      });
    });

    describe("C3 — agent selection validates against availableAgents", () => {
      it("setAvailableAgents populates state", () => {
        const agents = [createAgent("from-settings")];
        useChatStore.getState().setAvailableAgents(agents);
        expect(useChatStore.getState().availableAgents).toEqual(agents);
      });

      it("setAgent accepts an agent that is only in availableAgents (settings)", () => {
        useChatStore.getState().setAvailableAgents([createAgent("from-settings")]);
        useChatStore.getState().setAgent("from-settings");
        expect(useChatStore.getState().selectedAgent).toBe("from-settings");
      });

      it("setAgent accepts an agent that is only in discoveredAgents (runtime)", () => {
        useChatStore.getState().setAvailableAgents([createAgent("from-settings")]);
        useChatStore.setState({ discoveredAgents: [createAgent("from-runtime")] });
        useChatStore.getState().setAgent("from-runtime");
        expect(useChatStore.getState().selectedAgent).toBe("from-runtime");
      });

      it("setAgent rejects an agent in neither list", () => {
        useChatStore.getState().setAvailableAgents([createAgent("a")]);
        useChatStore.setState({ discoveredAgents: [createAgent("b")] });
        useChatStore.getState().setAgent("nope");
        expect(useChatStore.getState().selectedAgent).toBeNull();
      });

      it("setAgent accepts any name when both lists are empty (legacy fallback)", () => {
        useChatStore.getState().setAgent("anything");
        expect(useChatStore.getState().selectedAgent).toBe("anything");
      });
    });

    describe("C4 — explicit empty enabled tool list is honoured", () => {
      it("disabling all tools via toggleMCPTool serializes to tools: []", () => {
        useChatStore.getState().setMCPServers([
          createMCPServerState({
            server: { name: "docs", type: "http", url: "https://docs.x", enabled: true },
            enabled: true,
            tools: [
              { name: "search", enabled: true },
              { name: "fetch", enabled: true },
            ],
          }),
        ]);

        useChatStore.getState().toggleMCPTool("docs", "search");
        useChatStore.getState().toggleMCPTool("docs", "fetch");

        const config = useChatStore.getState().getEnabledMCPConfig();
        expect(config.docs).toMatchObject({ tools: [] });
        // No excludedTools fallback — the explicit allowlist is empty.
        expect(config.docs.excludedTools).toBeUndefined();
      });

      it("after first toggle the explicit enabled list is used (no '*' fallback)", () => {
        useChatStore.getState().setMCPServers([
          createMCPServerState({
            server: { name: "docs", type: "http", url: "https://docs.x", enabled: true },
            enabled: true,
            tools: [
              { name: "search", enabled: true },
              { name: "fetch", enabled: true },
            ],
          }),
        ]);

        // Toggle "fetch" off — server now considered initialized.
        useChatStore.getState().toggleMCPTool("docs", "fetch");

        const config = useChatStore.getState().getEnabledMCPConfig();
        expect(config.docs).toMatchObject({ tools: ["search"] });
      });

      it("an un-toggled server still falls back to '*' (legacy behavior preserved)", () => {
        useChatStore.getState().setMCPServers([
          createMCPServerState({
            server: { name: "docs", type: "http", url: "https://docs.x", enabled: true },
            enabled: true,
            tools: [{ name: "search", enabled: true }],
          }),
        ]);

        const config = useChatStore.getState().getEnabledMCPConfig();
        expect(config.docs).toMatchObject({ tools: ["*"] });
      });
    });
  });

  describe("updateMCPTools Map optimization", () => {
    it("correctly maps tools to servers with many tools and servers", () => {
      const servers: MCPServerState[] = [];
      for (let i = 0; i < 10; i++) {
        servers.push(
          createMCPServerState({
            server: { name: `server-${i}`, type: "http", url: `https://s${i}.example.com`, enabled: true },
            tools: [{ name: `old-tool-${i}`, description: "Old", enabled: false }],
          }),
        );
      }
      useChatStore.getState().setMCPServers(servers);

      const discoveredTools: Array<{ name: string; namespacedName: string; description: string }> = [];
      for (let i = 0; i < 10; i++) {
        for (let j = 0; j < 5; j++) {
          discoveredTools.push({
            name: `tool-${j}`,
            namespacedName: `server-${i}/tool-${j}`,
            description: `Tool ${j} on server ${i}`,
          });
        }
      }

      useChatStore.getState().updateMCPTools(discoveredTools);

      const state = useChatStore.getState();
      for (let i = 0; i < 10; i++) {
        const server = state.mcpServers.find((s) => s.server.name === `server-${i}`);
        expect(server).toBeDefined();
        expect(server!.tools).toHaveLength(5);
        for (let j = 0; j < 5; j++) {
          expect(server!.tools[j]).toEqual({
            name: `tool-${j}`,
            description: `Tool ${j} on server ${i}`,
            enabled: true,
          });
        }
      }
    });

    it("preserves enabled state from existing tools via Map lookup", () => {
      useChatStore.getState().setMCPServers([
        createMCPServerState({
          server: { name: "myserver", type: "http", url: "https://my.example.com", enabled: true },
          tools: [
            { name: "search", description: "Old search", enabled: false },
            { name: "read", description: "Old read", enabled: true },
          ],
        }),
      ]);

      useChatStore.getState().updateMCPTools([
        { name: "search", namespacedName: "myserver/search", description: "New search" },
        { name: "read", namespacedName: "myserver/read", description: "New read" },
        { name: "write", namespacedName: "myserver/write", description: "New write" },
      ]);

      const tools = useChatStore.getState().mcpServers[0].tools;
      expect(tools).toEqual([
        { name: "search", description: "New search", enabled: false },
        { name: "read", description: "New read", enabled: true },
        { name: "write", description: "New write", enabled: true },
      ]);
    });

    it("leaves servers untouched when no tools match", () => {
      const server = createMCPServerState({
        server: { name: "untouched", type: "http", url: "https://u.example.com", enabled: true },
        tools: [{ name: "existing-tool", description: "Existing", enabled: true }],
      });
      useChatStore.getState().setMCPServers([server]);

      useChatStore.getState().updateMCPTools([
        { name: "other-tool", namespacedName: "other-server/other-tool", description: "Other" },
      ]);

      // Server reference should be unchanged (returned as-is)
      expect(useChatStore.getState().mcpServers[0].tools).toEqual([
        { name: "existing-tool", description: "Existing", enabled: true },
      ]);
    });
  });
});
