import * as React from "react";
import { useChatStore } from "../store/chatStore";
import { AVAILABLE_MODELS } from "../types/constants";

interface ModelSelectorProps {
  onModelChange?: (model: string) => void;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({ onModelChange }) => {
  const { currentModel, setModel, availableModels } = useChatStore();

  const models = availableModels.length > 0
    ? availableModels
    : AVAILABLE_MODELS.map((id) => ({ id, name: id }));

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const model = e.target.value;
    setModel(model);
    onModelChange?.(model);
  };

  return (
    <div className="copilot-model-selector">
      <select
        className="copilot-model-select"
        value={currentModel}
        onChange={handleChange}
        aria-label="Language model"
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
