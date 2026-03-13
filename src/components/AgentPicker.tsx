import * as React from "react";
import { useChatStore } from "../store/chatStore";
import type { CustomAgentEntry } from "../types/settings";

interface AgentPickerProps {
  agents: CustomAgentEntry[];
}

export const AgentPicker: React.FC<AgentPickerProps> = ({ agents }) => {
  const { selectedAgent, setAgent } = useChatStore();
  const enabledAgents = agents.filter((a) => a.enabled);

  return (
    <div className="copilot-agent-picker">
      <select
        className="copilot-agent-select"
        value={selectedAgent || ""}
        onChange={(e) => setAgent(e.target.value || null)}
        title={
          selectedAgent
            ? enabledAgents.find((a) => a.name === selectedAgent)?.description || selectedAgent
            : "Select an agent (or type @ in chat)"
        }
      >
        <option value="">🤖 No agent</option>
        {enabledAgents.map((agent) => (
          <option key={agent.name} value={agent.name}>
            @{agent.name} — {agent.displayName}
          </option>
        ))}
        {enabledAgents.length === 0 && (
          <option disabled>Add agents in Settings</option>
        )}
      </select>
    </div>
  );
};
