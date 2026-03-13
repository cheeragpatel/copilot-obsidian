import { App, Modal } from "obsidian";

export interface PermissionPromptOptions {
  kind: string;
  details: Record<string, unknown>;
}

export type ApprovalScope = "once" | "session" | "permanent";

interface ApprovalResult {
  approved: boolean;
  scope: ApprovalScope;
}

/**
 * Build a key to identify a permission request for caching purposes.
 * Combines the kind with relevant detail fields (command, path, url, tool, server).
 */
function permissionKey(request: { kind: string; [key: string]: unknown }): string {
  const parts = [request.kind];
  for (const field of ["command", "path", "url", "tool", "server", "name"]) {
    if (typeof request[field] === "string") {
      parts.push(`${field}=${request[field]}`);
    }
  }
  return parts.join("|");
}

// In-memory caches — session cache resets when plugin reloads, permanent persists to localStorage
const sessionAllowed = new Set<string>();
const PERMANENT_KEY = "copilot-permanent-permissions";

function loadPermanentPermissions(): Set<string> {
  try {
    const stored = window.localStorage.getItem(PERMANENT_KEY);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch {
    return new Set();
  }
}

function savePermanentPermission(key: string): void {
  const perms = loadPermanentPermissions();
  perms.add(key);
  try {
    window.localStorage.setItem(PERMANENT_KEY, JSON.stringify([...perms]));
  } catch {
    // localStorage unavailable — degrade silently
  }
}

/**
 * Modal dialog that prompts the user to approve or deny a permission request
 * from the Copilot agent (e.g. shell commands, file writes, MCP calls).
 *
 * Offers three approval scopes:
 *   - Allow Once — this single request only
 *   - Allow This Session — auto-approve matching requests until plugin reload
 *   - Always Allow — persist approval across sessions (localStorage)
 */
export class PermissionModal extends Modal {
  private resolvePromise: (result: ApprovalResult) => void;
  private kind: string;
  private details: Record<string, unknown>;

  constructor(
    app: App,
    options: PermissionPromptOptions,
    resolve: (result: ApprovalResult) => void,
  ) {
    super(app);
    this.kind = options.kind;
    this.details = options.details;
    this.resolvePromise = resolve;
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

    // Approval buttons
    const approveRow = contentEl.createDiv({ cls: "copilot-permission-approve-row" });

    const onceBtn = approveRow.createEl("button", {
      text: "Allow Once",
      cls: "mod-cta",
    });
    onceBtn.title = "Allow this single request";
    onceBtn.addEventListener("click", () => {
      this.resolvePromise({ approved: true, scope: "once" });
      this.close();
    });

    const sessionBtn = approveRow.createEl("button", {
      text: "Allow This Session",
      cls: "copilot-permission-session-btn",
    });
    sessionBtn.title = "Auto-approve matching requests until Obsidian restarts";
    sessionBtn.addEventListener("click", () => {
      this.resolvePromise({ approved: true, scope: "session" });
      this.close();
    });

    const permanentBtn = approveRow.createEl("button", {
      text: "Always Allow",
      cls: "copilot-permission-permanent-btn",
    });
    permanentBtn.title = "Remember this choice permanently";
    permanentBtn.addEventListener("click", () => {
      this.resolvePromise({ approved: true, scope: "permanent" });
      this.close();
    });

    // Deny button in its own row for visual separation
    const denyRow = contentEl.createDiv({ cls: "copilot-permission-deny-row" });
    const denyBtn = denyRow.createEl("button", {
      text: "Deny",
      cls: "copilot-permission-deny-btn",
    });
    denyBtn.addEventListener("click", () => {
      this.resolvePromise({ approved: false, scope: "once" });
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
 *
 * Checks cached approvals first (session + permanent) before prompting.
 */
export function promptPermission(
  app: App,
  request: { kind: string; [key: string]: unknown },
): Promise<{ kind: "approved" } | { kind: "denied-by-rules"; rules: unknown[] }> {
  const key = permissionKey(request);

  // Check permanent allowances first
  if (loadPermanentPermissions().has(key)) {
    return Promise.resolve({ kind: "approved" });
  }

  // Check session allowances
  if (sessionAllowed.has(key)) {
    return Promise.resolve({ kind: "approved" });
  }

  return new Promise((resolve) => {
    const modal = new PermissionModal(
      app,
      { kind: request.kind, details: request },
      (result: ApprovalResult) => {
        if (result.approved) {
          if (result.scope === "session") {
            sessionAllowed.add(key);
          } else if (result.scope === "permanent") {
            sessionAllowed.add(key);
            savePermanentPermission(key);
          }
          resolve({ kind: "approved" });
        } else {
          resolve({ kind: "denied-by-rules", rules: [{ description: "User denied" }] });
        }
      },
    );
    modal.open();
  });
}

/** Clear session-level permission cache (e.g. on plugin unload). */
export function clearSessionPermissions(): void {
  sessionAllowed.clear();
}

/** Clear all permanent permissions. */
export function clearPermanentPermissions(): void {
  sessionAllowed.clear();
  try {
    window.localStorage.removeItem(PERMANENT_KEY);
  } catch {
    // Ignore
  }
}
