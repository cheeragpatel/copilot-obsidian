import * as React from "react";

interface ChatHeaderProps {
  onNewConversation: () => void;
  onHistoryClick: () => void;
  isConnected?: boolean;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  onNewConversation,
  onHistoryClick,
  isConnected,
}) => {
  return (
    <div className="copilot-chat-header">
      <div className="copilot-chat-header-left">
        <h4 className="copilot-chat-header-title">Copilot</h4>
        <span
          className={`copilot-status-badge ${isConnected ? "connected" : "connecting"}`}
          role="status"
          aria-label={isConnected ? "Connected" : "Connecting"}
          title={isConnected ? "Connected" : "Connecting…"}
        />
      </div>
      <div className="copilot-chat-header-actions">
        <button
          className="copilot-chat-header-btn"
          onClick={onHistoryClick}
          title="Conversation history"
          aria-label="Conversation history"
        >
          🕐
        </button>
        <button
          className="copilot-chat-header-btn"
          onClick={onNewConversation}
          title="New conversation"
          aria-label="New conversation"
        >
          +
        </button>
      </div>
    </div>
  );
};
