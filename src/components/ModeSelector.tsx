import * as React from "react";
import { ChatMode } from "../types/constants";

interface ModeSelectorProps {
  currentMode: ChatMode;
  onModeChange: (mode: ChatMode) => void;
}

export const ModeSelector: React.FC<ModeSelectorProps> = ({
  currentMode,
  onModeChange,
}) => {
  return (
    <div className="copilot-mode-selector">
      <button
        className={`copilot-mode-btn ${currentMode === ChatMode.Ask ? "active" : ""}`}
        onClick={() => onModeChange(ChatMode.Ask)}
      >
        Ask
      </button>
      <button
        className={`copilot-mode-btn ${currentMode === ChatMode.Agent ? "active" : ""}`}
        onClick={() => onModeChange(ChatMode.Agent)}
      >
        Agent
      </button>
    </div>
  );
};
