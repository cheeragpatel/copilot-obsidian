import * as React from "react";
import { Notice } from "obsidian";
import { useState, useCallback, useRef, useEffect, useContext } from "react";
import { PluginContext } from "../views/CopilotChatView";
import { useChatStore } from "../store/chatStore";
import { ChatMode } from "../types/constants";
import { BUILT_IN_COMMANDS } from "../commands/SlashCommandRegistry";
import { ModeSelector } from "./ModeSelector";
import { ModelSelector } from "./ModelSelector";
import { AgentPicker } from "./AgentPicker";
import type { FileAttachment } from "../types/chat";
import type { CustomAgentEntry } from "../types/settings";

interface ChatInputProps {
  onSend: (message: string, attachments?: FileAttachment[]) => void;
  onAbort: () => void;
  onRetry?: () => void;
  onModeSwitch: (mode: ChatMode) => void;
  onModelChange?: (model: string) => void;
  onAddAgent?: (agent: CustomAgentEntry) => void;
  isLoading: boolean;
  canRetry?: boolean;
}

interface AutocompleteItem {
  type: "command" | "agent";
  label: string;
  description: string;
  icon: string;
  value: string;
}

interface FileWithPath extends File {
  path?: string;
}

function normalizePath(path: string): string {
  return path.replace(/^file:\/\//, "").replace(/\\/g, "/").replace(/\/+/g, "/");
}

function isFileDrag(dataTransfer: DataTransfer | null): boolean {
  return Array.from(dataTransfer?.types || []).includes("Files");
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSend,
  onAbort,
  onRetry,
  onModeSwitch,
  onModelChange,
  onAddAgent,
  isLoading,
  canRetry,
}) => {
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [autocomplete, setAutocomplete] = useState<AutocompleteItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isDragActive, setIsDragActive] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ctx = useContext(PluginContext);
  const { currentMode, discoveredAgents } = useChatStore();
  const customAgents = ctx?.settings?.customAgents ?? [];

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 200) + "px";
    }
  }, [input]);

  useEffect(() => {
    const items: AutocompleteItem[] = [];

    const slashMatch = input.match(/^\/([\w-]*)$/);
    if (slashMatch) {
      const partial = slashMatch[1].toLowerCase();
      const matches = BUILT_IN_COMMANDS.filter(
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
      const allAgents: CustomAgentEntry[] = [];
      const seen = new Set<string>();
      for (const agent of (ctx?.settings?.customAgents || []).filter(
        (item: CustomAgentEntry) => item.enabled,
      )) {
        if (!seen.has(agent.name)) {
          seen.add(agent.name);
          allAgents.push(agent);
        }
      }
      for (const agent of discoveredAgents) {
        if (!seen.has(agent.name)) {
          seen.add(agent.name);
          allAgents.push(agent);
        }
      }

      const filtered = allAgents.filter(
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

    setAutocomplete(items);
    setSelectedIndex(0);
  }, [input, ctx, discoveredAgents]);

  const applyAutocomplete = useCallback(
    (item: AutocompleteItem) => {
      if (item.type === "command") {
        setInput(item.value);
      } else {
        const newInput = input.replace(/@[\w-]*$/, item.value);
        setInput(newInput);
      }
      setAutocomplete([]);
      textareaRef.current?.focus();
    },
    [input],
  );

  const resolveVaultAttachment = useCallback(
    (file: FileWithPath): FileAttachment | null => {
      const vault = ctx?.app?.vault;
      if (!vault) return null;

      const candidatePaths = new Set<string>();
      const basePath = vault.adapter?.getBasePath?.();
      const normalizedBasePath =
        typeof basePath === "string" && basePath.length > 0
          ? normalizePath(basePath).replace(/\/$/, "")
          : null;
      const rawPath = typeof file.path === "string" ? normalizePath(file.path) : "";
      const webkitPath =
        typeof file.webkitRelativePath === "string" && file.webkitRelativePath.length > 0
          ? normalizePath(file.webkitRelativePath)
          : "";

      if (rawPath) {
        if (normalizedBasePath && rawPath.startsWith(`${normalizedBasePath}/`)) {
          candidatePaths.add(rawPath.slice(normalizedBasePath.length + 1));
        }
        candidatePaths.add(rawPath.replace(/^\/+/, ""));
      }

      if (webkitPath) {
        candidatePaths.add(webkitPath.replace(/^\/+/, ""));
      }

      if (file.name) {
        candidatePaths.add(file.name);
      }

      for (const candidate of candidatePaths) {
        const normalizedCandidate = normalizePath(candidate).replace(/^\/+/, "");
        const abstractFile =
          vault.getAbstractFileByPath?.(normalizedCandidate) ||
          vault.getFileByPath?.(normalizedCandidate);
        if (abstractFile?.path) {
          return {
            path: abstractFile.path,
            name:
              typeof abstractFile.name === "string" && abstractFile.name.length > 0
                ? abstractFile.name
                : file.name || abstractFile.path.split("/").pop() || abstractFile.path,
            type: file.type || "application/octet-stream",
          };
        }
      }

      return null;
    },
    [ctx],
  );

  const addAttachments = useCallback(
    (files: ArrayLike<File>) => {
      const resolved = Array.from(files, (file) => resolveVaultAttachment(file as FileWithPath));
      const validAttachments = resolved.filter(
        (attachment): attachment is FileAttachment => attachment !== null,
      );
      const missingCount = resolved.length - validAttachments.length;

      if (validAttachments.length > 0) {
        setAttachments((current) => {
          const seen = new Set(current.map((attachment) => attachment.path));
          const next = validAttachments.filter((attachment) => !seen.has(attachment.path));
          return next.length > 0 ? [...current, ...next] : current;
        });
      }

      if (missingCount > 0) {
        new Notice(
          `${missingCount} file${missingCount === 1 ? "" : "s"} could not be attached because they are outside the vault.`,
        );
      }
    },
    [resolveVaultAttachment],
  );

  const handleSubmit = useCallback(() => {
    if (!input.trim() || isLoading) return;
    if (attachments.length > 0) {
      onSend(input, attachments);
    } else {
      onSend(input);
    }
    setInput("");
    setAttachments([]);
    setAutocomplete([]);
    setIsDragActive(false);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [attachments, input, isLoading, onSend]);

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      if (event.target.files) {
        addAttachments(Array.from(event.target.files));
      }
      event.target.value = "";
    },
    [addAttachments],
  );

  const handleAttachClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleRemoveAttachment = useCallback((path: string) => {
    setAttachments((current) => current.filter((attachment) => attachment.path !== path));
  }, []);

  const handleDragEnter = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!isFileDrag(event.dataTransfer)) return;
    event.preventDefault();
    setIsDragActive(true);
  }, []);

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!isFileDrag(event.dataTransfer)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsDragActive(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }
    setIsDragActive(false);
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!isFileDrag(event.dataTransfer)) return;
      event.preventDefault();
      setIsDragActive(false);
      if (event.dataTransfer.files.length > 0) {
        addAttachments(Array.from(event.dataTransfer.files));
      }
    },
    [addAttachments],
  );

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
          setAutocomplete([]);
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

  return (
    <div className="copilot-chat-input-area">
      {autocomplete.length > 0 && (
        <div className="copilot-autocomplete-popup">
          {autocomplete.map((item, i) => (
            <div
              key={`${item.type}-${item.value}`}
              className={`copilot-autocomplete-item ${i === selectedIndex ? "selected" : ""}`}
              onClick={() => applyAutocomplete(item)}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              <span className="copilot-autocomplete-icon">{item.icon}</span>
              <div className="copilot-autocomplete-text">
                <span className="copilot-autocomplete-label">{item.label}</span>
                <span className="copilot-autocomplete-desc">{item.description}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      <div
        className={`copilot-chat-input-wrapper ${isDragActive ? "copilot-drag-active" : ""}`}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="copilot-chat-file-input"
          onChange={handleFileChange}
          tabIndex={-1}
        />
        {attachments.length > 0 && (
          <div className="copilot-attachment-chips">
            {attachments.map((attachment) => (
              <div key={attachment.path} className="copilot-attachment-chip">
                <span>{attachment.name}</span>
                <button
                  type="button"
                  className="copilot-attachment-chip-remove"
                  onClick={() => handleRemoveAttachment(attachment.path)}
                  aria-label={`Remove ${attachment.name}`}
                  title={`Remove ${attachment.name}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
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
            {isLoading ? (
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
      <div className="copilot-chat-controls">
        <ModeSelector currentMode={currentMode} onModeChange={onModeSwitch} />
        <ModelSelector onModelChange={onModelChange} />
        <AgentPicker agents={customAgents} onAddAgent={onAddAgent} />
      </div>
      {input.length > 0 && (
        <div className={`copilot-char-count${input.length > 10000 ? " warning" : ""}`}>
          {input.length} chars
        </div>
      )}
    </div>
  );
};
