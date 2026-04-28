import * as React from "react";

interface AutopilotToggleProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
}

export const AutopilotToggle: React.FC<AutopilotToggleProps> = ({
  enabled,
  onToggle,
}) => {
  return (
    <div className="copilot-autopilot-toggle">
      <label className="copilot-toggle-label">
        <input
          type="checkbox"
          className="copilot-toggle-input"
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
          aria-label="Enable autopilot permissions"
        />
        <span className="copilot-toggle-text">Autopilot</span>
      </label>
    </div>
  );
};
