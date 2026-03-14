import * as React from "react";
import { useContext, useState, useEffect } from "react";
import { PluginContext } from "../views/CopilotChatView";

interface EmptyStateProps {
  onSuggestionClick: (text: string) => void;
  isInitializing?: boolean;
}

interface SmartSuggestion {
  label: string;
  prompt: string;
  icon: string;
}

function useSmartSuggestions(): SmartSuggestion[] {
  const ctx = useContext(PluginContext);
  const [suggestions, setSuggestions] = useState<SmartSuggestion[]>([]);

  useEffect(() => {
    if (!ctx) return;
    const app = ctx.app;

    const buildSuggestions = () => {
      const result: SmartSuggestion[] = [];
      const activeFile = app.workspace.getActiveFile?.();

      if (activeFile) {
        const name = activeFile.basename;
        result.push(
          { label: `Summarize "${name}"`, prompt: `/summarize`, icon: "📝" },
          { label: `Explain "${name}"`, prompt: `/explain`, icon: "💡" },
          { label: `Suggest tags for "${name}"`, prompt: `/tags`, icon: "🏷️" },
          { label: `Find links for "${name}"`, prompt: `/links`, icon: "🔗" },
        );
      } else {
        result.push(
          { label: "Explore my vault", prompt: `/vault`, icon: "🗄️" },
          { label: "Help with my daily note", prompt: `/daily`, icon: "📅" },
          { label: "Create a new note", prompt: `/new`, icon: "✨" },
          {
            label: "Search my vault",
            prompt: "Search my vault for notes about...",
            icon: "🔍",
          },
        );
      }

      setSuggestions(result);
    };

    buildSuggestions();

    const ref = app.workspace.on("active-leaf-change", buildSuggestions);
    return () => app.workspace.offref(ref);
  }, [ctx]);

  return suggestions;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ onSuggestionClick, isInitializing }) => {
  const suggestions = useSmartSuggestions();

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
      <h4 className="copilot-empty-title">GitHub Copilot for Obsidian</h4>
      {isInitializing ? (
        <p className="copilot-empty-subtitle copilot-initializing">
          <span className="copilot-init-spinner" />
          Connecting to Copilot…
        </p>
      ) : (
        <>
          <p className="copilot-empty-subtitle">
            Ask questions about your notes, or use /commands and @agents.
          </p>
          <div className="copilot-empty-suggestions">
            {suggestions.map((s) => (
              <button
                key={s.label}
                className="copilot-suggestion-btn"
                onClick={() => onSuggestionClick(s.prompt)}
              >
                <span className="copilot-suggestion-icon">{s.icon}</span>
                {s.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
