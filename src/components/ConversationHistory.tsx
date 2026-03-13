import * as React from "react";
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
  return (
    <div className="copilot-conversations-overlay" onClick={onClose}>
      <div
        className="copilot-conversations-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="copilot-conversations-header">
          <h3>Conversations</h3>
          <button className="copilot-conversations-close-btn" onClick={onClose}>
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
              <div
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
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
