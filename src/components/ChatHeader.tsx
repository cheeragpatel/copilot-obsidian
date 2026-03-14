import * as React from "react";

interface ChatHeaderProps {
  onNewConversation: () => void;
  isConnected?: boolean;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  onNewConversation,
  isConnected,
}) => {
  return (
    <div className="copilot-chat-header">
      <div className="copilot-chat-header-left">
        <h4 className="copilot-chat-header-title">Copilot</h4>
        <span
          className={`copilot-status-badge ${isConnected ? "connected" : "connecting"}`}
          title={isConnected ? "Connected" : "Connecting…"}
        />
      </div>
      <div className="copilot-chat-header-actions">
        <button
          className="copilot-chat-header-btn"
          onClick={onNewConversation}
          title="New conversation"
        >
          +
        </button>
      </div>
    </div>
  );
};
