import * as React from "react";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { Notice, TFile } from "obsidian";
import { PluginContext } from "../views/CopilotChatView";
import { useChatStore, generateId } from "../store/chatStore";
import {
  ChatMode,
  COPILOT_EVENT_EXPORT_CONVERSATION,
  COPILOT_EVENT_NEW_CONVERSATION,
  COPILOT_EVENT_SEND_PROMPT,
} from "../types/constants";
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
import {
  buildCurrentNoteContext,
  wrapPromptWithCurrentNote,
} from "../features/CurrentNoteContext";
import { exportConversationToNote } from "../features/ConversationExport";
import type { CustomAgentEntry } from "../types/settings";
import type { FileAttachment } from "../types/chat";

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
  const setAutopilotPermissions = useChatStore((s) => s.setAutopilotPermissions);
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

  // Active note tracking — drives the auto-context chip and EmptyState
  // suggestions. We re-read on `active-leaf-change` rather than reaching into
  // workspace inside renders.
  const [activeNote, setActiveNote] = useState<TFile | null>(() => {
    const f = ctx?.app.workspace.getActiveFile?.();
    return f && (f as TFile).extension === "md" ? (f as TFile) : null;
  });

  useEffect(() => {
    if (!ctx) return;
    const updateActive = () => {
      const f = ctx.app.workspace.getActiveFile?.();
      setActiveNote(f && (f as TFile).extension === "md" ? (f as TFile) : null);
    };
    updateActive();
    const ref = ctx.app.workspace.on?.("active-leaf-change", updateActive);
    const fileRef = ctx.app.workspace.on?.("file-open", updateActive);
    return () => {
      if (ref) ctx.app.workspace.offref?.(ref);
      if (fileRef) ctx.app.workspace.offref?.(fileRef);
    };
  }, [ctx]);

  // One-shot suppression of the auto-context for the next send (chip ✕ click).
  const suppressContextOnce = useRef(false);
  const [contextSuppressed, setContextSuppressed] = useState(false);

  const sendWithContext = useCallback(
    async (text: string, attachments?: FileAttachment[]) => {
      if (!ctx) return;
      let prompt = text;
      const enabled = ctx.settings.autoIncludeCurrentNote;
      const skipOnce = suppressContextOnce.current;
      suppressContextOnce.current = false;
      setContextSuppressed(false);

      // Don't wrap slash/agent triggers — those build their own prompts.
      const isCommand = /^\/[\w-]/.test(text.trim()) || /^@[\w-]/.test(text.trim());

      if (enabled && !skipOnce && !isCommand) {
        try {
          const noteCtx = await buildCurrentNoteContext(ctx.app);
          if (noteCtx) {
            prompt = wrapPromptWithCurrentNote(text, noteCtx);
          }
        } catch {
          // If reading the active note fails, fall through to the raw prompt.
        }
      }
      await send(prompt, attachments);
    },
    [ctx, send],
  );

  const handleExport = useCallback(async () => {
    if (!ctx) return;
    const state = useChatStore.getState();
    if (state.messages.length === 0) {
      new Notice("No conversation to export yet.");
      return;
    }
    try {
      const sessionId =
        state.currentSessionId || ctx.copilotService.getSessionId?.() || "current";
      const firstUser = state.messages.find((m) => m.role === "user");
      const title = firstUser?.content.substring(0, 80) || "Copilot conversation";
      const file = await exportConversationToNote(
        ctx.app,
        {
          sessionId,
          title,
          model: state.currentModel,
          mode: state.currentMode,
          messages: state.messages.filter((m) => !m.isStreaming),
          lastUpdated: Date.now(),
          createdAt: Date.now(),
        },
        { folder: ctx.settings.exportFolder },
      );
      new Notice(`Exported to ${file.path}`);
    } catch (err: any) {
      setError(`Failed to export conversation: ${friendlyError(err?.message || String(err))}`);
    }
  }, [ctx, setError]);

  // Workspace-event bridge — main.ts triggers these from the command palette
  // and inline editor commands. The panel is the only thing wired to the chat
  // session, so it's the right home for the listeners.
  useEffect(() => {
    if (!ctx) return;
    const workspace: any = ctx.app.workspace;
    const newRef = workspace.on?.(COPILOT_EVENT_NEW_CONVERSATION, () => {
      void history.startNew();
    });
    const exportRef = workspace.on?.(COPILOT_EVENT_EXPORT_CONVERSATION, () => {
      void handleExport();
    });
    const sendRef = workspace.on?.(COPILOT_EVENT_SEND_PROMPT, (payload: any) => {
      const prompt = typeof payload === "string" ? payload : payload?.prompt;
      if (typeof prompt === "string" && prompt.trim()) {
        void send(prompt);
      }
    });
    return () => {
      if (newRef) workspace.offref?.(newRef);
      if (exportRef) workspace.offref?.(exportRef);
      if (sendRef) workspace.offref?.(sendRef);
    };
  }, [ctx, history, handleExport, send]);

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

  const handleAutopilotChange = useCallback(
    async (enabled: boolean) => {
      if (!ctx) return;
      try {
        await recreateSession({ autopilotPermissions: enabled });
        setAutopilotPermissions(enabled);
      } catch (err: any) {
        setError(friendlyError(err.message));
      }
    },
    [ctx, recreateSession, setError, setAutopilotPermissions],
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

  const showContextChip =
    !!ctx?.settings.autoIncludeCurrentNote && !!activeNote && !contextSuppressed;

  return (
    <div className="copilot-chat-container">
      <ChatHeader
        onNewConversation={history.startNew}
        onHistoryClick={history.openHistory}
        onExport={handleExport}
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
        <EmptyState onSuggestionClick={sendWithContext} isInitializing={initState === "loading"} />
      ) : (
        <MessageList messages={messages} />
      )}
      {showContextChip && activeNote && (
        <div
          className="copilot-context-chip"
          role="status"
          aria-label={`Including current note ${activeNote.basename} in next message`}
        >
          <span className="copilot-context-chip-icon" aria-hidden="true">📎</span>
          <span className="copilot-context-chip-label">{activeNote.basename}.md</span>
          <button
            type="button"
            className="copilot-context-chip-dismiss"
            title="Skip current-note context for the next message"
            aria-label="Skip current-note context for the next message"
            onClick={() => {
              suppressContextOnce.current = true;
              setContextSuppressed(true);
            }}
          >
            ✕
          </button>
        </div>
      )}
      <ChatInput
        onSend={sendWithContext}
        onAbort={abort}
        onRetry={retry}
        onModeSwitch={handleModeSwitch}
        onModelChange={handleModelChange}
        onMCPChange={handleMCPChange}
        onMCPRefresh={discoverTools}
        onAddAgent={handleAddAgent}
        onAutopilot={handleAutopilotChange}
        isLoading={isLoading}
        canRetry={canRetry}
      />
    </div>
  );
};
