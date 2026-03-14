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
import type { ConversationMeta, FileAttachment } from "../types/chat";
import type { CustomAgentEntry } from "../types/settings";

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
    addCustomAgent,
    newConversation,
    clearMessages,
    setAgent,
    discoveredAgents,
  } = useChatStore();

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

        // Discover agents from .copilot/agents/, .github/agents/, ~/.copilot/agents/
        try {
          const discovery = new ConfigDiscovery(ctx.app);
          const config = await discovery.discover();
          if (config.agents.length > 0) {
            setDiscoveredAgents(config.agents);
          }
        } catch {
          // Non-fatal: continue without discovered agents
        }

        const tools =
          ctx.settings.defaultMode === ChatMode.Agent
            ? createVaultTools(ctx.app)
            : undefined;
        await ctx.copilotService.createSession({
          model: ctx.settings.defaultModel,
          mode: ctx.settings.defaultMode,
          tools,
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
      if (initPromise.current) await initPromise.current;
      // Re-create session with new model (keeps messages in UI)
      try {
        const tools = currentMode === ChatMode.Agent ? createVaultTools(ctx.app) : undefined;
        await ctx.copilotService.createSession({
          model,
          mode: currentMode,
          tools,
        });
        setSessionId(ctx.copilotService.getSessionId());
      } catch (err: any) {
        setError(friendlyError(err.message));
      }
    },
    [ctx, currentMode],
  );

  const handleModeSwitch = useCallback(
    async (mode: ChatMode) => {
      if (!ctx) return;
      if (initPromise.current) await initPromise.current;
      try {
        const tools = mode === ChatMode.Agent ? createVaultTools(ctx.app) : undefined;
        await ctx.copilotService.switchMode(mode, tools);
        setMode(mode);
        setSessionId(ctx.copilotService.getSessionId());
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
    [ctx, addMessage, setMode, setSessionId, setError],
  );

  const handleNewConversation = useCallback(async () => {
    if (!ctx) return;
    if (initPromise.current) await initPromise.current;
    lastUserPrompt.current = null;
    lastUserDisplay.current = null;
    lastUserAttachments.current = undefined;
    newConversation();
    try {
      const tools =
        currentMode === ChatMode.Agent ? createVaultTools(ctx.app) : undefined;
      await ctx.copilotService.createSession({
        model: currentModel,
        mode: currentMode,
        tools,
      });
      setSessionId(ctx.copilotService.getSessionId());
    } catch (err: any) {
      setError(friendlyError(err.message));
    }
  }, [ctx, currentMode, currentModel]);

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
        onAddAgent={handleAddAgent}
        isLoading={isLoading}
        canRetry={canRetry}
      />
    </div>
  );
};
