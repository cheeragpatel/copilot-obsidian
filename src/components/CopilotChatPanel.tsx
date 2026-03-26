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
import { mergeMCPServers } from "../services/MCPMerge";
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

// TODO: After merge, import { normalizeToolInfo } from "../services/SDKCompat"
function getToolInfoFromEvent(event: any): {
  name: string;
  namespacedName?: string;
  description: string;
} | null {
  if (event.type !== "tool.execution_start" && event.type !== "tool.executionStart") {
    return null;
  }

  const data = event?.data || event;
  const name = data?.mcpToolName || data?.toolName || data?.name;
  if (!name) return null;

  return {
    name,
    namespacedName: data?.namespacedName || data?.name,
    description: data?.description || data?.toolDescription || "",
  };
}

export const CopilotChatPanel: React.FC = () => {
  const ctx = useContext(PluginContext);
  const initialized = useRef(false);
  const initPromise = useRef<Promise<void> | null>(null);
  const commandRegistry = useRef(new SlashCommandRegistry());
  const lastUserPrompt = useRef<{ prompt: string; display: string; attachments?: FileAttachment[] } | null>(null);
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
    updateMCPTools,
    addCustomAgent,
    newConversation,
    setMessages,
    setAgent,
    discoveredAgents,
    getEnabledMCPConfig,
  } = useChatStore();

  const discoverTools = useCallback(async () => {
    if (!ctx) return;

    try {
      const tools = await ctx.copilotService.listTools();
      if (tools.length > 0) {
        updateMCPTools(tools);
      }
    } catch {
      // Non-fatal: tools just won't show in the picker.
    }
  }, [ctx, updateMCPTools]);

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
      await discoverTools();
    },
    [ctx, currentMode, currentModel, discoverTools, getEnabledMCPConfig, setSessionId],
  );

  const saveConversation = useCallback(async () => {
    if (!ctx?.conversationStore) return;

    const state = useChatStore.getState();
    if (state.messages.length === 0) return;

    const firstUserMessage = state.messages.find((message) => message.role === "user");
    const title = firstUserMessage?.content.substring(0, 80) || "New conversation";

    await ctx.conversationStore.save({
      sessionId: state.currentSessionId || ctx.copilotService.getSessionId() || "unknown",
      title,
      model: state.currentModel,
      mode: state.currentMode,
      messages: state.messages.filter((message) => !message.isStreaming),
      lastUpdated: Date.now(),
      createdAt: Date.now(),
    });
  }, [ctx]);

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
        let sessionMCPConfig = useChatStore.getState().getEnabledMCPConfig();

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
          sessionMCPConfig = useChatStore.getState().getEnabledMCPConfig();
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
        await discoverTools();
        setInitState("ready");
      } catch (err: any) {
        setInitState("error");
        setError(friendlyError(err.message));
      }
    };

    initPromise.current = initService();
  }, [ctx, discoverTools, setAvailableModels, setDiscoveredAgents, setError, setMCPServers, setSessionId]);

  useEffect(() => {
    if (!ctx) return;

    const unsubscribe = ctx.copilotService.onEvent((event: any) => {
      switch (event.type) {
        case "assistant.message_delta":
        case "assistant.message.delta": {
          const delta = event.data?.deltaContent || event.data?.content || "";
          const messages = useChatStore.getState().messages;
          const lastMsg = messages[messages.length - 1];

          if (!lastMsg || lastMsg.role !== "assistant" || !lastMsg.isStreaming) {
            addMessage({
              id: generateId(),
              role: "assistant",
              content: delta,
              timestamp: Date.now(),
              isStreaming: true,
              agentName: useChatStore.getState().selectedAgent || undefined,
            });
          } else {
            appendToLastAssistantMessage(delta);
          }
          break;
        }
        case "assistant.message":
          completeAllToolCalls();
          setLastMessageStreaming(false);
          setLoading(false);
          break;
        case "tool.execution_start":
        case "tool.executionStart": {
          const messages = useChatStore.getState().messages;
          const lastMsg = messages[messages.length - 1];
          if (!lastMsg || lastMsg.role !== "assistant" || !lastMsg.isStreaming) {
            addMessage({
              id: generateId(),
              role: "assistant",
              content: "",
              timestamp: Date.now(),
              isStreaming: true,
              agentName: useChatStore.getState().selectedAgent || undefined,
            });
          }

          addToolCall({
            id: generateId(),
            name: event.data?.mcpToolName || event.data?.name || event.data?.toolName || "tool",
            status: "running",
          });

          const discoveredTool = getToolInfoFromEvent(event);
          if (discoveredTool) {
            updateMCPTools([discoveredTool]);
          }
          break;
        }
        case "tool.execution_complete":
        case "tool.executionComplete":
          updateToolCall(
            event.data?.mcpToolName || event.data?.name || event.data?.toolName || "tool",
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
          void saveConversation();
          break;
      }
    });

    return () => unsubscribe();
  }, [
    ctx,
    addMessage,
    addToolCall,
    appendToLastAssistantMessage,
    completeAllToolCalls,
    saveConversation,
    setError,
    setLastMessageStreaming,
    setLoading,
    updateMCPTools,
    updateToolCall,
  ]);

  useEffect(() => {
    if (!ctx || !showHistory) return;

    let cancelled = false;

    const loadConversations = async () => {
      try {
        const persistedConversations = await ctx.conversationStore.getConversationMetas();
        if (cancelled) return;

        setConversations(
          persistedConversations.sort((left, right) => right.lastUpdated - left.lastUpdated),
        );
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
  }, [ctx, showHistory, setConversations, setError]);

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

      setLoading(true);
      setError(null);
      lastUserPrompt.current = { prompt: actualPrompt, display: displayText, attachments: messageAttachments };

      const loadingTimer = setTimeout(() => {
        if (useChatStore.getState().isLoading) {
          setLoading(false);
          setError("Request timed out after 30 seconds. Please try again.");
        }
      }, 30000);

      try {
        if (messageAttachments) {
          await ctx.copilotService.sendMessage(actualPrompt, messageAttachments);
        } else {
          await ctx.copilotService.sendMessage(actualPrompt);
        }
      } catch (err: any) {
        // Safety: remove ghost assistant message if one was created by an early delta
        const msgs = useChatStore.getState().messages;
        const lastMsg = msgs[msgs.length - 1];
        if (lastMsg?.role === "assistant" && lastMsg.content === "" && lastMsg.isStreaming) {
          useChatStore.getState().setMessages(msgs.slice(0, -1));
        }
        setError(friendlyError(err.message));
        setLoading(false);
      } finally {
        clearTimeout(loadingTimer);
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

    await saveConversation();
    lastUserPrompt.current = null;
    newConversation();
    try {
      await recreateSession();
    } catch (err: any) {
      setError(friendlyError(err.message));
    }
  }, [ctx, newConversation, recreateSession, saveConversation, setError]);

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

      const restoredMessages = await ctx.conversationStore.getMessages(sessionId);
      setMessages(restoredMessages);
      setShowHistory(false);
      lastUserPrompt.current = null;

      try {
        if (initPromise.current) await initPromise.current;
        await ctx.copilotService.resumeSession(sessionId);
        setSessionId(ctx.copilotService.getSessionId() ?? sessionId);
        await discoverTools();
      } catch {
        try {
          await recreateSession();
        } catch (err: any) {
          setError(friendlyError(err.message));
        }
      }
    },
    [ctx, discoverTools, recreateSession, setError, setMessages, setSessionId],
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
  }, [ctx, completeAllToolCalls, setLastMessageStreaming, setLoading]);

  const handleRetry = useCallback(async () => {
    if (!ctx || !lastUserPrompt.current) return;
    const { prompt, attachments } = lastUserPrompt.current;

    setLoading(true);
    setError(null);

    const loadingTimer = setTimeout(() => {
      if (useChatStore.getState().isLoading) {
        setLoading(false);
        setError("Request timed out after 30 seconds. Please try again.");
      }
    }, 30000);

    try {
      if (attachments) {
        await ctx.copilotService.sendMessage(prompt, attachments);
      } else {
        await ctx.copilotService.sendMessage(prompt);
      }
    } catch (err: any) {
      setError(friendlyError(err.message));
      setLoading(false);
    } finally {
      clearTimeout(loadingTimer);
    }
  }, [ctx, setError, setLoading]);

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
          {canRetry && (
            <button className="copilot-retry-btn clickable-icon" onClick={handleRetry}>
              Retry
            </button>
          )}
          <button className="copilot-error-dismiss clickable-icon" onClick={() => setError(null)}>
            ✕
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
