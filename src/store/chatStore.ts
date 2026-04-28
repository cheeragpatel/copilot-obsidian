import { create } from "zustand";
import { ChatMode, DEFAULT_MODEL } from "../types/constants";
import type { ChatMessage, ToolCallInfo, ConversationMeta, MCPServerState } from "../types/chat";
import type { CustomAgentEntry } from "../types/settings";

interface ChatState {
  messages: ChatMessage[];
  currentMode: ChatMode;
  autopilotPermissions: boolean;
  currentModel: string;
  availableModels: { id: string; name: string }[];
  isLoading: boolean;
  currentSessionId: string | null;
  error: string | null;
  selectedAgent: string | null;
  conversations: ConversationMeta[];
  discoveredAgents: CustomAgentEntry[];
  availableAgents: CustomAgentEntry[];
  mcpServers: MCPServerState[];
  toolSelectionInitialized: Record<string, boolean>;
  _loadingTimeoutId: number | undefined;
}

type DiscoveredTool = { name: string; namespacedName?: string; description?: string };
type ToolPatch = Partial<Pick<ToolCallInfo, "status" | "result">>;

interface ChatActions {
  addMessage: (message: ChatMessage) => void;
  removeLastAssistantMessage: () => void;
  updateLastAssistantMessage: (content: string) => void;
  appendToLastAssistantMessage: (delta: string) => void;
  setLastMessageStreaming: (isStreaming: boolean) => void;
  addToolCall: (toolCall: ToolCallInfo) => void;
  addToolCallWithId: (toolCall: ToolCallInfo) => void;
  updateToolCall: (name: string, status: ToolCallInfo["status"], result?: string) => void;
  updateToolCallById: (id: string, patch: ToolPatch) => void;
  completeToolCallById: (id: string, ok: boolean, result?: string) => void;
  completeAllToolCalls: () => void;
  clearMessages: () => void;
  setMessages: (messages: ChatMessage[]) => void;
  setMode: (mode: ChatMode) => void;
  setAutopilotPermissions: (enabled: boolean) => void;
  setModel: (model: string) => void;
  setAvailableModels: (models: { id: string; name: string }[]) => void;
  setLoading: (loading: boolean) => void;
  setLoadingWithTimeout: (timeout?: number) => () => void;
  setError: (error: string | null) => void;
  setSessionId: (id: string | null) => void;
  setAgent: (agent: string | null) => void;
  setConversations: (conversations: ConversationMeta[]) => void;
  setDiscoveredAgents: (agents: CustomAgentEntry[]) => void;
  setAvailableAgents: (agents: CustomAgentEntry[]) => void;
  setMCPServers: (servers: MCPServerState[]) => void;
  updateMCPTools: (tools: DiscoveredTool[]) => void;
  replaceMCPTools: (tools: DiscoveredTool[]) => void;
  mergeDiscoveredMCPTools: (server: string, tools: DiscoveredTool[]) => void;
  mergeDiscoveredMCPTool: (server: string, tool: DiscoveredTool) => void;
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

function getDiscoveredToolName(tool: DiscoveredTool): string {
  if (tool.namespacedName?.includes("/")) {
    return tool.namespacedName.split("/").slice(1).join("/");
  }

  if (tool.namespacedName?.includes("_")) {
    return tool.namespacedName.split(/_/).slice(1).join("/");
  }

  return tool.name;
}

// Internal helper: applies a patch to the most recent assistant message.
// Pass an updater that returns a Partial<ChatMessage> to merge.
function updateLastAssistant(
  messages: ChatMessage[],
  updater: (msg: ChatMessage) => Partial<ChatMessage> | null,
): { messages: ChatMessage[]; changed: boolean } {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "assistant") {
      const patch = updater(messages[i]);
      if (patch === null) {
        return { messages, changed: false };
      }
      const next = messages.slice();
      next[i] = { ...messages[i], ...patch };
      return { messages: next, changed: true };
    }
  }
  return { messages, changed: false };
}

export const useChatStore = create<ChatState & ChatActions>((set, get) => ({
  // State
  messages: [],
  currentMode: ChatMode.Ask,
  autopilotPermissions: false,
  currentModel: DEFAULT_MODEL,
  availableModels: [],
  isLoading: false,
  currentSessionId: null,
  error: null,
  selectedAgent: null,
  conversations: [],
  discoveredAgents: [],
  availableAgents: [],
  mcpServers: [],
  toolSelectionInitialized: {},
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
      const { messages } = updateLastAssistant(state.messages, () => ({ content }));
      return { messages };
    }),

  appendToLastAssistantMessage: (delta) =>
    set((state) => {
      const { messages } = updateLastAssistant(state.messages, (msg) => ({
        content: msg.content + delta,
      }));
      return { messages };
    }),

  setLastMessageStreaming: (isStreaming) =>
    set((state) => {
      const { messages } = updateLastAssistant(state.messages, () => ({ isStreaming }));
      return { messages };
    }),

  addToolCall: (toolCall) =>
    set((state) => {
      const { messages } = updateLastAssistant(state.messages, (msg) => ({
        toolCalls: [...(msg.toolCalls || []), toolCall],
      }));
      return { messages };
    }),

  addToolCallWithId: (toolCall) => {
    // Convenience alias — ToolCallInfo already carries an `id` field. This
    // makes the call site explicit when it is correlating by SDK tool_call_id.
    get().addToolCall(toolCall);
  },

  updateToolCall: (name, status, result) =>
    set((state) => {
      const { messages } = updateLastAssistant(state.messages, (msg) => {
        if (!msg.toolCalls) return null;
        let updated = false;
        const toolCalls = msg.toolCalls.map((tc) => {
          if (!updated && tc.name === name && tc.status === "running") {
            updated = true;
            return { ...tc, status, result };
          }
          return tc;
        });
        return updated ? { toolCalls } : null;
      });
      return { messages };
    }),

  updateToolCallById: (id, patch) =>
    set((state) => {
      const messages = state.messages.slice();
      let changed = false;
      for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (msg.role !== "assistant" || !msg.toolCalls) continue;
        let localChange = false;
        const toolCalls = msg.toolCalls.map((tc) => {
          if (tc.id === id) {
            localChange = true;
            return { ...tc, ...patch };
          }
          return tc;
        });
        if (localChange) {
          messages[i] = { ...msg, toolCalls };
          changed = true;
          break;
        }
      }
      return changed ? { messages } : state;
    }),

  completeToolCallById: (id, ok, result) => {
    get().updateToolCallById(id, { status: ok ? "complete" : "error", result });
  },

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

  setAutopilotPermissions: (enabled) => set({ autopilotPermissions: enabled }),

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
    // Validate against the union of explicitly-configured availableAgents and
    // any agents discovered at runtime. If the caller has not populated
    // availableAgents (legacy behavior / older tests), fall back to the
    // discoveredAgents check that pre-dated this validation.
    const candidates = state.availableAgents.length > 0
      ? [...state.availableAgents, ...state.discoveredAgents]
      : state.discoveredAgents;
    if (candidates.length === 0) {
      // Nothing to validate against — accept any name.
      set({ selectedAgent: agentName });
      return;
    }
    const exists = candidates.some((a) => a.name === agentName);
    set({ selectedAgent: exists ? agentName : null });
  },

  setConversations: (conversations) => set({ conversations }),

  setDiscoveredAgents: (agents) => set({ discoveredAgents: agents }),

  setAvailableAgents: (agents) => set({ availableAgents: agents }),

  setMCPServers: (servers) => set({ mcpServers: servers }),

  updateMCPTools: (discoveredTools) =>
    set((state) => {
      // Replace semantics: per server, the discovered list becomes the new
      // canonical tool list (preserving the user's `enabled` toggles).
      const toolsByServer = new Map<string, DiscoveredTool[]>();
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

  // Alias of updateMCPTools — explicit "replace" naming for new call sites.
  replaceMCPTools: (tools) => get().updateMCPTools(tools),

  mergeDiscoveredMCPTools: (serverName, incoming) =>
    set((state) => ({
      mcpServers: state.mcpServers.map((serverState) => {
        if (serverState.server.name !== serverName) return serverState;

        const byName = new Map(serverState.tools.map((t) => [t.name, t]));
        for (const tool of incoming) {
          const resolvedName = getDiscoveredToolName(tool);
          const existing = byName.get(tool.name) || byName.get(resolvedName);
          byName.set(resolvedName, {
            name: resolvedName,
            description: tool.description || existing?.description,
            enabled: existing ? existing.enabled : true,
          });
        }
        return { ...serverState, tools: Array.from(byName.values()) };
      }),
    })),

  mergeDiscoveredMCPTool: (serverName, tool) => {
    get().mergeDiscoveredMCPTools(serverName, [tool]);
  },

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
      // Mark this server as having had explicit user tool selection. From this
      // point onward, getEnabledMCPConfig honours the explicit enabled list
      // (including the empty list — i.e. "disable all tools").
      toolSelectionInitialized: {
        ...state.toolSelectionInitialized,
        [serverName]: true,
      },
    })),

  getEnabledMCPConfig: () => {
    const config: Record<string, any> = {};
    const initialized = get().toolSelectionInitialized;

    for (const serverState of get().mcpServers) {
      if (!serverState.enabled) continue;

      const { server, tools } = serverState;
      const disabledTools = tools.filter((tool) => !tool.enabled).map((tool) => tool.name);
      const enabledTools = tools.filter((tool) => tool.enabled).map((tool) => tool.name);
      const hasConfiguredTools = !!server.configTools?.length;
      const usesWildcardTools = !!server.configTools?.includes("*");
      const userInitialized = !!initialized[server.name];

      // The Copilot SDK requires `tools` on every MCP server config:
      //   ["*"] = all tools, [] = none, ["a","b"] = explicit allowlist.
      let toolsField: string[];
      let allowExcludedFallback = true;
      if (userInitialized) {
        // The user has explicitly toggled tools on this server. Honour the
        // current enabled list verbatim, even if empty (i.e. "disable all
        // tools" must serialize to `tools: []`).
        toolsField = enabledTools;
        allowExcludedFallback = false;
      } else if (hasConfiguredTools && !usesWildcardTools) {
        // User explicitly picked a subset via config file.
        toolsField = enabledTools.length > 0 ? enabledTools : server.configTools!;
      } else if (enabledTools.length > 0 && disabledTools.length > 0) {
        // User toggled individual tools — pass only the enabled ones.
        toolsField = enabledTools;
      } else {
        // Default: allow all tools from this server.
        toolsField = ["*"];
      }

      const toolConfig: Record<string, any> = { tools: toolsField };
      if (allowExcludedFallback && disabledTools.length > 0 && toolsField.includes("*")) {
        toolConfig.excludedTools = disabledTools;
      }

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
