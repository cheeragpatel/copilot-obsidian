import * as React from "react";
import { ChatMode } from "../types/constants";
import { ModeSelector } from "./ModeSelector";
import { ModelSelector } from "./ModelSelector";
import { MCPPicker } from "./MCPPicker";
import { AgentPicker } from "./AgentPicker";
import type { CustomAgentEntry } from "../types/settings";

interface ChatControlsBarProps {
  currentMode: ChatMode;
  agents: CustomAgentEntry[];
  onMode: (mode: ChatMode) => void;
  onModel?: (model: string) => void;
  onMCPChange?: () => void;
  onMCPRefresh?: () => void;
  onAddAgent?: (agent: CustomAgentEntry) => void;
}

/** Bottom toolbar grouping mode/model/MCP/agent pickers under the textarea. */
export const ChatControlsBar: React.FC<ChatControlsBarProps> = ({
  currentMode,
  agents,
  onMode,
  onModel,
  onMCPChange,
  onMCPRefresh,
  onAddAgent,
}) => {
  return (
    <div className="copilot-chat-controls">
      <ModeSelector currentMode={currentMode} onModeChange={onMode} />
      <ModelSelector onModelChange={onModel} />
      <MCPPicker onMCPChange={onMCPChange} onRefresh={onMCPRefresh} />
      <AgentPicker agents={agents} onAddAgent={onAddAgent} />
    </div>
  );
};
