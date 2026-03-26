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
  _loadingTimeoutId: number | undefined;
}

interface ChatActions {
  addMessage: (message: ChatMessage) => void;
  removeLastAssistantMessage: () => void;
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
  setLoadingWithTimeout: (timeout?: number) => () => void;
  setError: (error: string | null) => void;
  setSessionId: (id: string | null) => void;
  setAgent: (agent: string | null) => void;
  setConversations: (conversations: ConversationMeta[]) => void;
  setDiscoveredAgents: (agents: CustomAgentEntry[]) => void;
  setMCPServers: (servers: MCPServerState[]) => void;
  updateMCPTools: (tools: Array<{ name: string; namespacedName?: string; description: string }>) => void;
  toggleMCP: (name: string) => void;
  toggleMCPTool: (serverName: string, toolName: string) => void;
  getEnabledMCPConfig: () => Record<string, any>;
  addCustomAgent: (agent: CustomAgentEntry) => void;
  newConversation: () => void;
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

function getToolServerName(namespacedName?: string): string | null {
  if (!namespacedName) return null;

  const slashIndex = namespacedName.indexOf("/");
  if (slashIndex > 0) {
    return namespacedName.slice(0, slashIndex);
  }

  const underscoreIndex = namespacedName.indexOf("_");
  if (underscoreIndex > 0) {
    return namespacedName.slice(0, underscoreIndex);
  }

  return null;
}

function getDiscoveredToolName(tool: { name: string; namespacedName?: string }): string {
  if (tool.namespacedName?.includes("/")) {
    return tool.namespacedName.split("/").slice(1).join("/");
  }

  if (tool.namespacedName?.includes("_")) {
    return tool.namespacedName.split(/_/).slice(1).join("/");
  }

  return tool.name;
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
  _loadingTimeoutId: undefined,

  // Actions
  addMessage: (message) =>
    set((state) => ({
      messages: [...state.messages, message],
      error: null,
    })),

  removeLastAssistantMessage: () =>
    set((state) => {
      const idx = [...state.messages].reverse().findIndex((m) => m.role === "assistant");
      if (idx === -1) return state;
      const realIdx = state.messages.length - 1 - idx;
      const messages = [...state.messages];
      messages.splice(realIdx, 1);
      return { messages };
    }),

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

  setLoading: (loading) => {
    if (!loading) {
      const tid = get()._loadingTimeoutId;
      if (tid) clearTimeout(tid);
    }
    set({ isLoading: loading, ...(!loading ? { _loadingTimeoutId: undefined } : {}) });
  },

  setLoadingWithTimeout: (timeout = 30000) => {
    const existingTimeout = get()._loadingTimeoutId;
    if (existingTimeout) clearTimeout(existingTimeout);

    const timeoutId = setTimeout(() => {
      if (get().isLoading) {
        set({ isLoading: false, error: "Request timed out. Please try again.", _loadingTimeoutId: undefined });
      }
    }, timeout);

    set({ isLoading: true, _loadingTimeoutId: timeoutId as unknown as number });
    return () => {
      clearTimeout(timeoutId);
      set({ _loadingTimeoutId: undefined });
    };
  },

  setError: (error) => set({ error }),

  setSessionId: (id) => set({ currentSessionId: id }),

  setAgent: (agentName) => {
    if (agentName === null) {
      set({ selectedAgent: null });
      return;
    }
    const state = get();
    const exists = state.discoveredAgents.some((a) => a.name === agentName);
    set({ selectedAgent: exists ? agentName : null });
  },

  setConversations: (conversations) => set({ conversations }),

  setDiscoveredAgents: (agents) => set({ discoveredAgents: agents }),

  setMCPServers: (servers) => set({ mcpServers: servers }),

  updateMCPTools: (discoveredTools) =>
    set((state) => {
      const toolsByServer = new Map<string, typeof discoveredTools>();
      for (const tool of discoveredTools) {
        const serverName = getToolServerName(tool.namespacedName);
        if (!serverName) continue;
        if (!toolsByServer.has(serverName)) toolsByServer.set(serverName, []);
        toolsByServer.get(serverName)!.push(tool);
      }

      return {
        mcpServers: state.mcpServers.map((serverState) => {
          const serverTools = toolsByServer.get(serverState.server.name) || [];
          if (serverTools.length === 0) return serverState;

          const existingByName = new Map(serverState.tools.map((t) => [t.name, t]));

          const tools = serverTools.map((tool) => {
            const resolvedName = getDiscoveredToolName(tool);
            const existing = existingByName.get(tool.name) || existingByName.get(resolvedName);
            return {
              name: resolvedName,
              description: tool.description || existing?.description,
              enabled: existing ? existing.enabled : true,
            };
          });
          return { ...serverState, tools };
        }),
      };
    }),

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
