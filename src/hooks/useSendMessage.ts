import { useCallback, useRef } from "react";
import { useChatStore, generateId } from "../store/chatStore";
import { SlashCommandRegistry } from "../commands/SlashCommandRegistry";
import { friendlyError } from "./friendlyError";
import type { CopilotPluginContext } from "../views/CopilotChatView";
import type { FileAttachment } from "../types/chat";

interface LastPrompt {
  prompt: string;
  display: string;
  attachments?: FileAttachment[];
}

interface UseSendMessageOptions {
  ctx: CopilotPluginContext | null;
  initPromise: React.MutableRefObject<Promise<void> | null>;
}

export interface SendMessageHandlers {
  send: (text: string, attachments?: FileAttachment[]) => Promise<void>;
  retry: () => Promise<void>;
  abort: () => Promise<void>;
  canRetry: boolean;
  resetLastPrompt: () => void;
}

/**
 * Encapsulates the send/retry/abort lifecycle including:
 *  - slash-command and @agent expansion
 *  - timeout-driven loading reset
 *  - safe assistant-ghost cleanup on failure
 *
 * Exposes a single `send` and a matching `retry` that share the prompt ref.
 */
export function useSendMessage({ ctx, initPromise }: UseSendMessageOptions): SendMessageHandlers {
  const commandRegistry = useRef(new SlashCommandRegistry());
  const lastUserPrompt = useRef<LastPrompt | null>(null);

  const addMessage = useChatStore((s) => s.addMessage);
  const setLoading = useChatStore((s) => s.setLoading);
  const setError = useChatStore((s) => s.setError);
  const setAgent = useChatStore((s) => s.setAgent);
  const completeAllToolCalls = useChatStore((s) => s.completeAllToolCalls);
  const setLastMessageStreaming = useChatStore((s) => s.setLastMessageStreaming);
  const isLoading = useChatStore((s) => s.isLoading);
  const messagesLength = useChatStore((s) => s.messages.length);

  // Safety-net timeout: 5 minutes. The real "done" signal comes from
  // session.idle / session.error events in useCopilotEvents.
  const startLoadingTimer = useCallback(() => {
    return setTimeout(() => {
      if (useChatStore.getState().isLoading) {
        setLoading(false);
        setError("Request timed out after 5 minutes. Please try again.");
      }
    }, 300000);
  }, [setError, setLoading]);

  const dispatch = useCallback(
    async (prompt: string, attachments?: FileAttachment[]) => {
      if (!ctx) return;
      setLoading(true);
      setError(null);
      const timer = startLoadingTimer();
      try {
        if (attachments) {
          await ctx.copilotService.sendMessage(prompt, attachments);
        } else {
          await ctx.copilotService.sendMessage(prompt);
        }
      } catch (err: any) {
        // Drop a ghost assistant message that may have been created by an
        // early streaming delta before the error surfaced.
        const msgs = useChatStore.getState().messages;
        const last = msgs[msgs.length - 1];
        if (last?.role === "assistant" && last.content === "" && last.isStreaming) {
          useChatStore.getState().setMessages(msgs.slice(0, -1));
        }
        setError(friendlyError(err.message));
        setLoading(false);
      } finally {
        clearTimeout(timer);
      }
    },
    [ctx, setError, setLoading, startLoadingTimer],
  );

  const send = useCallback(
    async (text: string, attachments?: FileAttachment[]) => {
      if (!ctx || !text.trim()) return;
      const messageAttachments = attachments && attachments.length > 0 ? attachments : undefined;

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
        const allAgents = [
          ...(ctx.settings.customAgents || []).filter((a: any) => a.enabled),
          ...useChatStore.getState().discoveredAgents,
        ];
        const agent = allAgents.find((a: any) => a.name === agentName);
        if (agent) {
          setAgent(agentName);
          actualPrompt = actualPrompt.replace(/@[\w-]+\s*/, "").trim() || `Hello @${agentName}`;
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

      lastUserPrompt.current = {
        prompt: actualPrompt,
        display: displayText,
        attachments: messageAttachments,
      };

      await dispatch(actualPrompt, messageAttachments);
    },
    [ctx, addMessage, dispatch, initPromise, setAgent, setError],
  );

  const retry = useCallback(async () => {
    if (!ctx || !lastUserPrompt.current) return;
    const { prompt, attachments } = lastUserPrompt.current;
    await dispatch(prompt, attachments);
  }, [ctx, dispatch]);

  const abort = useCallback(async () => {
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

  const resetLastPrompt = useCallback(() => {
    lastUserPrompt.current = null;
  }, []);

  const canRetry = !isLoading && messagesLength > 0 && !!lastUserPrompt.current;

  return { send, retry, abort, canRetry, resetLastPrompt };
}
