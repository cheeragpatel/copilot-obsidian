import * as React from "react";
import { useCallback, useContext } from "react";
import { PluginContext } from "../views/CopilotChatView";
import { useChatStore, generateId } from "../store/chatStore";
import { ChatMode } from "../types/constants";
import { ChatHeader } from "./ChatHeader";
import { ConversationHistory } from "./ConversationHistory";
import { MessageList } from "./MessageList";
import { ChatInput } from "./ChatInput";
import { EmptyState } from "./EmptyState";
import { useCopilotInitialization } from "../hooks/useCopilotInitialization";
import { useCopilotEvents } from "../hooks/useCopilotEvents";
import { useSendMessage } from "../hooks/useSendMessage";
import { useConversationHistory } from "../hooks/useConversationHistory";
import { friendlyError } from "../hooks/friendlyError";
import type { CustomAgentEntry } from "../types/settings";

export const CopilotChatPanel: React.FC = () => {
  const ctx = useContext(PluginContext);

  // Narrow per-field selectors avoid re-rendering the panel on unrelated
  // store changes (mcp tool toggles, agent discovery, etc).
  const messages = useChatStore((s) => s.messages);
  const isLoading = useChatStore((s) => s.isLoading);
  const error = useChatStore((s) => s.error);
  const conversations = useChatStore((s) => s.conversations);
  const addMessage = useChatStore((s) => s.addMessage);
  const setError = useChatStore((s) => s.setError);
  const setMode = useChatStore((s) => s.setMode);
  const setModel = useChatStore((s) => s.setModel);
  const addCustomAgent = useChatStore((s) => s.addCustomAgent);

  const { initState, initPromise, recreateSession, discoverTools } =
    useCopilotInitialization(ctx);

  const { send, retry, abort, canRetry, resetLastPrompt } = useSendMessage({
    ctx,
    initPromise,
  });

  const history = useConversationHistory({
    ctx,
    initPromise,
    recreateSession,
    discoverTools,
    resetLastPrompt,
  });

  useCopilotEvents(ctx, history.saveCurrent);

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

  const handleMCPChange = useCallback(async () => {
    if (!ctx) return;
    try {
      await recreateSession();
    } catch (err: any) {
      setError(friendlyError(err.message));
    }
  }, [ctx, recreateSession, setError]);

  const handleAddAgent = useCallback(
    async (agent: CustomAgentEntry) => {
      if (!ctx) return;
      const previous = ctx.settings.customAgents || [];
      // Dedupe by name — the in-store action also dedupes against discovered
      // agents, but we still need to avoid duplicating in settings.
      if (previous.some((a: CustomAgentEntry) => a.name === agent.name)) {
        addCustomAgent(agent);
        return;
      }
      const nextAgents = [...previous, agent];
      // Optimistically update the in-memory store + the shared settings ref
      // (the plugin holds the same object), then persist.
      addCustomAgent(agent);
      ctx.settings.customAgents = nextAgents;
      try {
        await ctx.saveSettings();
      } catch (err: any) {
        // Roll back the in-memory mutation and surface the error.
        ctx.settings.customAgents = previous;
        setError(`Failed to save custom agent: ${friendlyError(err?.message || String(err))}`);
      }
    },
    [ctx, addCustomAgent, setError],
  );

  return (
    <div className="copilot-chat-container">
      <ChatHeader
        onNewConversation={history.startNew}
        onHistoryClick={history.openHistory}
        isConnected={initState === "ready"}
      />
      {history.showHistory && (
        <ConversationHistory
          conversations={conversations}
          onSelect={history.selectConversation}
          onClose={history.closeHistory}
        />
      )}
      {error && (
        <div className="copilot-error-banner">
          <span>{error}</span>
          {canRetry && (
            <button className="copilot-retry-btn clickable-icon" onClick={retry}>
              Retry
            </button>
          )}
          <button className="copilot-error-dismiss clickable-icon" onClick={() => setError(null)}>
            ✕
          </button>
        </div>
      )}
      {messages.length === 0 ? (
        <EmptyState onSuggestionClick={send} isInitializing={initState === "loading"} />
      ) : (
        <MessageList messages={messages} />
      )}
      <ChatInput
        onSend={send}
        onAbort={abort}
        onRetry={retry}
        onModeSwitch={handleModeSwitch}
        onModelChange={handleModelChange}
        onMCPChange={handleMCPChange}
        onMCPRefresh={discoverTools}
        onAddAgent={handleAddAgent}
        isLoading={isLoading}
        canRetry={canRetry}
      />
    </div>
  );
};
