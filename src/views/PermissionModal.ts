import { App, Modal } from "obsidian";
import type { PluginSettings } from "../types/settings";
import type { PermissionRequestResult } from "../types/chat";

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
 * Build a stable key for a permission request so cached approvals match on
 * subsequent identical prompts.
 *
 * Earlier versions only inspected a handful of well-known fields
 * (command/path/url/tool/server/name). When the SDK started sending requests
 * with other identifying fields (filePath, arguments, args, toolName,
 * serverName, …) those requests collapsed onto the same key — so "Allow This
 * Session" either never matched or matched too aggressively.
 *
 * We now serialize *all* fields except request-instance noise (the per-call
 * id, timestamps, etc.) so identical requests always produce identical keys.
 */
const NOISE_FIELDS = new Set([
  "kind",
  "toolCallId",
  "toolcallid",
  "tool_call_id",
  "requestId",
  "requestid",
  "request_id",
  "id",
  "timestamp",
  "createdAt",
  "created_at",
]);

function permissionKey(request: { kind: string; [key: string]: unknown }): string {
  const entries = Object.keys(request)
    .filter((key) => !NOISE_FIELDS.has(key))
    .sort()
    .map((key) => {
      const value = request[key];
      const serialized =
        value === null || value === undefined
          ? ""
          : typeof value === "string"
            ? value
            : JSON.stringify(value);
      return `${key}=${serialized}`;
    });
  return [request.kind, ...entries].join("|");
}

/** Exported for tests — do not use directly in production code. */
export const __permissionKeyForTests = permissionKey;

/** Re-export permissionKey for store caching logic. */
export { permissionKey };

// In-memory caches — session cache resets when plugin reloads, permanent persists to localStorage
const sessionAllowed = new Set<string>();
let autopilotEnabled = false;
const PERMANENT_KEY = "copilot-permanent-permissions";

/**
 * Toggle autopilot mode for the host-side permission handler. When enabled,
 * every incoming permission request is auto-approved without prompting. The
 * SDK/CLI also has its own "autopilot" agent mode (set on the session) which
 * normally prevents `onPermissionRequest` from firing at all — this flag is
 * the host-side belt-and-suspenders for SDK/CLI versions that still call back.
 */
export function setAutopilot(enabled: boolean): void {
  autopilotEnabled = enabled;
}

export function isAutopilot(): boolean {
  return autopilotEnabled;
}

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
  private resolvePromise: ((result: ApprovalResult) => void) | null;
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
      this.resolve({ approved: true, scope: "once" });
      this.close();
    });

    const sessionBtn = approveRow.createEl("button", {
      text: "Allow This Session",
      cls: "copilot-permission-session-btn",
    });
    sessionBtn.title = "Auto-approve matching requests until Obsidian restarts";
    sessionBtn.addEventListener("click", () => {
      this.resolve({ approved: true, scope: "session" });
      this.close();
    });

    const permanentBtn = approveRow.createEl("button", {
      text: "Always Allow",
      cls: "copilot-permission-permanent-btn",
    });
    permanentBtn.title = "Remember this choice permanently";
    permanentBtn.addEventListener("click", () => {
      this.resolve({ approved: true, scope: "permanent" });
      this.close();
    });

    // Deny button in its own row for visual separation
    const denyRow = contentEl.createDiv({ cls: "copilot-permission-deny-row" });
    const denyBtn = denyRow.createEl("button", {
      text: "Deny",
      cls: "copilot-permission-deny-btn",
    });
    denyBtn.addEventListener("click", () => {
      this.resolve({ approved: false, scope: "once" });
      this.close();
    });
  }

  onClose(): void {
    // If user closed the modal without clicking a button, treat as deny
    this.resolve({ approved: false, scope: "once" });
    this.contentEl.empty();
  }

  private resolve(result: ApprovalResult): void {
    if (this.resolvePromise) {
      this.resolvePromise(result);
      this.resolvePromise = null;
    }
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
 * Auto-approves vault tools if defaultVaultToolPermissions is enabled.
 */
export function promptPermission(
  app: App,
  request: { kind: string; [key: string]: unknown },
  settings?: PluginSettings,
  inlineHandler?: (request: { kind: string; [key: string]: unknown }, resolve: (result: PermissionRequestResult) => void) => void,
): Promise<PermissionRequestResult> {
  // Autopilot bypass — auto-approve before any cache lookup or modal.
  if (autopilotEnabled) {
    return Promise.resolve({ kind: "approved" });
  }

  // Auto-approve vault tools if default permissions enabled
  if (
    settings?.defaultVaultToolPermissions &&
    request.kind === "custom-tool"
  ) {
    const toolName = request.tool || request.toolName || request.name;
    const vaultTools = [
      "read_note",
      "search_vault",
      "list_notes",
      "create_note",
      "edit_note",
      "get_active_note",
      "get_note_metadata",
    ];
    if (typeof toolName === "string" && vaultTools.includes(toolName)) {
      return Promise.resolve({ kind: "approved" });
    }
  }

  const key = permissionKey(request);

  // Check permanent allowances first
  if (loadPermanentPermissions().has(key)) {
    return Promise.resolve({ kind: "approved" });
  }

  // Check session allowances
  if (sessionAllowed.has(key)) {
    return Promise.resolve({ kind: "approved" });
  }

  // Use inline handler if provided (renders in chat UI)
  if (inlineHandler) {
    return new Promise((resolve) => {
      inlineHandler(request, resolve);
    });
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
          resolve({ kind: "denied-interactively-by-user", feedback: "User denied" });
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

/** Add a key to the session-level permission cache. */
export function addSessionPermission(key: string): void {
  sessionAllowed.add(key);
}

/** Add a key to both session and permanent permission caches. */
export function addPermanentPermission(key: string): void {
  sessionAllowed.add(key);
  savePermanentPermission(key);
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
