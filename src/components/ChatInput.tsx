import * as React from "react";
import { useState, useCallback, useRef, useEffect } from "react";

interface ChatInputProps {
  onSend: (message: string) => void;
  onAbort: () => void;
  isLoading: boolean;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSend,
  onAbort,
  isLoading,
}) => {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 200) + "px";
    }
  }, [input]);

  const handleSubmit = useCallback(() => {
    if (!input.trim() || isLoading) return;
    onSend(input);
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [input, isLoading, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  return (
    <div className="copilot-chat-input-area">
      <div className="copilot-chat-input-wrapper">
        <textarea
          ref={textareaRef}
          className="copilot-chat-textarea"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isLoading ? "Copilot is thinking..." : "Ask Copilot anything..."}
          disabled={isLoading}
          rows={1}
        />
        {isLoading ? (
          <button className="copilot-chat-stop-btn" onClick={onAbort}>
            Stop
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
  );
};
