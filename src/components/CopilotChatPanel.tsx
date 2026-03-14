import * as React from "react";
import { useContext, useEffect, useRef, useCallback, useState } from "react";
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

export const CopilotChatPanel: React.FC = () => {
  const ctx = useContext(PluginContext);
  const initialized = useRef(false);
  const initPromise = useRef<Promise<void> | null>(null);
  const commandRegistry = useRef(new SlashCommandRegistry());
  const lastUserPrompt = useRef<string | null>(null);
  const lastUserDisplay = useRef<string | null>(null);
  const [initState, setInitState] = useState<"loading" | "ready" | "error">("loading");
  const {
    messages,
    currentMode,
    currentModel,
    isLoading,
    error,
    selectedAgent,
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
    setModel,
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

      try {
        await ctx.copilotService.sendMessage(actualPrompt);
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
      setMode(mode);
      try {
        const tools = mode === ChatMode.Agent ? createVaultTools(ctx.app) : undefined;
        await ctx.copilotService.switchMode(mode, tools);
        setSessionId(ctx.copilotService.getSessionId());
      } catch (err: any) {
        setError(friendlyError(err.message));
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
      setError(friendlyError(err.message));
    }
  }, [ctx, currentMode, currentModel]);

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
      await ctx.copilotService.sendMessage(prompt);
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
        isConnected={initState === "ready"}
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
