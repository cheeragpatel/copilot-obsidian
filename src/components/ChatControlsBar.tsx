import * as React from "react";
import { ChatMode } from "../types/constants";
import { ModeSelector } from "./ModeSelector";
import { ModelSelector } from "./ModelSelector";
import { MCPPicker } from "./MCPPicker";
import { AgentPicker } from "./AgentPicker";
import { AutopilotToggle } from "./AutopilotToggle";
import type { CustomAgentEntry } from "../types/settings";

interface ChatControlsBarProps {
  currentMode: ChatMode;
  autopilotPermissions: boolean;
  agents: CustomAgentEntry[];
  onMode: (mode: ChatMode) => void;
  onAutopilot?: (enabled: boolean) => void;
  onModel?: (model: string) => void;
  onMCPChange?: () => void;
  onMCPRefresh?: () => void;
  onAddAgent?: (agent: CustomAgentEntry) => void;
}

/** Bottom toolbar grouping mode/model/MCP/agent pickers under the textarea. */
export const ChatControlsBar: React.FC<ChatControlsBarProps> = ({
  currentMode,
  autopilotPermissions,
  agents,
  onMode,
  onAutopilot,
  onModel,
  onMCPChange,
  onMCPRefresh,
  onAddAgent,
}) => {
  return (
    <div className="copilot-chat-controls">
      <ModeSelector currentMode={currentMode} onModeChange={onMode} />
      <AutopilotToggle enabled={autopilotPermissions} onToggle={onAutopilot || (() => {})} />
      <ModelSelector onModelChange={onModel} />
      <MCPPicker onMCPChange={onMCPChange} onRefresh={onMCPRefresh} />
      <AgentPicker agents={agents} onAddAgent={onAddAgent} />
    </div>
  );
};
