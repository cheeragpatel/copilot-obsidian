import * as React from "react";
import { useContext } from "react";
import { useChatStore } from "../store/chatStore";
import { ChatMode } from "../types/constants";
import { ModeSelector } from "./ModeSelector";
import { ModelSelector } from "./ModelSelector";
import { AgentPicker } from "./AgentPicker";
import { PluginContext } from "../views/CopilotChatView";

interface ChatHeaderProps {
  onNewConversation: () => void;
  onModeSwitch: (mode: ChatMode) => void;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  onNewConversation,
  onModeSwitch,
}) => {
  const ctx = useContext(PluginContext);
  const { currentMode } = useChatStore();
  const customAgents = ctx?.settings?.customAgents ?? [];

  return (
    <>
      <div className="copilot-chat-header">
        <div className="copilot-chat-header-left">
          <h4 className="copilot-chat-header-title">Copilot</h4>
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
      <div className="copilot-chat-controls">
        <ModeSelector currentMode={currentMode} onModeChange={onModeSwitch} />
        <ModelSelector />
        <AgentPicker agents={customAgents} />
      </div>
    </>
  );
};
