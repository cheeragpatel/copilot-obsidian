import * as React from "react";
import { useState, useCallback, useRef, useEffect, useContext, useMemo } from "react";
import { PluginContext } from "../views/CopilotChatView";
import { useChatStore } from "../store/chatStore";
import { getAvailableAgents } from "../store/agentSelectors";
import { ChatMode } from "../types/constants";
import { getAllCommands } from "../commands/SlashCommandRegistry";
import {
  AutocompletePopup,
  autocompleteOptionId,
  type AutocompleteItem,
} from "./AutocompletePopup";
import { AttachmentChips } from "./AttachmentChips";
import { ChatControlsBar } from "./ChatControlsBar";
import { useVaultAttachments } from "../hooks/useVaultAttachments";
import type { FileAttachment } from "../types/chat";
import type { CustomAgentEntry } from "../types/settings";

interface ChatInputProps {
  onSend: (message: string, attachments?: FileAttachment[]) => void;
  onAbort: () => void;
  onRetry?: () => void;
  onModeSwitch: (mode: ChatMode) => void;
  onAutopilot?: (enabled: boolean) => void;
  onModelChange?: (model: string) => void;
  onMCPChange?: () => void;
  onMCPRefresh?: () => void;
  onAddAgent?: (agent: CustomAgentEntry) => void;
  isLoading: boolean;
  isTaskRunning: boolean;
  canRetry?: boolean;
}

const AUTOCOMPLETE_ID = "copilot-autocomplete";

export const ChatInput: React.FC<ChatInputProps> = ({
  onSend,
  onAbort,
  onRetry,
  onModeSwitch,
  onAutopilot,
  onModelChange,
  onMCPChange,
  onMCPRefresh,
  onAddAgent,
  isLoading,
  isTaskRunning,
  canRetry,
}) => {
  const [input, setInput] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [autocompleteDismissed, setAutocompleteDismissed] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ctx = useContext(PluginContext);
  // Per-field selectors keep the input from re-rendering on unrelated store
  // updates (messages, MCP tools, etc).
  const currentMode = useChatStore((s) => s.currentMode);
  const autopilotPermissions = useChatStore((s) => s.autopilotPermissions);
  const discoveredAgents = useChatStore((s) => s.discoveredAgents);
  const customAgents = ctx?.settings?.customAgents ?? [];

  const {
    attachments,
    isDragActive,
    addFiles,
    removeAttachment,
    clear: clearAttachments,
    bindDropzone,
  } = useVaultAttachments(ctx);

  // Autoresize the textarea.
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 200) + "px";
    }
  }, [input]);

  // Memoize the merged agent list so autocomplete doesn't recompute it on
  // every keystroke unless the underlying lists changed.
  const availableAgents = useMemo(
    () => getAvailableAgents(customAgents, discoveredAgents),
    [customAgents, discoveredAgents],
  );

  // Pure derivation — autocomplete items follow input + agent list.
  const autocomplete = useMemo<AutocompleteItem[]>(() => {
    if (autocompleteDismissed) return [];
    const items: AutocompleteItem[] = [];

    const slashMatch = input.match(/^\/([\w-]*)$/);
    if (slashMatch) {
      const partial = slashMatch[1].toLowerCase();
      const matches = getAllCommands().filter(
        (cmd) =>
          cmd.name.startsWith(partial) ||
          cmd.description.toLowerCase().includes(partial),
      );
      for (const cmd of matches) {
        items.push({
          type: "command",
          label: `/${cmd.name}`,
          description: cmd.description,
          icon: cmd.icon,
          value: `/${cmd.name} `,
        });
      }
    }

    const atMatch = input.match(/@([\w-]*)$/);
    if (atMatch) {
      const partial = atMatch[1].toLowerCase();
      const filtered = availableAgents.filter(
        (agent) =>
          agent.name.toLowerCase().startsWith(partial) ||
          agent.displayName.toLowerCase().includes(partial),
      );
      for (const agent of filtered) {
        items.push({
          type: "agent",
          label: `@${agent.name}`,
          description: agent.description || agent.displayName,
          icon: "🤖",
          value: `@${agent.name} `,
        });
      }
    }

    return items;
  }, [input, availableAgents, autocompleteDismissed]);

  // Reset highlighted suggestion whenever the list changes.
  useEffect(() => {
    setSelectedIndex(0);
  }, [autocomplete]);

  // A new keystroke that changes the trigger token re-arms the popup.
  useEffect(() => {
    setAutocompleteDismissed(false);
  }, [input]);

  const applyAutocomplete = useCallback(
    (item: AutocompleteItem) => {
      if (item.type === "command") {
        setInput(item.value);
      } else {
        setInput((prev) => prev.replace(/@[\w-]*$/, item.value));
      }
      setAutocompleteDismissed(true);
      textareaRef.current?.focus();
    },
    [],
  );

  const handleSubmit = useCallback(() => {
    if (!input.trim() || isLoading) return;
    if (attachments.length > 0) {
      onSend(input, attachments);
    } else {
      onSend(input);
    }
    setInput("");
    clearAttachments();
    setAutocompleteDismissed(false);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [attachments, clearAttachments, input, isLoading, onSend]);

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      if (event.target.files) {
        addFiles(Array.from(event.target.files));
      }
      event.target.value = "";
    },
    [addFiles],
  );

  const handleAttachClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (autocomplete.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, autocomplete.length - 1));
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          return;
        }
        if (
          e.key === "Tab" ||
          (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey)
        ) {
          e.preventDefault();
          applyAutocomplete(autocomplete[selectedIndex]);
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setAutocompleteDismissed(true);
          return;
        }
      }

      if (
        (e.key === "Enter" && !e.shiftKey) ||
        (e.key === "Enter" && (e.ctrlKey || e.metaKey))
      ) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit, autocomplete, selectedIndex, applyAutocomplete],
  );

  const activeDescendant =
    autocomplete.length > 0 ? autocompleteOptionId(selectedIndex, AUTOCOMPLETE_ID) : undefined;

  return (
    <div className="copilot-chat-input-area">
      <AutocompletePopup
        items={autocomplete}
        selectedIndex={selectedIndex}
        onSelect={applyAutocomplete}
        onHover={setSelectedIndex}
        id={AUTOCOMPLETE_ID}
      />
      <div
        className={`copilot-chat-input-wrapper ${isDragActive ? "copilot-drag-active" : ""}`}
        {...bindDropzone}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="copilot-chat-file-input"
          onChange={handleFileChange}
          tabIndex={-1}
        />
        <AttachmentChips items={attachments} onRemove={removeAttachment} />
        <div className="copilot-chat-input-row">
          <textarea
            ref={textareaRef}
            className="copilot-chat-textarea"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isLoading
                ? "Copilot is thinking..."
                : "Ask Copilot anything... (/ for commands, @ for agents)"
            }
            rows={1}
            aria-label="Chat with Copilot"
            aria-autocomplete="list"
            aria-controls={AUTOCOMPLETE_ID}
            aria-activedescendant={activeDescendant}
          />
          <div className="copilot-chat-btn-group">
            {canRetry && !isLoading && (
              <button
                type="button"
                className="copilot-chat-retry-btn"
                onClick={onRetry}
                title="Retry last message"
              >
                ↻
              </button>
            )}
            <button
              type="button"
              className="copilot-attach-btn"
              onClick={handleAttachClick}
              title="Attach files"
              aria-label="Attach files"
              disabled={isLoading}
            >
              📎
            </button>
            {isTaskRunning ? (
              <button type="button" className="copilot-chat-stop-btn" onClick={onAbort}>
                ■ Stop
              </button>
            ) : (
              <button
                type="button"
                className="copilot-chat-send-btn"
                onClick={handleSubmit}
                disabled={!input.trim()}
              >
                Send
              </button>
            )}
          </div>
        </div>
      </div>
      <ChatControlsBar
        currentMode={currentMode}
        autopilotPermissions={autopilotPermissions}
        agents={customAgents}
        onMode={onModeSwitch}
        onAutopilot={onAutopilot}
        onModel={onModelChange}
        onMCPChange={onMCPChange}
        onMCPRefresh={onMCPRefresh}
        onAddAgent={onAddAgent}
      />
      {input.length > 0 && (
        <div className={`copilot-char-count${input.length > 10000 ? " warning" : ""}`}>
          {input.length} chars
        </div>
      )}
    </div>
  );
};
