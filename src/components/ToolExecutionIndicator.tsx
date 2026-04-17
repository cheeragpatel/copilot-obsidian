import * as React from "react";
import type { ToolCallInfo } from "../types/chat";

interface ToolExecutionIndicatorProps {
  toolCalls: ToolCallInfo[];
}

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
        <div
          key={tc.id}
          className={`copilot-tool-call ${tc.status}`}
          role="listitem"
          aria-label={`${tc.name}: ${tc.status}`}
        >
          {tc.status === "running" && (
            <div className="copilot-tool-spinner" aria-hidden="true" />
          )}
          {tc.status === "complete" && <span aria-hidden="true">✓</span>}
          {tc.status === "error" && <span aria-hidden="true">✗</span>}
          <span>{tc.name}</span>
        </div>
      ))}
    </div>
  );
};
