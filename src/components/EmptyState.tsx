import * as React from "react";

interface EmptyStateProps {
  onSuggestionClick: (text: string) => void;
}

const SUGGESTIONS = [
  "Summarize my recent notes",
  "Help me brainstorm ideas for a project",
  "Search my vault for notes about...",
  "Create a new note outline",
];

export const EmptyState: React.FC<EmptyStateProps> = ({ onSuggestionClick }) => {
  return (
    <div className="copilot-empty-state">
      <div className="copilot-empty-icon">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z" />
          <path d="M12 16v-4" />
          <path d="M12 8h.01" />
        </svg>
      </div>
      <h4 className="copilot-empty-title">Copilot for Obsidian</h4>
      <p className="copilot-empty-subtitle">
        Ask questions, get help with your notes, or use Agent mode to let Copilot read and edit your vault.
      </p>
      <div className="copilot-empty-suggestions">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            className="copilot-suggestion-btn"
            onClick={() => onSuggestionClick(suggestion)}
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
};
