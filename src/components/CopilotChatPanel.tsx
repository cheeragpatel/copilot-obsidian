import * as React from "react";
import { useContext, useEffect, useRef, useCallback } from "react";
import { PluginContext } from "../views/CopilotChatView";
import { useChatStore, generateId } from "../store/chatStore";
import { ChatMode } from "../types/constants";
import { createVaultTools } from "../tools/vaultTools";
import { ChatHeader } from "./ChatHeader";
import { MessageList } from "./MessageList";
import { ChatInput } from "./ChatInput";
import { EmptyState } from "./EmptyState";
import { ToolExecutionIndicator } from "./ToolExecutionIndicator";

export const CopilotChatPanel: React.FC = () => {
  const ctx = useContext(PluginContext);
  const initialized = useRef(false);
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
    setLoading,
    setError,
    setSessionId,
    clearMessages,
    setMode,
    setAvailableModels,
    newConversation,
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

    initService();
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

      addMessage({
        id: generateId(),
        role: "user",
        content: text.trim(),
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

      try {
        await ctx.copilotService.sendMessage(text.trim());
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

  return (
    <div className="copilot-chat-container">
      <ChatHeader
        onNewConversation={handleNewConversation}
        onModeSwitch={handleModeSwitch}
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
        isLoading={isLoading}
      />
    </div>
  );
};
