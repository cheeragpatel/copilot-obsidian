import * as React from "react";
import { useState, useCallback, useRef, useEffect, useContext } from "react";
import { PluginContext } from "../views/CopilotChatView";
import { useChatStore } from "../store/chatStore";
import { ChatMode } from "../types/constants";
import { BUILT_IN_COMMANDS } from "../commands/SlashCommandRegistry";
import { ModeSelector } from "./ModeSelector";
import { ModelSelector } from "./ModelSelector";
import { AgentPicker } from "./AgentPicker";
import type { CustomAgentEntry } from "../types/settings";

interface ChatInputProps {
  onSend: (message: string) => void;
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
  const [autocomplete, setAutocomplete] = useState<AutocompleteItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
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
      // Merge settings + discovered agents for autocomplete
      const allAgents: CustomAgentEntry[] = [];
      const seen = new Set<string>();
      for (const a of (ctx?.settings?.customAgents || []).filter((a: CustomAgentEntry) => a.enabled)) {
        if (!seen.has(a.name)) { seen.add(a.name); allAgents.push(a); }
      }
      for (const a of discoveredAgents) {
        if (!seen.has(a.name)) { seen.add(a.name); allAgents.push(a); }
      }

      const filtered = allAgents.filter(
        (a) =>
          a.name.toLowerCase().startsWith(partial) ||
          a.displayName.toLowerCase().includes(partial),
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

  const handleSubmit = useCallback(() => {
    if (!input.trim() || isLoading) return;
    onSend(input);
    setInput("");
    setAutocomplete([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [input, isLoading, onSend]);

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
        if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
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

      if (e.key === "Enter" && !e.shiftKey) {
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
      <div className="copilot-chat-input-wrapper">
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
              className="copilot-chat-retry-btn"
              onClick={onRetry}
              title="Retry last message"
            >
              ↻
            </button>
          )}
          {isLoading ? (
            <button className="copilot-chat-stop-btn" onClick={onAbort}>
              ■ Stop
            </button>
          ) : (
            <button
              className="copilot-chat-send-btn"
              onClick={handleSubmit}
              disabled={!input.trim()}
            >
              Send
            </button>
          )}
        </div>
      </div>
      <div className="copilot-chat-controls">
        <ModeSelector currentMode={currentMode} onModeChange={onModeSwitch} />
        <ModelSelector onModelChange={onModelChange} />
        <AgentPicker agents={customAgents} onAddAgent={onAddAgent} />
      </div>
    </div>
  );
};
