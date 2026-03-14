import * as React from "react";
import type { ToolCallInfo } from "../types/chat";

interface ToolExecutionIndicatorProps {
  toolCalls: ToolCallInfo[];
}

export const ToolExecutionIndicator: React.FC<ToolExecutionIndicatorProps> = ({
  toolCalls,
}) => {
  return (
    <div className="copilot-tool-calls">
      {toolCalls.map((tc) => (
        <div key={tc.id} className={`copilot-tool-call ${tc.status}`}>
          {tc.status === "running" && <div className="copilot-tool-spinner" />}
          {tc.status === "complete" && <span>✓</span>}
          {tc.status === "error" && <span>✗</span>}
          <span>{tc.name}</span>
        </div>
      ))}
    </div>
  );
};
