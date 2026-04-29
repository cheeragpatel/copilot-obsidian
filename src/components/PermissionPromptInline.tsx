import React from "react";
import { useChatStore } from "../store/chatStore";

/**
 * Inline permission prompt rendered at the bottom of the chat log.
 * Shows tool/permission details and 4 action buttons.
 */
export const PermissionPromptInline: React.FC = () => {
  const pendingPermission = useChatStore((s) => s.pendingPermissions[0] ?? null);
  const resolvePermission = useChatStore((s) => s.resolvePermission);

  if (!pendingPermission) return null;

  const { kind, details } = pendingPermission;
  const toolName = (details.toolName as string) || (details.tool_name as string) || kind;
  const description =
    (details.description as string) ||
    (details.message as string) ||
    `Allow ${toolName}?`;

  return (
    <div className="copilot-permission-prompt">
      <div className="copilot-permission-header">
        <span className="copilot-permission-icon">🔐</span>
        <span className="copilot-permission-title">Permission Request</span>
      </div>
      <div className="copilot-permission-details">
        <strong>{toolName}</strong>
        <span>{description}</span>
      </div>
      <div className="copilot-permission-actions">
        <button
          className="copilot-permission-btn copilot-permission-btn--allow"
          onClick={() => resolvePermission(true, "once")}
        >
          Allow Once
        </button>
        <button
          className="copilot-permission-btn copilot-permission-btn--session"
          onClick={() => resolvePermission(true, "session")}
        >
          This Session
        </button>
        <button
          className="copilot-permission-btn copilot-permission-btn--always"
          onClick={() => resolvePermission(true, "permanent")}
        >
          Always Allow
        </button>
        <button
          className="copilot-permission-btn copilot-permission-btn--deny"
          onClick={() => resolvePermission(false, "once")}
        >
          Deny
        </button>
      </div>
    </div>
  );
};
