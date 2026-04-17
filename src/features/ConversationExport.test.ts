import { describe, it, expect, vi } from "vitest";

vi.unmock("obsidian");

import {
  buildExportMarkdown,
  exportConversationToNote,
} from "./ConversationExport";
import { createMockApp, TFile } from "../__mocks__/obsidian";
import type { StoredConversation } from "../services/ConversationStore";

function makeConversation(overrides: Partial<StoredConversation> = {}): StoredConversation {
  return {
    sessionId: "sess-1",
    title: "Hello world",
    model: "gpt-4.1",
    mode: "ask",
    createdAt: 1700000000000,
    lastUpdated: 1700000000000,
    messages: [
      {
        id: "u1",
        role: "user",
        content: "Hi there",
        timestamp: 1,
        isStreaming: false,
        attachments: [{ path: "notes/a.md", name: "a.md", type: "text/markdown" }],
      },
      {
        id: "a1",
        role: "assistant",
        content: "Hello!",
        timestamp: 2,
        isStreaming: false,
        agentName: "writer",
        toolCalls: [{ id: "t1", name: "search", status: "complete", result: "ok" }],
      },
      {
        id: "s1",
        role: "system",
        content: "Switched to ask mode",
        timestamp: 3,
        isStreaming: false,
      },
    ],
    ...overrides,
  };
}

describe("buildExportMarkdown", () => {
  it("includes YAML frontmatter with metadata", () => {
    const md = buildExportMarkdown(makeConversation());
    expect(md.startsWith("---\n")).toBe(true);
    expect(md).toContain("copilot-export: true");
    expect(md).toContain('model: "gpt-4.1"');
    expect(md).toContain("message_count: 3");
    expect(md).toContain('tools_used: ["search"]');
  });

  it("renders user, assistant, and system blocks with the right markers", () => {
    const md = buildExportMarkdown(makeConversation());
    expect(md).toContain("## You");
    expect(md).toContain("Hi there");
    expect(md).toContain("## Copilot");
    expect(md).toContain("*Agent: @writer*");
    expect(md).toContain("> [!note] System");
    expect(md).toContain("> Switched to ask mode");
    expect(md).toContain("> [!tool]- search (complete)");
    expect(md).toContain("**Attachments:**");
    expect(md).toContain("[[notes/a.md|a.md]]");
  });

  it("skips frontmatter when metadata is false", () => {
    const md = buildExportMarkdown(makeConversation(), { metadata: false });
    expect(md.startsWith("---")).toBe(false);
    expect(md.startsWith("# ")).toBe(true);
  });
});

describe("exportConversationToNote", () => {
  it("creates the folder when missing and writes a markdown note", async () => {
    const created: { path: string; content: string }[] = [];
    const folders = new Set<string>();
    const files = new Map<string, TFile>();

    const app = createMockApp();
    app.vault.getAbstractFileByPath = vi.fn((path: string) => {
      if (folders.has(path)) return { path };
      return files.get(path) ?? null;
    });
    app.vault.createFolder = vi.fn(async (path: string) => {
      folders.add(path);
    });
    app.vault.create = vi.fn(async (path: string, content: string) => {
      const tf = new TFile(path);
      files.set(path, tf);
      created.push({ path, content });
      return tf;
    });

    const file = await exportConversationToNote(app, makeConversation(), {
      folder: "Copilot Chats",
    });

    expect(app.vault.createFolder).toHaveBeenCalledWith("Copilot Chats");
    expect(created).toHaveLength(1);
    expect(created[0].path.startsWith("Copilot Chats/Copilot Chat - ")).toBe(true);
    expect(created[0].path.endsWith(".md")).toBe(true);
    expect(created[0].content).toContain("## You");
    expect(file.path).toBe(created[0].path);
    expect(app.workspace.openLinkText).toHaveBeenCalledWith(file.path, "", false);
  });

  it("does not re-create the folder when it already exists", async () => {
    const app = createMockApp();
    app.vault.getAbstractFileByPath = vi.fn((path: string) =>
      path === "Copilot Chats" ? { path } : null,
    );
    app.vault.create = vi.fn(async (path: string) => new TFile(path));

    await exportConversationToNote(app, makeConversation(), { folder: "Copilot Chats" });

    expect(app.vault.createFolder).not.toHaveBeenCalled();
  });
});
