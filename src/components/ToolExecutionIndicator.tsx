import * as React from "react";
import { useState, useCallback } from "react";
import type { ToolCallInfo } from "../types/chat";

interface ToolExecutionIndicatorProps {
  toolCalls: ToolCallInfo[];
}

const ToolCallItem: React.FC<{ tc: ToolCallInfo }> = ({ tc }) => {
  const [expanded, setExpanded] = useState(false);
  const hasOutput = !!tc.result;

  const toggle = useCallback(() => {
    if (hasOutput) setExpanded((prev) => !prev);
  }, [hasOutput]);

  return (
    <div
      className={`copilot-tool-call ${tc.status}${hasOutput ? " has-output" : ""}`}
      role="listitem"
      aria-label={`${tc.name}: ${tc.status}`}
    >
      <div className="copilot-tool-call-header" onClick={toggle}>
        {tc.status === "running" && (
          <div className="copilot-tool-spinner" aria-hidden="true" />
        )}
        {tc.status === "complete" && <span aria-hidden="true">✓</span>}
        {tc.status === "error" && <span aria-hidden="true">✗</span>}
        <span className="copilot-tool-call-name">{tc.name}</span>
        {hasOutput && (
          <span
            className={`copilot-tool-call-chevron${expanded ? " expanded" : ""}`}
            aria-hidden="true"
          >
            ▶
          </span>
        )}
      </div>
      {expanded && hasOutput && (
        <div className="copilot-tool-call-output">
          <pre>{tc.result}</pre>
        </div>
      )}
    </div>
  );
};

export const ToolExecutionIndicator: React.FC<ToolExecutionIndicatorProps> = ({
  toolCalls,
}) => {
  return (
    <div
      className="copilot-tool-calls"
      role="list"
      aria-label="Tool executions"
    >
      {toolCalls.map((tc) => (
        <ToolCallItem key={tc.id} tc={tc} />
      ))}
    </div>
  );
};
