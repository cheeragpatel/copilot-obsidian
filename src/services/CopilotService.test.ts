import { CopilotClient, defineTool } from "@github/copilot-sdk";
import { mockClient, mockSession } from "../__mocks__/copilot-sdk";
import { createMockApp } from "../__mocks__/obsidian";
import { CopilotService } from "./CopilotService";
import { ChatMode, DEFAULT_MODEL } from "../types/constants";
import { DEFAULT_SETTINGS, type PluginSettings } from "../types/settings";

const { mockDiscover } = vi.hoisted(() => ({
  mockDiscover: vi.fn(),
}));

vi.mock("@github/copilot-sdk", () => import("../__mocks__/copilot-sdk"));
vi.mock("./ConfigDiscovery", () => ({
  ConfigDiscovery: class {
    discover = mockDiscover;

    constructor(_app: any) {}
  },
}));
vi.mock("obsidian");

const createSettings = (overrides: Partial<PluginSettings> = {}): PluginSettings => ({
  ...DEFAULT_SETTINGS,
  ...overrides,
  mcpServers: overrides.mcpServers ?? [],
  customAgents: overrides.customAgents ?? [],
  skillDirectories: overrides.skillDirectories ?? [],
  disabledSkills: overrides.disabledSkills ?? [],
  excludedTools: overrides.excludedTools ?? [],
});

const createTool = (name: string, description: string) =>
  defineTool(
    name,
    {
      description,
      handler: vi.fn(async () => undefined),
    } as any,
  );

const createSessionMock = (overrides: Partial<typeof mockSession> = {}) => ({
  sessionId: "test-session-123",
  rpc: {
    tools: {
      list: vi.fn().mockResolvedValue({ tools: [] }),
    },
  },
  on: vi.fn().mockReturnValue(vi.fn()),
  send: vi.fn().mockResolvedValue(undefined),
  sendAndWait: vi.fn().mockResolvedValue({ data: { content: "test response" } }),
  abort: vi.fn().mockResolvedValue(undefined),
  destroy: vi.fn().mockResolvedValue(undefined),
  getMessages: vi.fn().mockResolvedValue([]),
  ...overrides,
});

describe("CopilotService", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockDiscover.mockReset();
    mockDiscover.mockResolvedValue({
      skills: [],
      mcpServers: [],
      instructions: "",
      agents: [],
    });

    mockClient.start.mockResolvedValue(undefined);
    mockClient.stop.mockResolvedValue(undefined);
    mockClient.createSession.mockResolvedValue(mockSession);
    mockClient.resumeSession.mockResolvedValue(mockSession);
    mockClient.listTools.mockResolvedValue([]);
    mockClient.listSessions.mockResolvedValue([]);
    mockClient.deleteSession.mockResolvedValue(undefined);
    mockClient.getState.mockReturnValue("connected");

    mockSession.on.mockReturnValue(vi.fn());
    mockSession.send.mockResolvedValue(undefined);
    mockSession.sendAndWait.mockResolvedValue({ data: { content: "test response" } });
    mockSession.abort.mockResolvedValue(undefined);
    mockSession.destroy.mockResolvedValue(undefined);
    mockSession.getMessages.mockResolvedValue([]);
    mockSession.rpc.tools.list.mockResolvedValue({ tools: [] });

    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("initialize() creates CopilotClient, starts it, and reports connected state", async () => {
    const service = new CopilotService(createMockApp(), createSettings({ cliPath: "custom-cli", logLevel: "warn" }));

    await service.initialize();

    expect((service as any).client).toBeInstanceOf(CopilotClient);
    expect(mockClient.start).toHaveBeenCalledTimes(1);
    expect(service.isConnected()).toBe(true);
  });

  it("initialize() failure throws when client.start() rejects", async () => {
    const error = new Error("failed to start");
    mockClient.start.mockRejectedValueOnce(error);
    const service = new CopilotService(createMockApp(), createSettings());

    await expect(service.initialize()).rejects.toThrow(error);
    expect(mockClient.start).toHaveBeenCalledTimes(1);
  });

  it("createSession() in Ask mode creates a session without tools", async () => {
    const service = new CopilotService(createMockApp(), createSettings({ defaultModel: "gpt-4o" }));
    const tool = createTool("search", "Search notes");

    await service.initialize();
    await service.createSession({ mode: ChatMode.Ask, tools: [tool] });

    expect(mockClient.createSession).toHaveBeenCalledWith(expect.objectContaining({
      model: "gpt-4o",
      streaming: true,
    }));
  });

  it("createSession() in Agent mode creates a session with tools", async () => {
    const service = new CopilotService(createMockApp(), createSettings());
    const tool = createTool("search", "Search notes");

    await service.initialize();
    await service.createSession({ mode: ChatMode.Agent, tools: [tool] });

    expect(mockClient.createSession).toHaveBeenCalledWith(expect.objectContaining({
      model: DEFAULT_MODEL,
      streaming: true,
      tools: [tool],
    }));
  });

  it("createSession() with MCP servers builds config and skips disabled servers", async () => {
    const service = new CopilotService(
      createMockApp(),
      createSettings({
        mcpServers: [
          {
            name: "docs",
            type: "http",
            url: "https://example.com/mcp",
            headers: { Authorization: "Bearer token" },
            configTools: ["query-docs"],
            enabled: true,
          },
          {
            name: "local",
            type: "stdio",
            command: "node",
            args: ["server.js"],
            env: { TOKEN: "secret" },
            configTools: ["*"],
            enabled: true,
          },
          { name: "disabled", type: "http", url: "https://disabled.example.com", enabled: false },
        ],
      }),
    );

    await service.initialize();
    await service.createSession();

    expect(mockClient.createSession).toHaveBeenCalledWith(expect.objectContaining({
      model: DEFAULT_MODEL,
      streaming: true,
      mcpServers: {
        docs: {
          type: "http",
          url: "https://example.com/mcp",
          headers: { Authorization: "Bearer token" },
          tools: ["query-docs"],
        },
        local: {
          type: "stdio",
          command: "node",
          args: ["server.js"],
          env: { TOKEN: "secret" },
          tools: ["*"],
        },
      },
    }));
  });

  it("createSession() with custom agents filters disabled agents", async () => {
    const service = new CopilotService(
      createMockApp(),
      createSettings({
        customAgents: [
          {
            name: "planner",
            displayName: "Planner",
            description: "Plans work",
            prompt: "Plan tasks",
            enabled: true,
          },
          {
            name: "disabled-agent",
            displayName: "Disabled",
            description: "Should not be used",
            prompt: "Ignore this",
            enabled: false,
          },
        ],
      }),
    );

    await service.initialize();
    await service.createSession();

    expect(mockClient.createSession).toHaveBeenCalledWith(expect.objectContaining({
      model: DEFAULT_MODEL,
      streaming: true,
      customAgents: [
        {
          name: "planner",
          displayName: "Planner",
          description: "Plans work",
          prompt: "Plan tasks",
        },
      ],
    }));
  });

  it("createSession() with system message passes append mode config", async () => {
    const service = new CopilotService(createMockApp(), createSettings());

    await service.initialize();
    await service.createSession({ systemMessage: "Be helpful" });

    expect(mockClient.createSession).toHaveBeenCalledWith(expect.objectContaining({
      model: DEFAULT_MODEL,
      streaming: true,
      systemMessage: {
        mode: "append",
        content: "Be helpful",
      },
    }));
  });

  it("createSession() calls config discovery when inheritConfig is true", async () => {
    const service = new CopilotService(createMockApp(), createSettings({ inheritConfig: true }));

    await service.initialize();
    await service.createSession();

    expect(mockDiscover).toHaveBeenCalledTimes(1);
  });

  it("createSession() does not call config discovery when inheritConfig is false", async () => {
    const service = new CopilotService(createMockApp(), createSettings({ inheritConfig: false }));

    await service.initialize();
    await service.createSession();

    expect(mockDiscover).not.toHaveBeenCalled();
  });

  it("createSession() merges discovered MCP servers without overriding configured ones", async () => {
    mockDiscover.mockResolvedValueOnce({
      skills: [],
      instructions: "",
      mcpServers: [
        { name: "docs", type: "http", url: "https://discovered.example.com", enabled: true },
        {
          name: "vault",
          type: "stdio",
          command: "node",
          args: ["server.js"],
          env: { TOKEN: "secret" },
          configTools: ["*"],
          enabled: true,
        },
        {
          name: "context7",
          type: "http",
          url: "https://mcp.context7.com/mcp",
          headers: { CONTEXT7_API_KEY: "secret" },
          configTools: ["query-docs", "resolve-library-id"],
          enabled: true,
        },
      ],
    });
    const service = new CopilotService(
      createMockApp(),
      createSettings({
        mcpServers: [{ name: "docs", type: "http", url: "https://settings.example.com", enabled: true }],
      }),
    );

    await service.initialize();
    await service.createSession();

    expect(mockClient.createSession).toHaveBeenCalledWith(expect.objectContaining({
      model: DEFAULT_MODEL,
      streaming: true,
      mcpServers: {
        docs: {
          type: "http",
          url: "https://settings.example.com",
        },
        vault: {
          type: "stdio",
          command: "node",
          args: ["server.js"],
          env: { TOKEN: "secret" },
          tools: ["*"],
        },
        context7: {
          type: "http",
          url: "https://mcp.context7.com/mcp",
          headers: { CONTEXT7_API_KEY: "secret" },
          tools: ["query-docs", "resolve-library-id"],
        },
      },
    }));
  });

  it("createSession() prepends discovered instructions to the system message", async () => {
    mockDiscover.mockResolvedValueOnce({
      skills: [],
      mcpServers: [],
      instructions: "Repo instructions",
    });
    const service = new CopilotService(
      createMockApp(),
      createSettings({ systemMessage: "User instructions" }),
    );

    await service.initialize();
    await service.createSession();

    expect(mockClient.createSession).toHaveBeenCalledWith(expect.objectContaining({
      model: DEFAULT_MODEL,
      streaming: true,
      systemMessage: {
        mode: "append",
        content: "Repo instructions\n\nUser instructions",
      },
    }));
  });

  it("createSession() merges discovered skill directories with configured directories", async () => {
    mockDiscover.mockResolvedValueOnce({
      skills: [".github/skills", ".copilot/skills"],
      mcpServers: [],
      instructions: "",
    });
    const service = new CopilotService(
      createMockApp(),
      createSettings({ skillDirectories: ["vault/skills", ".github/skills"] }),
    );

    await service.initialize();
    await service.createSession();

    expect(mockClient.createSession).toHaveBeenCalledWith(expect.objectContaining({
      model: DEFAULT_MODEL,
      streaming: true,
      skillDirectories: ["vault/skills", ".github/skills", ".copilot/skills"],
    }));
  });

  it("createSession() destroys existing session first", async () => {
    const firstSession = createSessionMock({ sessionId: "session-1" });
    const secondSession = createSessionMock({ sessionId: "session-2" });
    mockClient.createSession.mockResolvedValueOnce(firstSession).mockResolvedValueOnce(secondSession);
    const service = new CopilotService(createMockApp(), createSettings());

    await service.initialize();
    await service.createSession();
    await service.createSession();

    expect(firstSession.destroy).toHaveBeenCalledTimes(1);
    expect(service.getSessionId()).toBe("session-2");
  });

  it("sendMessage() calls session.send with the prompt", async () => {
    const service = new CopilotService(createMockApp(), createSettings());

    await service.initialize();
    await service.createSession();
    await service.sendMessage("Hello Copilot");

    expect(mockSession.send).toHaveBeenCalledWith({ prompt: "Hello Copilot" });
  });

  it("sendMessage() with attachments includes file attachments", async () => {
    const service = new CopilotService(createMockApp(), createSettings());

    await service.initialize();
    await service.createSession();
    await service.sendMessage("Review this file", [
      { path: "Notes/test.md", name: "test.md", type: "text/markdown" },
    ]);

    expect(mockSession.send).toHaveBeenCalledWith({
      prompt: "Review this file",
      attachments: [
        {
          type: "file",
          path: "Notes/test.md",
          displayName: "test.md",
        },
      ],
    });
  });

  it("sendMessage() without a session throws an error", async () => {
    const service = new CopilotService(createMockApp(), createSettings());

    await expect(service.sendMessage("Hello")).rejects.toThrow("No active session. Call createSession() first.");
  });

  it("sendAndWait() returns content from the response", async () => {
    const service = new CopilotService(createMockApp(), createSettings());

    await service.initialize();
    await service.createSession();

    await expect(service.sendAndWait("Explain this")).resolves.toBe("test response");
    expect(mockSession.sendAndWait).toHaveBeenCalledWith({ prompt: "Explain this" }, 120000);
  });

  it("abort() calls session.abort", async () => {
    const service = new CopilotService(createMockApp(), createSettings());

    await service.initialize();
    await service.createSession();
    await service.abort();

    expect(mockSession.abort).toHaveBeenCalledTimes(1);
  });

  it("onEvent() registers a listener, receives events, and returns an unsubscribe function", async () => {
    type TestEvent = { type: string; data: { content: string } };

    const event: TestEvent = { type: "message", data: { content: "hello" } };
    const listener = vi.fn();
    let sessionHandler: ((event: TestEvent) => void) | undefined;

    mockSession.on.mockImplementation((callback: (incoming: TestEvent) => void) => {
      sessionHandler = callback;
      return vi.fn();
    });

    const service = new CopilotService(createMockApp(), createSettings());
    const unsubscribe = service.onEvent(listener);

    await service.initialize();
    await service.createSession();

    sessionHandler?.(event);
    expect(listener).toHaveBeenCalledWith(event);

    unsubscribe();
    sessionHandler?.(event);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("switchMode() updates mode and recreates the session", async () => {
    const firstSession = createSessionMock({ sessionId: "session-1" });
    const secondSession = createSessionMock({ sessionId: "session-2" });
    const tool = createTool("plan", "Plan work");
    mockClient.createSession.mockResolvedValueOnce(firstSession).mockResolvedValueOnce(secondSession);
    const service = new CopilotService(createMockApp(), createSettings());

    await service.initialize();
    await service.createSession({ mode: ChatMode.Ask });
    await service.switchMode(ChatMode.Agent, [tool]);

    expect(service.getMode()).toBe(ChatMode.Agent);
    expect(firstSession.destroy).toHaveBeenCalledTimes(1);
    expect(mockClient.createSession).toHaveBeenNthCalledWith(2, expect.objectContaining({
      model: DEFAULT_MODEL,
      streaming: true,
      tools: [tool],
    }));
  });

  it("getSessionId() returns the active session ID", async () => {
    const service = new CopilotService(createMockApp(), createSettings());

    expect(service.getSessionId()).toBeNull();

    await service.initialize();
    await service.createSession();

    expect(service.getSessionId()).toBe("test-session-123");
  });

  it("listTools() returns tools from session RPC and falls back to session.listTools", async () => {
    const service = new CopilotService(createMockApp(), createSettings());

    await service.initialize();
    await service.createSession();

    mockSession.rpc.tools.list.mockResolvedValueOnce({
      tools: [
        {
          name: "query-docs",
          namespacedName: "context7/query-docs",
          description: "Query docs",
        },
      ],
    });

    await expect(service.listTools()).resolves.toEqual([
      {
        name: "query-docs",
        namespacedName: "context7/query-docs",
        description: "Query docs",
      },
    ]);

    // When the primary RPC reports method-unsupported, discoverTools falls
    // through to the session's listTools strategy (no client.listTools probe).
    mockSession.rpc.tools.list.mockRejectedValueOnce(new Error("Method not found"));
    (mockSession as any).listTools = vi.fn().mockResolvedValueOnce([
      {
        name: "list_resources",
        namespacedName: "azure/list_resources",
        description: "List Azure resources",
      },
    ]);

    try {
      await expect(service.listTools()).resolves.toEqual([
        {
          name: "list_resources",
          namespacedName: "azure/list_resources",
          description: "List Azure resources",
        },
        {
          name: "query-docs",
          namespacedName: "context7/query-docs",
          description: "Query docs",
        },
      ]);
    } finally {
      delete (mockSession as any).listTools;
    }
  });

  it("listTools() caches tools discovered from tool execution events", async () => {
    let sessionHandler: ((event: any) => void) | undefined;
    mockSession.on.mockImplementationOnce((callback: (event: any) => void) => {
      sessionHandler = callback;
      return vi.fn();
    });

    const service = new CopilotService(createMockApp(), createSettings());

    await service.initialize();
    await service.createSession();

    mockSession.rpc.tools.list.mockRejectedValueOnce(new Error("Method not found"));

    sessionHandler?.({
      type: "tool.execution_start",
      data: {
        toolName: "query-docs",
        serverName: "context7",
        description: "Query docs",
      },
    });

    await expect(service.listTools()).resolves.toEqual([
      {
        name: "query-docs",
        namespacedName: "context7/query-docs",
        description: "Query docs",
      },
    ]);
  });

  it("resumeSession() calls client.resumeSession with the session ID", async () => {
    const tool = createTool("plan", "Plan work");
    const service = new CopilotService(createMockApp(), createSettings());

    await service.initialize();
    await service.resumeSession("resume-me", [tool]);

    expect(mockClient.resumeSession).toHaveBeenCalledTimes(1);
    const [sessionId, options] = mockClient.resumeSession.mock.calls[0];
    expect(sessionId).toBe("resume-me");
    expect(options.tools).toEqual([tool]);
    expect(options.onPermissionRequest).toEqual(expect.any(Function));
  });

  it("listSessions() returns the client session list", async () => {
    const sessions = [{ sessionId: "one" }, { sessionId: "two" }];
    mockClient.listSessions.mockResolvedValueOnce(sessions);
    const service = new CopilotService(createMockApp(), createSettings());

    await service.initialize();

    await expect(service.listSessions()).resolves.toEqual(sessions);
  });

  it("deleteSession() calls client.deleteSession", async () => {
    const service = new CopilotService(createMockApp(), createSettings());

    await service.initialize();
    await service.deleteSession("session-to-delete");

    expect(mockClient.deleteSession).toHaveBeenCalledWith("session-to-delete");
  });

  it("isConnected() returns true when connected and false when not", async () => {
    const service = new CopilotService(createMockApp(), createSettings());

    expect(service.isConnected()).toBe(false);

    await service.initialize();
    expect(service.isConnected()).toBe(true);

    mockClient.getState.mockReturnValue("disconnected");
    expect(service.isConnected()).toBe(false);
  });

  it("updateSettings() updates the internal settings reference", async () => {
    const updatedSettings = createSettings({
      systemMessage: "Updated system message",
      skillDirectories: ["skills"],
      disabledSkills: ["old-skill"],
      excludedTools: ["terminal"],
    });
    const service = new CopilotService(createMockApp(), createSettings());

    service.updateSettings(updatedSettings);
    await service.initialize();
    await service.createSession();

    expect((service as any).settings).toBe(updatedSettings);
    expect(mockClient.createSession).toHaveBeenCalledWith(expect.objectContaining({
      model: DEFAULT_MODEL,
      streaming: true,
      skillDirectories: ["skills"],
      disabledSkills: ["old-skill"],
      excludedTools: ["terminal"],
      systemMessage: {
        mode: "append",
        content: "Updated system message",
      },
    }));
  });

  it("destroy() stops the client, destroys the session, and clears listeners", async () => {
    const service = new CopilotService(createMockApp(), createSettings());
    service.onEvent(vi.fn());

    await service.initialize();
    await service.createSession();
    await service.destroy();

    expect(mockSession.destroy).toHaveBeenCalledTimes(1);
    expect(mockClient.stop).toHaveBeenCalledTimes(1);
    expect((service as any).session).toBeNull();
    expect((service as any).client).toBeNull();
    expect((service as any).eventListeners.size).toBe(0);
  });

  it("destroy() ignores cleanup errors", async () => {
    mockSession.destroy.mockRejectedValueOnce(new Error("session cleanup failed"));
    mockClient.stop.mockRejectedValueOnce(new Error("client cleanup failed"));
    const service = new CopilotService(createMockApp(), createSettings());
    service.onEvent(vi.fn());

    await service.initialize();
    await service.createSession();

    await expect(service.destroy()).resolves.toBeUndefined();
    expect((service as any).eventListeners.size).toBe(0);
  });

  it("createSession() unsubscribes old session listener before destroying", async () => {
    const unsubscribe1 = vi.fn();
    const unsubscribe2 = vi.fn();
    const firstSession = createSessionMock({ sessionId: "session-1" });
    const secondSession = createSessionMock({ sessionId: "session-2" });
    firstSession.on.mockReturnValue(unsubscribe1);
    secondSession.on.mockReturnValue(unsubscribe2);
    mockClient.createSession.mockResolvedValueOnce(firstSession).mockResolvedValueOnce(secondSession);

    const service = new CopilotService(createMockApp(), createSettings());

    await service.initialize();
    await service.createSession();
    expect(firstSession.on).toHaveBeenCalledTimes(1);

    await service.createSession();
    expect(unsubscribe1).toHaveBeenCalledTimes(1);
    expect(secondSession.on).toHaveBeenCalledTimes(1);
  });

  it("destroy() calls unsubscribeSession", async () => {
    const unsubscribe = vi.fn();
    mockSession.on.mockReturnValue(unsubscribe);

    const service = new CopilotService(createMockApp(), createSettings());

    await service.initialize();
    await service.createSession();
    await service.destroy();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("broadcasts synthetic error and idle events when client emits disconnect", async () => {
    let clientHandler: ((event: any) => void) | undefined;
    // The CopilotClient constructor in __mocks__/copilot-sdk merges mockClient
    // into the instance, so adding `on` here surfaces it on the real client.
    // Cleaned up at end so it doesn't leak into other tests.
    (mockClient as any).on = vi.fn((callback: (event: any) => void) => {
      clientHandler = callback;
      return vi.fn();
    });

    try {
      const service = new CopilotService(createMockApp(), createSettings());
      await service.initialize();
      await service.createSession();

      const listener = vi.fn();
      service.onEvent(listener);

      clientHandler?.({ type: "disconnect", data: { message: "process exited" } });

      expect(listener).toHaveBeenCalledTimes(2);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ type: "session.error" }),
      );
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ type: "session.idle" }),
      );
    } finally {
      delete (mockClient as any).on;
    }
  });

  it("normalizes camelCase event types from the SDK", async () => {
    let sessionHandler: ((event: any) => void) | undefined;
    mockSession.on.mockImplementation((callback: (event: any) => void) => {
      sessionHandler = callback;
      return vi.fn();
    });

    const service = new CopilotService(createMockApp(), createSettings());
    const listener = vi.fn();
    service.onEvent(listener);

    await service.initialize();
    await service.createSession();

    sessionHandler?.({ type: "tool.executionStart", data: { toolName: "search" } });
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ type: "tool.execution_start" }),
    );
  });

  describe("error recovery", () => {
    // The sessionRef guard inside attachSessionListener() prevents a stale
    // callback (from a destroyed session that the SDK still holds onto) from
    // forwarding events to UI listeners after we've replaced the session.
    it("ignores events from a stale session after it has been replaced", async () => {
      const firstSession = createSessionMock({ sessionId: "session-1" });
      const secondSession = createSessionMock({ sessionId: "session-2" });
      mockClient.createSession.mockResolvedValueOnce(firstSession).mockResolvedValueOnce(secondSession);

      let firstSessionHandler: ((event: any) => void) | undefined;
      firstSession.on.mockImplementation((callback: (event: any) => void) => {
        firstSessionHandler = callback;
        return vi.fn();
      });

      const listener = vi.fn();
      const service = new CopilotService(createMockApp(), createSettings());
      service.onEvent(listener);

      await service.initialize();
      await service.createSession();

      // Fire event on first session — listener should receive it
      firstSessionHandler?.({ type: "assistant.message", data: { content: "first" } });
      expect(listener).toHaveBeenCalledTimes(1);

      // Recreate session — old handler should no longer forward events
      listener.mockClear();
      await service.createSession();

      firstSessionHandler?.({ type: "assistant.message", data: { content: "stale" } });
      expect(listener).not.toHaveBeenCalled();
    });

    it("handles sendMessage failure gracefully", async () => {
      const service = new CopilotService(createMockApp(), createSettings());
      await service.initialize();
      await service.createSession();

      mockSession.send.mockRejectedValueOnce(new Error("network failure"));

      await expect(service.sendMessage("Hello")).rejects.toThrow("network failure");
    });

    it("listTools returns empty array when all discovery strategies are unsupported", async () => {
      const bareSession = createSessionMock();
      bareSession.rpc.tools.list.mockRejectedValue(new Error("Method not found"));
      mockClient.createSession.mockResolvedValueOnce(bareSession);

      const service = new CopilotService(createMockApp(), createSettings());
      await service.initialize();
      await service.createSession();

      const tools = await service.listTools();
      expect(tools).toEqual([]);
    });

    it("listTools swallows real RPC errors and returns the cached set", async () => {
      const bareSession = createSessionMock();
      bareSession.rpc.tools.list.mockRejectedValue(new Error("network exploded"));
      mockClient.createSession.mockResolvedValueOnce(bareSession);

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const service = new CopilotService(createMockApp(), createSettings());
      await service.initialize();
      await service.createSession();

      const tools = await service.listTools();
      expect(tools).toEqual([]);
      expect(warnSpy).toHaveBeenCalled();
    });
  });
});
