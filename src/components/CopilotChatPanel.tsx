import * as React from "react";
import { useContext, useEffect, useRef, useCallback, useState } from "react";
import { PluginContext } from "../views/CopilotChatView";
import { useChatStore, generateId } from "../store/chatStore";
import { ChatMode } from "../types/constants";
import { createVaultTools } from "../tools/vaultTools";
import { SlashCommandRegistry } from "../commands/SlashCommandRegistry";
import { ConfigDiscovery } from "../services/ConfigDiscovery";
import { ChatHeader } from "./ChatHeader";
import { ConversationHistory } from "./ConversationHistory";
import { MessageList } from "./MessageList";
import { ChatInput } from "./ChatInput";
import { EmptyState } from "./EmptyState";
import { ToolExecutionIndicator } from "./ToolExecutionIndicator";
import type { ConversationMeta, FileAttachment, MCPServerState } from "../types/chat";
import type { CustomAgentEntry, MCPServerEntry } from "../types/settings";

/** Map raw SDK/CLI errors to user-friendly messages */
function friendlyError(message: string): string {
  if (message.includes("ENOENT") || message.includes("not found"))
    return "Copilot CLI not found. Install it with: npm install -g @github/copilot";
  if (message.includes("code 127"))
    return "Node.js not found. Make sure Node.js is installed and in your PATH.";
  if (message.includes("createSession"))
    return "Connection lost. Click '+' to start a new conversation.";
  if (message.includes("ECONNREFUSED"))
    return "Cannot connect to Copilot server. Check your network connection.";
  if (message.includes("auth"))
    return "Not authenticated. Run 'copilot auth login' in your terminal.";
  return message;
}

function getSessionTimestamp(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? Date.now() : parsed;
  }
  return Date.now();
}

function toConversationMeta(session: any, fallbackModel: string): ConversationMeta {
  return {
    sessionId: session.sessionId,
    title: session.summary || session.title || session.context?.title || "Untitled conversation",
    model: session.model || session.context?.model || fallbackModel,
    messageCount: Number(session.messageCount ?? session.context?.messageCount ?? 0),
    lastUpdated: getSessionTimestamp(
      session.lastUpdated ?? session.modifiedTime ?? session.updatedAt ?? session.startTime,
    ),
  };
}

function buildEnabledMCPConfig(servers: MCPServerState[]): Record<string, any> {
  const config: Record<string, any> = {};

  for (const serverState of servers) {
    if (!serverState.enabled) continue;

    const disabledTools = serverState.tools.filter((tool) => !tool.enabled).map((tool) => tool.name);
    const enabledTools = serverState.tools.filter((tool) => tool.enabled).map((tool) => tool.name);
    const hasConfiguredTools = !!serverState.server.configTools?.length;
    const usesWildcardTools = !!serverState.server.configTools?.includes("*");
    const toolConfig = hasConfiguredTools && !usesWildcardTools
      ? {
          tools: enabledTools.length > 0 || serverState.tools.length > 0
            ? enabledTools
            : serverState.server.configTools,
        }
      : {
          ...(hasConfiguredTools ? { tools: serverState.server.configTools } : {}),
          ...(disabledTools.length > 0 ? { excludedTools: disabledTools } : {}),
        };

    if (serverState.server.type === "http" && serverState.server.url) {
      config[serverState.server.name] = {
        type: "http",
        url: serverState.server.url,
        ...(serverState.server.headers ? { headers: serverState.server.headers } : {}),
        ...toolConfig,
      };
    } else if (serverState.server.type === "stdio" && serverState.server.command) {
      config[serverState.server.name] = {
        type: "stdio",
        command: serverState.server.command,
        args: serverState.server.args || [],
        env: serverState.server.env || {},
        ...toolConfig,
      };
    }
  }

  return config;
}

function mergeMCPServers(
  settingsServers: MCPServerEntry[] = [],
  discoveredServers: MCPServerEntry[] = [],
  existingServers: MCPServerState[] = [],
): MCPServerState[] {
  const merged: MCPServerState[] = [];
  const seen = new Set<string>();
  const existingByName = new Map(existingServers.map((server) => [server.server.name, server]));

  const appendServer = (server: MCPServerEntry, fallbackSource: MCPServerState["source"]) => {
    if (seen.has(server.name)) return;
    seen.add(server.name);

    const existing = existingByName.get(server.name);
    const enabled = existing?.enabled ?? server.enabled;
    const source = server.source || fallbackSource;

    const configuredTools = server.configTools && !server.configTools.includes("*")
      ? server.configTools.map((name) => ({ name, enabled: true }))
      : [];

    merged.push({
      server: { ...server, enabled, source },
      enabled,
      tools: existing?.tools.map((tool) => ({ ...tool })) || configuredTools,
      source,
    });
  };

  for (const server of settingsServers) {
    appendServer(server, "settings");
  }

  for (const server of discoveredServers) {
    appendServer(server, server.source || "vault");
  }

  return merged;
}

export const CopilotChatPanel: React.FC = () => {
  const ctx = useContext(PluginContext);
  const initialized = useRef(false);
  const initPromise = useRef<Promise<void> | null>(null);
  const commandRegistry = useRef(new SlashCommandRegistry());
  const lastUserPrompt = useRef<string | null>(null);
  const lastUserDisplay = useRef<string | null>(null);
  const lastUserAttachments = useRef<FileAttachment[] | undefined>(undefined);
  const [initState, setInitState] = useState<"loading" | "ready" | "error">("loading");
  const [showHistory, setShowHistory] = useState(false);
  const {
    messages,
    currentMode,
    currentModel,
    isLoading,
    error,
    selectedAgent,
    conversations,
    addMessage,
    appendToLastAssistantMessage,
    setLastMessageStreaming,
    addToolCall,
    updateToolCall,
    completeAllToolCalls,
    setLoading,
    setError,
    setSessionId,
    setConversations,
    setMode,
    setModel,
    setAvailableModels,
    setDiscoveredAgents,
    setMCPServers,
    addCustomAgent,
    newConversation,
    clearMessages,
    setAgent,
    discoveredAgents,
    getEnabledMCPConfig,
  } = useChatStore();

  const recreateSession = useCallback(
    async (overrides: { model?: string; mode?: ChatMode } = {}) => {
      if (!ctx) return;
      if (initPromise.current) await initPromise.current;

      const model = overrides.model ?? currentModel;
      const mode = overrides.mode ?? currentMode;
      const tools = mode === ChatMode.Agent ? createVaultTools(ctx.app) : undefined;

      await ctx.copilotService.createSession({
        model,
        mode,
        tools,
        mcpServers: getEnabledMCPConfig(),
      });
      setSessionId(ctx.copilotService.getSessionId());
    },
    [ctx, currentMode, currentModel, getEnabledMCPConfig, setSessionId],
  );

  useEffect(() => {
    if (!ctx || initialized.current) return;
    initialized.current = true;

    const initService = async () => {
      try {
        setInitState("loading");
        await ctx.copilotService.initialize();

        // Fetch available models dynamically from the SDK
        try {
          const models = await ctx.copilotService.getAvailableModels();
          if (models.length > 0) {
            setAvailableModels(models);
          }
        } catch {
          // Non-fatal: fall back to static model list
        }

        const initialMCPServers = mergeMCPServers(ctx.settings.mcpServers, [], useChatStore.getState().mcpServers);
        setMCPServers(initialMCPServers);
        let sessionMCPConfig = buildEnabledMCPConfig(initialMCPServers);

        // Discover agents and MCP servers from .copilot/, .github/, and home config.
        try {
          const discovery = new ConfigDiscovery(ctx.app);
          const config = await discovery.discover();
          if (config.agents.length > 0) {
            setDiscoveredAgents(config.agents);
          }

          const discoveredMCPServers = ctx.settings.inheritConfig ? config.mcpServers : [];
          const mergedMCPServers = mergeMCPServers(
            ctx.settings.mcpServers,
            discoveredMCPServers,
            useChatStore.getState().mcpServers,
          );
          setMCPServers(mergedMCPServers);
          sessionMCPConfig = buildEnabledMCPConfig(mergedMCPServers);
        } catch {
          // Non-fatal: continue without discovered agents or MCP servers
        }

        const tools =
          ctx.settings.defaultMode === ChatMode.Agent
            ? createVaultTools(ctx.app)
            : undefined;
        await ctx.copilotService.createSession({
          model: ctx.settings.defaultModel,
          mode: ctx.settings.defaultMode,
          tools,
          mcpServers: sessionMCPConfig,
        });
        setSessionId(ctx.copilotService.getSessionId());
        setInitState("ready");
      } catch (err: any) {
        setInitState("error");
        setError(friendlyError(err.message));
      }
    };

    initPromise.current = initService();
  }, [ctx]);

  useEffect(() => {
    if (!ctx) return;

    const unsubscribe = ctx.copilotService.onEvent((event: any) => {
      switch (event.type) {
        case "assistant.message_delta":
        case "assistant.message.delta":
          appendToLastAssistantMessage(event.data.deltaContent);
          break;
        case "assistant.message":
          completeAllToolCalls();
          setLastMessageStreaming(false);
          setLoading(false);
          break;
        case "tool.execution_start":
        case "tool.executionStart":
          addToolCall({
            id: generateId(),
            name: event.data?.name || event.data?.toolName || "tool",
            status: "running",
          });
          break;
        case "tool.execution_complete":
        case "tool.executionComplete":
          updateToolCall(
            event.data?.name || event.data?.toolName || "tool",
            "complete",
            typeof event.data?.result === "string"
              ? event.data.result
              : JSON.stringify(event.data?.result),
          );
          break;
        case "session.error":
          setError(friendlyError(event.data?.message || "An error occurred"));
          setLoading(false);
          break;
        case "session.idle":
          completeAllToolCalls();
          setLoading(false);
          setLastMessageStreaming(false);
          break;
      }
    });

    return () => unsubscribe();
  }, [ctx]);

  useEffect(() => {
    if (!ctx || !showHistory) return;

    let cancelled = false;

    const loadConversations = async () => {
      if (initPromise.current) {
        await initPromise.current;
      }

      try {
        const sessions = await ctx.copilotService.listSessions();
        if (cancelled) return;

        const nextConversations = sessions
          .filter((session: any) => session?.sessionId)
          .map((session: any) => toConversationMeta(session, currentModel))
          .sort(
            (a: ConversationMeta, b: ConversationMeta) => b.lastUpdated - a.lastUpdated,
          );

        setConversations(nextConversations);
      } catch (err: any) {
        if (!cancelled) {
          setError(friendlyError(err.message));
        }
      }
    };

    void loadConversations();

    return () => {
      cancelled = true;
    };
  }, [ctx, showHistory, currentModel, setConversations, setError]);

  const handleSend = useCallback(
    async (text: string, attachments?: FileAttachment[]) => {
      if (!ctx || !text.trim()) return;

      const messageAttachments = attachments && attachments.length > 0 ? attachments : undefined;

      // Wait for initialization to complete before sending
      if (initPromise.current) {
        await initPromise.current;
      }

      let actualPrompt = text.trim();
      let displayText = text.trim();

      const slashMatch = actualPrompt.match(/^\/([\w-]+)\s*(.*)?$/s);
      if (slashMatch) {
        const cmdName = slashMatch[1];
        const cmdArgs = slashMatch[2] || "";
        const command = commandRegistry.current.get(cmdName);

        if (command) {
          if (command.requiresActiveNote && !ctx.app.workspace.getActiveFile?.()) {
            setError(`/${cmdName} requires an active note. Open a note first.`);
            return;
          }
          const built = await command.buildPrompt(ctx.app, cmdArgs);
          if (!built) {
            setError(`/${cmdName} could not build prompt. Is a note open?`);
            return;
          }
          actualPrompt = built;
          displayText = `/${cmdName}${cmdArgs ? " " + cmdArgs : ""}`;
        }
      }

      let activeAgent = selectedAgent;
      const agentMatch = actualPrompt.match(/@([\w-]+)\s*/);
      if (agentMatch) {
        const agentName = agentMatch[1];
        const allAgents = [
          ...(ctx.settings.customAgents || []).filter((a: any) => a.enabled),
          ...useChatStore.getState().discoveredAgents,
        ];
        const agent = allAgents.find((a: any) => a.name === agentName);
        if (agent) {
          activeAgent = agentName;
          setAgent(agentName);
          actualPrompt =
            actualPrompt.replace(/@[\w-]+\s*/, "").trim() || `Hello @${agentName}`;
          displayText = `@${agentName} ${actualPrompt}`;
        }
      }

      addMessage({
        id: generateId(),
        role: "user",
        content: displayText,
        timestamp: Date.now(),
        isStreaming: false,
        attachments: messageAttachments,
      });

      addMessage({
        id: generateId(),
        role: "assistant",
        content: "",
        timestamp: Date.now(),
        isStreaming: true,
        agentName: activeAgent || undefined,
      });

      setLoading(true);
      setError(null);
      lastUserPrompt.current = actualPrompt;
      lastUserDisplay.current = displayText;
      lastUserAttachments.current = messageAttachments;

      try {
        if (messageAttachments) {
          await ctx.copilotService.sendMessage(actualPrompt, messageAttachments);
        } else {
          await ctx.copilotService.sendMessage(actualPrompt);
        }
      } catch (err: any) {
        setError(friendlyError(err.message));
        setLoading(false);
      }
    },
    [ctx, selectedAgent],
  );

  const handleModelChange = useCallback(
    async (model: string) => {
      if (!ctx) return;
      setModel(model);
      try {
        await recreateSession({ model });
      } catch (err: any) {
        setError(friendlyError(err.message));
      }
    },
    [ctx, recreateSession, setError, setModel],
  );

  const handleModeSwitch = useCallback(
    async (mode: ChatMode) => {
      if (!ctx) return;
      try {
        await recreateSession({ mode });
        setMode(mode);
        addMessage({
          id: generateId(),
          role: "system",
          content: `Switched to ${mode} mode`,
          timestamp: Date.now(),
          isStreaming: false,
        });
      } catch (err: any) {
        setError(friendlyError(err.message));
      }
    },
    [ctx, addMessage, recreateSession, setError, setMode],
  );

  const handleNewConversation = useCallback(async () => {
    if (!ctx) return;
    lastUserPrompt.current = null;
    lastUserDisplay.current = null;
    lastUserAttachments.current = undefined;
    newConversation();
    try {
      await recreateSession();
    } catch (err: any) {
      setError(friendlyError(err.message));
    }
  }, [ctx, newConversation, recreateSession, setError]);

  const handleMCPChange = useCallback(async () => {
    if (!ctx) return;
    try {
      await recreateSession();
    } catch (err: any) {
      setError(friendlyError(err.message));
    }
  }, [ctx, recreateSession, setError]);

  const handleHistoryClick = useCallback(() => {
    setShowHistory(true);
  }, []);

  const handleHistorySelect = useCallback(
    async (sessionId: string) => {
      if (!ctx) return;
      if (initPromise.current) await initPromise.current;

      try {
        await ctx.copilotService.resumeSession(sessionId);
        clearMessages();
        lastUserPrompt.current = null;
        lastUserDisplay.current = null;
        lastUserAttachments.current = undefined;
        setSessionId(ctx.copilotService.getSessionId() ?? sessionId);
        setShowHistory(false);
      } catch (err: any) {
        setError(friendlyError(err.message));
      }
    },
    [ctx, clearMessages, setSessionId, setError],
  );

  const handleHistoryClose = useCallback(() => {
    setShowHistory(false);
  }, []);

  const handleAbort = useCallback(async () => {
    if (!ctx) return;
    try {
      await ctx.copilotService.abort();
      completeAllToolCalls();
      setLoading(false);
      setLastMessageStreaming(false);
    } catch {
      // Ignore abort errors
    }
  }, [ctx]);

  const handleRetry = useCallback(async () => {
    if (!ctx || !lastUserPrompt.current) return;
    const prompt = lastUserPrompt.current;

    addMessage({
      id: generateId(),
      role: "assistant",
      content: "",
      timestamp: Date.now(),
      isStreaming: true,
      agentName: selectedAgent || undefined,
    });

    setLoading(true);
    setError(null);

    try {
      if (lastUserAttachments.current) {
        await ctx.copilotService.sendMessage(prompt, lastUserAttachments.current);
      } else {
        await ctx.copilotService.sendMessage(prompt);
      }
    } catch (err: any) {
      setError(friendlyError(err.message));
      setLoading(false);
    }
  }, [ctx, selectedAgent]);

  const canRetry = !isLoading && messages.length > 0 && !!lastUserPrompt.current;

  const handleAddAgent = useCallback(
    (agent: CustomAgentEntry) => {
      addCustomAgent(agent);
      if (ctx) {
        ctx.settings.customAgents = [...(ctx.settings.customAgents || []), agent];
      }
    },
    [ctx, addCustomAgent],
  );

  return (
    <div className="copilot-chat-container">
      <ChatHeader
        onNewConversation={handleNewConversation}
        onHistoryClick={handleHistoryClick}
        isConnected={initState === "ready"}
      />
      {showHistory && (
        <ConversationHistory
          conversations={conversations}
          onSelect={handleHistorySelect}
          onClose={handleHistoryClose}
        />
      )}
      {error && (
        <div className="copilot-error-banner">
          <span>{error}</span>
          <button className="copilot-error-dismiss" onClick={() => setError(null)}>
            ×
          </button>
        </div>
      )}
      {messages.length === 0 ? (
        <EmptyState onSuggestionClick={handleSend} isInitializing={initState === "loading"} />
      ) : (
        <MessageList messages={messages} />
      )}
      <ChatInput
        onSend={handleSend}
        onAbort={handleAbort}
        onRetry={handleRetry}
        onModeSwitch={handleModeSwitch}
        onModelChange={handleModelChange}
        onMCPChange={handleMCPChange}
        onAddAgent={handleAddAgent}
        isLoading={isLoading}
        canRetry={canRetry}
      />
    </div>
  );
};
