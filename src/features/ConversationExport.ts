import type { App, TFile } from "obsidian";
import type { StoredConversation } from "../services/ConversationStore";
import type { ChatMessage } from "../types/chat";

export interface ExportOptions {
  folder?: string;
  metadata?: boolean;
}

const DEFAULT_FOLDER = "Copilot Chats";

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function formatTimestamp(date: Date): string {
  return (
    `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}` +
    ` ${pad2(date.getHours())}${pad2(date.getMinutes())}`
  );
}

function escapeYaml(value: string): string {
  return value.replace(/"/g, '\\"');
}

function collectToolNames(messages: ChatMessage[]): string[] {
  const names = new Set<string>();
  for (const m of messages) {
    for (const tc of m.toolCalls ?? []) {
      if (tc?.name) names.add(tc.name);
    }
  }
  return [...names].sort();
}

function renderToolCalls(message: ChatMessage): string {
  const calls = message.toolCalls ?? [];
  if (calls.length === 0) return "";
  const lines: string[] = [];
  for (const call of calls) {
    lines.push(`> [!tool]- ${call.name} (${call.status})`);
    if (call.result) {
      for (const line of String(call.result).split("\n")) {
        lines.push(`> ${line}`);
      }
    }
  }
  return lines.join("\n");
}

function renderAttachments(message: ChatMessage): string {
  const atts = message.attachments ?? [];
  if (atts.length === 0) return "";
  return atts.map((a) => `- [[${a.path}|${a.name}]]`).join("\n");
}

export function buildExportMarkdown(
  conversation: StoredConversation,
  opts: { metadata?: boolean } = {},
): string {
  const includeMetadata = opts.metadata !== false;
  const date = new Date(conversation.lastUpdated || Date.now());
  const tools = collectToolNames(conversation.messages);

  const lines: string[] = [];
  if (includeMetadata) {
    lines.push("---");
    lines.push("copilot-export: true");
    lines.push(`title: "${escapeYaml(conversation.title || "Copilot Chat")}"`);
    lines.push(`session_id: "${escapeYaml(conversation.sessionId)}"`);
    lines.push(`model: "${escapeYaml(conversation.model || "")}"`);
    lines.push(`mode: "${escapeYaml(conversation.mode || "")}"`);
    lines.push(`date: "${date.toISOString()}"`);
    lines.push(`message_count: ${conversation.messages.length}`);
    lines.push(`tools_used: [${tools.map((t) => `"${escapeYaml(t)}"`).join(", ")}]`);
    lines.push("---");
    lines.push("");
  }

  lines.push(`# ${conversation.title || "Copilot Chat"}`);
  lines.push("");

  for (const message of conversation.messages) {
    if (message.role === "system") {
      lines.push(`> [!note] System`);
      for (const line of (message.content || "").split("\n")) {
        lines.push(`> ${line}`);
      }
      lines.push("");
      continue;
    }

    const heading = message.role === "user" ? "## You" : "## Copilot";
    lines.push(heading);
    if (message.agentName) {
      lines.push(`*Agent: @${message.agentName}*`);
    }
    lines.push("");
    lines.push(message.content || "");
    lines.push("");

    const attachments = renderAttachments(message);
    if (attachments) {
      lines.push("**Attachments:**");
      lines.push(attachments);
      lines.push("");
    }

    const tools2 = renderToolCalls(message);
    if (tools2) {
      lines.push(tools2);
      lines.push("");
    }
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

async function ensureFolder(app: App, folder: string): Promise<void> {
  const existing = app.vault.getAbstractFileByPath(folder);
  if (existing) return;
  try {
    await app.vault.createFolder(folder);
  } catch {
    // Folder may have been created concurrently; ignore.
  }
}

function sanitizeFilenameSegment(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, "-");
}

async function uniqueFilePath(app: App, base: string): Promise<string> {
  if (!app.vault.getAbstractFileByPath(base)) return base;
  const dot = base.lastIndexOf(".");
  const stem = dot >= 0 ? base.slice(0, dot) : base;
  const ext = dot >= 0 ? base.slice(dot) : "";
  for (let i = 2; i < 1000; i++) {
    const candidate = `${stem} (${i})${ext}`;
    if (!app.vault.getAbstractFileByPath(candidate)) return candidate;
  }
  return `${stem} (${Date.now()})${ext}`;
}

export async function exportConversationToNote(
  app: App,
  conversation: StoredConversation,
  opts: ExportOptions = {},
): Promise<TFile> {
  const folder = sanitizeFilenameSegment(opts.folder?.trim() || DEFAULT_FOLDER);
  await ensureFolder(app, folder);

  const stamp = formatTimestamp(new Date());
  const baseName = `Copilot Chat - ${stamp}.md`;
  const path = await uniqueFilePath(app, `${folder}/${baseName}`);

  const markdown = buildExportMarkdown(conversation, { metadata: opts.metadata });
  const file = (await app.vault.create(path, markdown)) as TFile;

  try {
    await app.workspace.openLinkText?.(path, "", false);
  } catch {
    // Ignore — the note is created either way.
  }

  return file;
}
