import { create } from "zustand";
import { ChatMode, DEFAULT_MODEL } from "../types/constants";
import type { ChatMessage, ToolCallInfo, ConversationMeta, MCPServerState } from "../types/chat";
import type { CustomAgentEntry } from "../types/settings";

interface ChatState {
  messages: ChatMessage[];
  currentMode: ChatMode;
  currentModel: string;
  availableModels: { id: string; name: string }[];
  isLoading: boolean;
  currentSessionId: string | null;
  error: string | null;
  selectedAgent: string | null;
  conversations: ConversationMeta[];
  discoveredAgents: CustomAgentEntry[];
  mcpServers: MCPServerState[];
}

interface ChatActions {
  addMessage: (message: ChatMessage) => void;
  updateLastAssistantMessage: (content: string) => void;
  appendToLastAssistantMessage: (delta: string) => void;
  setLastMessageStreaming: (isStreaming: boolean) => void;
  addToolCall: (toolCall: ToolCallInfo) => void;
  updateToolCall: (name: string, status: ToolCallInfo["status"], result?: string) => void;
  completeAllToolCalls: () => void;
  clearMessages: () => void;
  setMessages: (messages: ChatMessage[]) => void;
  setMode: (mode: ChatMode) => void;
  setModel: (model: string) => void;
  setAvailableModels: (models: { id: string; name: string }[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setSessionId: (id: string | null) => void;
  setAgent: (agent: string | null) => void;
  setConversations: (conversations: ConversationMeta[]) => void;
  setDiscoveredAgents: (agents: CustomAgentEntry[]) => void;
  setMCPServers: (servers: MCPServerState[]) => void;
  toggleMCP: (name: string) => void;
  toggleMCPTool: (serverName: string, toolName: string) => void;
  getEnabledMCPConfig: () => Record<string, any>;
  addCustomAgent: (agent: CustomAgentEntry) => void;
  newConversation: () => void;
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

export const useChatStore = create<ChatState & ChatActions>((set, get) => ({
  // State
  messages: [],
  currentMode: ChatMode.Ask,
  currentModel: DEFAULT_MODEL,
  availableModels: [],
  isLoading: false,
  currentSessionId: null,
  error: null,
  selectedAgent: null,
  conversations: [],
  discoveredAgents: [],
  mcpServers: [],

  // Actions
  addMessage: (message) =>
    set((state) => ({
      messages: [...state.messages, message],
      error: null,
    })),

  updateLastAssistantMessage: (content) =>
    set((state) => {
      const messages = [...state.messages];
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === "assistant") {
          messages[i] = { ...messages[i], content };
          break;
        }
      }
      return { messages };
    }),

  appendToLastAssistantMessage: (delta) =>
    set((state) => {
      const messages = [...state.messages];
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === "assistant") {
          messages[i] = { ...messages[i], content: messages[i].content + delta };
          break;
        }
      }
      return { messages };
    }),

  setLastMessageStreaming: (isStreaming) =>
    set((state) => {
      const messages = [...state.messages];
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === "assistant") {
          messages[i] = { ...messages[i], isStreaming };
          break;
        }
      }
      return { messages };
    }),

  addToolCall: (toolCall) =>
    set((state) => {
      const messages = [...state.messages];
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === "assistant") {
          const existing = messages[i].toolCalls || [];
          messages[i] = { ...messages[i], toolCalls: [...existing, toolCall] };
          break;
        }
      }
      return { messages };
    }),

  updateToolCall: (name, status, result) =>
    set((state) => {
      const messages = [...state.messages];
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === "assistant" && messages[i].toolCalls) {
          let updated = false;
          const toolCalls = messages[i].toolCalls!.map((tc) => {
            if (!updated && tc.name === name && tc.status === "running") {
              updated = true;
              return { ...tc, status, result };
            }
            return tc;
          });
          if (updated) {
            messages[i] = { ...messages[i], toolCalls };
            return { messages };
          }
        }
      }
      return { messages };
    }),

  completeAllToolCalls: () =>
    set((state) => {
      const messages = [...state.messages];
      let changed = false;
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === "assistant" && messages[i].toolCalls) {
          const hasRunning = messages[i].toolCalls!.some((tc) => tc.status === "running");
          if (hasRunning) {
            const toolCalls = messages[i].toolCalls!.map((tc) =>
              tc.status === "running" ? { ...tc, status: "complete" as const } : tc,
            );
            messages[i] = { ...messages[i], toolCalls };
            changed = true;
          }
        }
      }
      return changed ? { messages } : state;
    }),

  clearMessages: () => set({ messages: [], error: null }),

  setMessages: (messages) => set({ messages }),

  setMode: (mode) => set({ currentMode: mode }),

  setModel: (model) => set({ currentModel: model }),

  setAvailableModels: (models) => set({ availableModels: models }),

  setLoading: (loading) => set({ isLoading: loading }),

  setError: (error) => set({ error }),

  setSessionId: (id) => set({ currentSessionId: id }),

  setAgent: (agent) => set({ selectedAgent: agent }),

  setConversations: (conversations) => set({ conversations }),

  setDiscoveredAgents: (agents) => set({ discoveredAgents: agents }),

  setMCPServers: (servers) => set({ mcpServers: servers }),

  toggleMCP: (name) =>
    set((state) => ({
      mcpServers: state.mcpServers.map((serverState) =>
        serverState.server.name === name
          ? {
              ...serverState,
              enabled: !serverState.enabled,
              server: { ...serverState.server, enabled: !serverState.enabled },
            }
          : serverState,
      ),
    })),

  toggleMCPTool: (serverName, toolName) =>
    set((state) => ({
      mcpServers: state.mcpServers.map((serverState) =>
        serverState.server.name === serverName
          ? {
              ...serverState,
              tools: serverState.tools.map((tool) =>
                tool.name === toolName ? { ...tool, enabled: !tool.enabled } : tool,
              ),
            }
          : serverState,
      ),
    })),

  getEnabledMCPConfig: () => {
    const config: Record<string, any> = {};

    for (const serverState of get().mcpServers) {
      if (!serverState.enabled) continue;

      const { server, tools } = serverState;
      const disabledTools = tools.filter((tool) => !tool.enabled).map((tool) => tool.name);
      const enabledTools = tools.filter((tool) => tool.enabled).map((tool) => tool.name);
      const hasConfiguredTools = !!server.configTools?.length;
      const usesWildcardTools = !!server.configTools?.includes("*");
      const toolConfig = hasConfiguredTools && !usesWildcardTools
        ? { tools: enabledTools.length > 0 || tools.length > 0 ? enabledTools : server.configTools }
        : {
            ...(hasConfiguredTools ? { tools: server.configTools } : {}),
            ...(disabledTools.length > 0 ? { excludedTools: disabledTools } : {}),
          };

      if (server.type === "http" && server.url) {
        config[server.name] = {
          type: "http",
          url: server.url,
          ...(server.headers ? { headers: server.headers } : {}),
          ...toolConfig,
        };
      } else if (server.type === "stdio" && server.command) {
        config[server.name] = {
          type: "stdio",
          command: server.command,
          args: server.args || [],
          env: server.env || {},
          ...toolConfig,
        };
      }
    }

    return config;
  },

  addCustomAgent: (agent) =>
    set((state) => {
      const exists = state.discoveredAgents.some((a) => a.name === agent.name);
      if (exists) return state;
      return { discoveredAgents: [...state.discoveredAgents, agent] };
    }),

  newConversation: () =>
    set({
      messages: [],
      currentSessionId: null,
      error: null,
      selectedAgent: null,
    }),
}));

export { generateId };
