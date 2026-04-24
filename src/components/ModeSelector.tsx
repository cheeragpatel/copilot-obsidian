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
      <select
        className="copilot-mode-select"
        value={currentMode}
        onChange={(e) => onModeChange(e.target.value as ChatMode)}
        aria-label="Chat mode"
      >
        <option value={ChatMode.Ask}>Ask</option>
        <option value={ChatMode.Agent}>Agent</option>
        <option value={ChatMode.Autopilot}>Autopilot</option>
      </select>
    </div>
  );
};
