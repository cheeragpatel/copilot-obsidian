import * as React from "react";
import { useContext, useEffect, useRef, useCallback } from "react";
import { PluginContext } from "../views/CopilotChatView";
import { useChatStore, generateId } from "../store/chatStore";
import { ChatMode } from "../types/constants";
import { createVaultTools } from "../tools/vaultTools";
import { SlashCommandRegistry } from "../commands/SlashCommandRegistry";
import { ConfigDiscovery } from "../services/ConfigDiscovery";
import { ChatHeader } from "./ChatHeader";
import { MessageList } from "./MessageList";
import { ChatInput } from "./ChatInput";
import { EmptyState } from "./EmptyState";
import { ToolExecutionIndicator } from "./ToolExecutionIndicator";
import type { CustomAgentEntry } from "../types/settings";

export const CopilotChatPanel: React.FC = () => {
  const ctx = useContext(PluginContext);
  const initialized = useRef(false);
  const initPromise = useRef<Promise<void> | null>(null);
  const commandRegistry = useRef(new SlashCommandRegistry());
  const lastUserPrompt = useRef<string | null>(null);
  const {
    messages,
    currentMode,
    currentModel,
    isLoading,
    error,
    addMessage,
    appendToLastAssistantMessage,
    setLastMessageStreaming,
    addToolCall,
    updateToolCall,
    completeAllToolCalls,
    setLoading,
    setError,
    setSessionId,
    clearMessages,
    setMode,
    setAvailableModels,
    setDiscoveredAgents,
    addCustomAgent,
    newConversation,
    setAgent,
    discoveredAgents,
  } = useChatStore();

  useEffect(() => {
    if (!ctx || initialized.current) return;
    initialized.current = true;

    const initService = async () => {
      try {
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
      } catch (err: any) {
        setError(`Failed to initialize Copilot: ${err.message}`);
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
          setError(event.data?.message || "An error occurred");
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

  const handleSend = useCallback(
    async (text: string) => {
      if (!ctx || !text.trim()) return;

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

      const agentMatch = actualPrompt.match(/@([\w-]+)\s*/);
      if (agentMatch) {
        const agentName = agentMatch[1];
        // Check settings agents and discovered agents
        const allAgents = [
          ...(ctx.settings.customAgents || []).filter((a: any) => a.enabled),
          ...useChatStore.getState().discoveredAgents,
        ];
        const agent = allAgents.find((a: any) => a.name === agentName);
        if (agent) {
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
      });

      addMessage({
        id: generateId(),
        role: "assistant",
        content: "",
        timestamp: Date.now(),
        isStreaming: true,
      });

      setLoading(true);
      setError(null);
      lastUserPrompt.current = actualPrompt;

      try {
        await ctx.copilotService.sendMessage(actualPrompt);
      } catch (err: any) {
        setError(err.message);
        setLoading(false);
      }
    },
    [ctx],
  );

  const handleModeSwitch = useCallback(
    async (mode: ChatMode) => {
      if (!ctx) return;
      if (initPromise.current) await initPromise.current;
      setMode(mode);
      try {
        const tools = mode === ChatMode.Agent ? createVaultTools(ctx.app) : undefined;
        await ctx.copilotService.switchMode(mode, tools);
        setSessionId(ctx.copilotService.getSessionId());
      } catch (err: any) {
        setError(`Failed to switch mode: ${err.message}`);
      }
    },
    [ctx],
  );

  const handleNewConversation = useCallback(async () => {
    if (!ctx) return;
    if (initPromise.current) await initPromise.current;
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
      setError(`Failed to create conversation: ${err.message}`);
    }
  }, [ctx, currentMode, currentModel]);

  const handleAbort = useCallback(async () => {
    if (!ctx) return;
    try {
      await ctx.copilotService.abort();
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
    });

    setLoading(true);
    setError(null);

    try {
      await ctx.copilotService.sendMessage(prompt);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  }, [ctx]);

  const canRetry = !isLoading && messages.length > 0 && !!lastUserPrompt.current;

  const handleAddAgent = useCallback(
    (agent: CustomAgentEntry) => {
      addCustomAgent(agent);
      // Also persist to settings if context available
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
      />
      {error && (
        <div className="copilot-error-banner">
          <span>{error}</span>
          <button className="copilot-error-dismiss" onClick={() => setError(null)}>
            ×
          </button>
        </div>
      )}
      {messages.length === 0 ? (
        <EmptyState onSuggestionClick={handleSend} />
      ) : (
        <MessageList messages={messages} />
      )}
      <ChatInput
        onSend={handleSend}
        onAbort={handleAbort}
        onRetry={handleRetry}
        onModeSwitch={handleModeSwitch}
        onAddAgent={handleAddAgent}
        isLoading={isLoading}
        canRetry={canRetry}
      />
    </div>
  );
};
