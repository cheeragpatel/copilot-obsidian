import * as React from "react";
import { useState, useCallback } from "react";
import { useChatStore } from "../store/chatStore";
import { getAvailableAgents } from "../store/agentSelectors";
import type { CustomAgentEntry } from "../types/settings";

interface AgentPickerProps {
  agents: CustomAgentEntry[];
  onAddAgent?: (agent: CustomAgentEntry) => void;
}

export const AgentPicker: React.FC<AgentPickerProps> = ({ agents, onAddAgent }) => {
  const { selectedAgent, setAgent, discoveredAgents } = useChatStore();
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newPrompt, setNewPrompt] = useState("");

  const allAgents = getAvailableAgents(agents, discoveredAgents);

  const handleAddAgent = useCallback(() => {
    if (!newName.trim()) return;
    const agent: CustomAgentEntry = {
      name: newName.trim().toLowerCase().replace(/\s+/g, "-"),
      displayName: newName.trim(),
      description: newDesc.trim() || `Custom agent: ${newName.trim()}`,
      prompt: newPrompt.trim() || `You are the ${newName.trim()} agent.`,
      enabled: true,
    };
    onAddAgent?.(agent);
    setNewName("");
    setNewDesc("");
    setNewPrompt("");
    setShowAddForm(false);
    setAgent(agent.name);
  }, [newName, newDesc, newPrompt, onAddAgent, setAgent]);

  return (
    <div className="copilot-agent-picker">
      <select
        className="copilot-agent-select"
        value={selectedAgent || ""}
        aria-label="Custom agent"
        onChange={(e) => {
          if (e.target.value === "__add__") {
            setShowAddForm(true);
          } else {
            setAgent(e.target.value || null);
          }
        }}
        title={
          selectedAgent
            ? allAgents.find((a) => a.name === selectedAgent)?.description || selectedAgent
            : "Select an agent (or type @ in chat)"
        }
      >
        <option value="">🤖 No agent</option>
        {allAgents.map((agent) => (
          <option key={agent.name} value={agent.name}>
            @{agent.name}{agent.displayName !== agent.name ? ` — ${agent.displayName}` : ""}
          </option>
        ))}
        <option value="__add__">＋ Add agent…</option>
      </select>

      {showAddForm && (
        <div className="copilot-add-agent-form">
          <input
            className="copilot-add-agent-input"
            type="text"
            placeholder="Agent name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddAgent()}
            autoFocus
          />
          <input
            className="copilot-add-agent-input"
            type="text"
            placeholder="Description (optional)"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
          />
          <textarea
            className="copilot-add-agent-textarea"
            placeholder="System prompt (optional)"
            value={newPrompt}
            onChange={(e) => setNewPrompt(e.target.value)}
            rows={2}
          />
          <div className="copilot-add-agent-actions">
            <button className="copilot-add-agent-save" onClick={handleAddAgent}>
              Add
            </button>
            <button className="copilot-add-agent-cancel" onClick={() => setShowAddForm(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
