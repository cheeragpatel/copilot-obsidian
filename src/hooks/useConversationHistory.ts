import { useCallback, useEffect, useState } from "react";
import { useChatStore } from "../store/chatStore";
import { friendlyError } from "./friendlyError";
import type { CopilotPluginContext } from "../views/CopilotChatView";

interface UseConversationHistoryOptions {
  ctx: CopilotPluginContext | null;
  initPromise: React.MutableRefObject<Promise<void> | null>;
  recreateSession: () => Promise<void>;
  discoverTools: () => Promise<void>;
  resetLastPrompt: () => void;
}

export interface ConversationHistoryHandlers {
  showHistory: boolean;
  openHistory: () => void;
  closeHistory: () => void;
  selectConversation: (sessionId: string) => Promise<void>;
  saveCurrent: () => Promise<void>;
  startNew: () => Promise<void>;
}

/**
 * Owns conversation persistence: load list, restore messages, save on idle,
 * and the new-conversation lifecycle (save → reset store → recreate session).
 */
export function useConversationHistory({
  ctx,
  initPromise,
  recreateSession,
  discoverTools,
  resetLastPrompt,
}: UseConversationHistoryOptions): ConversationHistoryHandlers {
  const [showHistory, setShowHistory] = useState(false);

  const setMessages = useChatStore((s) => s.setMessages);
  const setSessionId = useChatStore((s) => s.setSessionId);
  const setConversations = useChatStore((s) => s.setConversations);
  const setError = useChatStore((s) => s.setError);
  const newConversation = useChatStore((s) => s.newConversation);

  const saveCurrent = useCallback(async () => {
    if (!ctx?.conversationStore) return;
    const state = useChatStore.getState();
    if (state.messages.length === 0) return;

    const firstUserMessage = state.messages.find((m) => m.role === "user");
    const title = firstUserMessage?.content.substring(0, 80) || "New conversation";

    await ctx.conversationStore.save({
      sessionId: state.currentSessionId || ctx.copilotService.getSessionId() || "unknown",
      title,
      model: state.currentModel,
      mode: state.currentMode,
      messages: state.messages.filter((m) => !m.isStreaming),
      lastUpdated: Date.now(),
      createdAt: Date.now(),
    });
  }, [ctx]);

  useEffect(() => {
    if (!ctx || !showHistory) return;
    let cancelled = false;

    (async () => {
      try {
        const persisted = await ctx.conversationStore.getConversationMetas();
        if (cancelled) return;
        setConversations(persisted.sort((a, b) => b.lastUpdated - a.lastUpdated));
      } catch (err: any) {
        if (!cancelled) setError(friendlyError(err.message));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ctx, showHistory, setConversations, setError]);

  const openHistory = useCallback(() => setShowHistory(true), []);
  const closeHistory = useCallback(() => setShowHistory(false), []);

  const selectConversation = useCallback(
    async (sessionId: string) => {
      if (!ctx) return;
      const restored = await ctx.conversationStore.getMessages(sessionId);
      setMessages(restored);
      setShowHistory(false);
      resetLastPrompt();

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
    [ctx, discoverTools, initPromise, recreateSession, resetLastPrompt, setError, setMessages, setSessionId],
  );

  const startNew = useCallback(async () => {
    if (!ctx) return;
    await saveCurrent();
    resetLastPrompt();
    newConversation();
    try {
      await recreateSession();
    } catch (err: any) {
      setError(friendlyError(err.message));
    }
  }, [ctx, newConversation, recreateSession, resetLastPrompt, saveCurrent, setError]);

  return {
    showHistory,
    openHistory,
    closeHistory,
    selectConversation,
    saveCurrent,
    startNew,
  };
}
