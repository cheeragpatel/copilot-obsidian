import * as React from "react";
import { useEffect, useRef } from "react";
import type { ConversationMeta } from "../types/chat";

interface ConversationHistoryProps {
  conversations: ConversationMeta[];
  onSelect: (sessionId: string) => void;
  onClose: () => void;
}

export const ConversationHistory: React.FC<ConversationHistoryProps> = ({
  conversations,
  onSelect,
  onClose,
}) => {
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  useEffect(() => {
    closeBtnRef.current?.focus();
  }, []);

  return (
    <div className="copilot-conversations-overlay" onClick={onClose}>
      <div
        className="copilot-conversations-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="copilot-conversations-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="copilot-conversations-header">
          <h3 id="copilot-conversations-title">Conversations</h3>
          <button
            ref={closeBtnRef}
            type="button"
            className="copilot-conversations-close-btn"
            onClick={onClose}
            aria-label="Close conversation history"
          >
            ×
          </button>
        </div>
        <div className="copilot-conversations-list">
          {conversations.length === 0 ? (
            <div className="copilot-conversations-empty">
              No previous conversations
            </div>
          ) : (
            conversations.map((conv) => (
              <button
                type="button"
                key={conv.sessionId}
                className="copilot-conversation-item"
                onClick={() => onSelect(conv.sessionId)}
              >
                <div className="copilot-conversation-item-title">
                  {conv.title || "Untitled conversation"}
                </div>
                <div className="copilot-conversation-item-meta">
                  <span>{conv.model}</span>
                  <span>
                    {new Date(conv.lastUpdated).toLocaleDateString()}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
