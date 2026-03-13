import * as React from "react";
import { useChatStore } from "../store/chatStore";
import type { CustomAgentEntry } from "../types/settings";

interface AgentPickerProps {
  agents: CustomAgentEntry[];
}

export const AgentPicker: React.FC<AgentPickerProps> = ({ agents }) => {
  const { selectedAgent, setAgent } = useChatStore();
  const enabledAgents = agents.filter((a) => a.enabled);

  if (enabledAgents.length === 0) return null;

  return (
    <div className="copilot-agent-picker">
      <select
        className="copilot-agent-select"
        value={selectedAgent || ""}
        onChange={(e) => setAgent(e.target.value || null)}
      >
        <option value="">No agent</option>
        {enabledAgents.map((agent) => (
          <option key={agent.name} value={agent.name}>
            @{agent.name}
          </option>
        ))}
      </select>
    </div>
  );
};
