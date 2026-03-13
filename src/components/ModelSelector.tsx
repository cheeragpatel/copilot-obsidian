import * as React from "react";
import { useChatStore } from "../store/chatStore";
import { AVAILABLE_MODELS } from "../types/constants";

export const ModelSelector: React.FC = () => {
  const { currentModel, setModel } = useChatStore();

  return (
    <div className="copilot-model-selector">
      <select
        className="copilot-model-select"
        value={currentModel}
        onChange={(e) => setModel(e.target.value)}
      >
        {AVAILABLE_MODELS.map((model) => (
          <option key={model} value={model}>
            {model}
          </option>
        ))}
      </select>
    </div>
  );
};
