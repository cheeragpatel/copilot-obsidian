import * as React from "react";
import { useChatStore } from "../store/chatStore";
import { AVAILABLE_MODELS } from "../types/constants";

export const ModelSelector: React.FC = () => {
  const { currentModel, setModel, availableModels } = useChatStore();

  // Use dynamically fetched models if available, otherwise fall back to static list
  const models = availableModels.length > 0
    ? availableModels
    : AVAILABLE_MODELS.map((id) => ({ id, name: id }));

  return (
    <div className="copilot-model-selector">
      <select
        className="copilot-model-select"
        value={currentModel}
        onChange={(e) => setModel(e.target.value)}
      >
        {models.map((model) => (
          <option key={model.id} value={model.id}>
            {model.name}
          </option>
        ))}
      </select>
    </div>
  );
};
