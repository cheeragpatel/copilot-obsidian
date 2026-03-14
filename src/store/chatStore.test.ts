import { useChatStore, generateId } from "./chatStore";
import { ChatMode, DEFAULT_MODEL } from "../types/constants";
import type { ChatMessage, ConversationMeta, ToolCallInfo } from "../types/chat";

const initialState = {
  messages: [] as ChatMessage[],
  currentMode: ChatMode.Ask,
  currentModel: DEFAULT_MODEL,
  isLoading: false,
  currentSessionId: null as string | null,
  error: null as string | null,
  selectedAgent: null as string | null,
  conversations: [] as ConversationMeta[],
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

  it("setAgent updates the selected agent", () => {
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

  it("generateId returns unique strings", () => {
    const first = generateId();
    const second = generateId();

    expect(first).toEqual(expect.any(String));
    expect(second).toEqual(expect.any(String));
    expect(first).not.toBe(second);
  });
});
