import * as React from "react";
import type { FileAttachment } from "../types/chat";

interface AttachmentChipsProps {
  items: FileAttachment[];
  onRemove: (path: string) => void;
}

/** Pure presentational chips list for currently-attached vault files. */
export const AttachmentChips: React.FC<AttachmentChipsProps> = ({ items, onRemove }) => {
  if (items.length === 0) return null;

  return (
    <div className="copilot-attachment-chips">
      {items.map((attachment) => (
        <div key={attachment.path} className="copilot-attachment-chip">
          <span>{attachment.name}</span>
          <button
            type="button"
            className="copilot-attachment-chip-remove"
            onClick={() => onRemove(attachment.path)}
            aria-label={`Remove ${attachment.name}`}
            title={`Remove ${attachment.name}`}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
};
