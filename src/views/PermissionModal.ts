import { App, Modal } from "obsidian";

export interface PermissionPromptOptions {
  kind: string;
  details: Record<string, unknown>;
}

/**
 * Modal dialog that prompts the user to approve or deny a permission request
 * from the Copilot agent (e.g. shell commands, file writes, MCP calls).
 */
export class PermissionModal extends Modal {
  private resolve: (approved: boolean) => void;
  private kind: string;
  private details: Record<string, unknown>;

  constructor(
    app: App,
    options: PermissionPromptOptions,
    resolve: (approved: boolean) => void,
  ) {
    super(app);
    this.kind = options.kind;
    this.details = options.details;
    this.resolve = resolve;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("copilot-permission-modal");

    contentEl.createEl("h3", { text: "Copilot Permission Request" });

    const kindLabel = this.formatKind(this.kind);
    contentEl.createEl("p", {
      text: `Copilot is requesting permission to: ${kindLabel}`,
      cls: "copilot-permission-description",
    });

    // Show relevant details
    const detailsEl = contentEl.createDiv({ cls: "copilot-permission-details" });
    const pre = detailsEl.createEl("pre");
    pre.createEl("code", {
      text: this.formatDetails(),
    });

    // Buttons
    const btnContainer = contentEl.createDiv({ cls: "copilot-permission-buttons" });

    const approveBtn = btnContainer.createEl("button", {
      text: "Allow",
      cls: "mod-cta",
    });
    approveBtn.addEventListener("click", () => {
      this.resolve(true);
      this.close();
    });

    const denyBtn = btnContainer.createEl("button", {
      text: "Deny",
    });
    denyBtn.addEventListener("click", () => {
      this.resolve(false);
      this.close();
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private formatKind(kind: string): string {
    switch (kind) {
      case "shell":
        return "run a shell command";
      case "write":
        return "write/modify a file";
      case "read":
        return "read a file";
      case "mcp":
        return "call an MCP server tool";
      case "url":
        return "access a URL";
      case "custom-tool":
        return "execute a custom tool";
      default:
        return kind;
    }
  }

  private formatDetails(): string {
    const { kind, ...rest } = this.details as any;
    const entries = Object.entries(rest).filter(
      ([k]) => k !== "toolCallId",
    );
    if (entries.length === 0) return this.kind;
    return entries
      .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
      .join("\n");
  }
}

/**
 * Show a permission prompt modal and return a promise that resolves
 * to the SDK-compatible permission result.
 */
export function promptPermission(
  app: App,
  request: { kind: string; [key: string]: unknown },
): Promise<{ kind: "approved" } | { kind: "denied-by-rules"; rules: unknown[] }> {
  return new Promise((resolve) => {
    const modal = new PermissionModal(
      app,
      { kind: request.kind, details: request },
      (approved) => {
        if (approved) {
          resolve({ kind: "approved" });
        } else {
          resolve({ kind: "denied-by-rules", rules: [{ description: "User denied" }] });
        }
      },
    );
    modal.open();
  });
}
