import { describe, it, expect, vi, beforeEach } from "vitest";
import { SlashCommandRegistry, BUILT_IN_COMMANDS } from "./SlashCommandRegistry";
import { createMockApp } from "../__mocks__/obsidian";

function buildMockApp() {
  return (
    createMockApp?.() ?? {
      workspace: {
        getActiveFile: vi.fn().mockReturnValue(null),
        getLeavesOfType: vi.fn().mockReturnValue([]),
      },
      vault: {
        getMarkdownFiles: vi.fn().mockReturnValue([]),
        getAllLoadedFiles: vi.fn().mockReturnValue([]),
        cachedRead: vi.fn().mockResolvedValue(""),
      },
    }
  );
}

describe("SlashCommandRegistry", () => {
  let registry: SlashCommandRegistry;

  beforeEach(() => {
    registry = new SlashCommandRegistry();
  });

  it("registers all built-in commands", () => {
    expect(registry.getAll().length).toBe(BUILT_IN_COMMANDS.length);
  });

  it("gets a command by name", () => {
    const cmd = registry.get("explain");
    expect(cmd).toBeDefined();
    expect(cmd?.name).toBe("explain");
  });

  it("returns undefined for unknown commands", () => {
    expect(registry.get("nonexistent")).toBeUndefined();
  });

  it("searches commands by partial name", () => {
    const results = registry.search("sum");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name).toBe("summarize");
  });

  it("searches commands by description", () => {
    const results = registry.search("grammar");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name).toBe("fix");
  });

  it("registers custom commands", () => {
    registry.register({
      name: "custom",
      description: "A custom command",
      icon: "🎯",
      requiresActiveNote: false,
      buildPrompt: async () => "custom prompt",
    });
    expect(registry.get("custom")).toBeDefined();
  });
});

describe("Built-in command prompts", () => {
  it("/explain builds prompt with active note content", async () => {
    const app = buildMockApp();
    const mockFile = {
      basename: "Test Note",
      path: "Test Note.md",
      stat: { size: 100, mtime: Date.now(), ctime: Date.now() },
    };
    app.workspace.getActiveFile.mockReturnValue(mockFile);
    app.vault.cachedRead.mockResolvedValue("# Hello\nSome content");

    const cmd = BUILT_IN_COMMANDS.find((c) => c.name === "explain")!;
    const prompt = await cmd.buildPrompt(app, "");
    expect(prompt).toContain("Test Note");
    expect(prompt).toContain("Some content");
  });

  it("/explain returns null when no active note", async () => {
    const app = buildMockApp();
    app.workspace.getActiveFile.mockReturnValue(null);

    const cmd = BUILT_IN_COMMANDS.find((c) => c.name === "explain")!;
    const prompt = await cmd.buildPrompt(app, "");
    expect(prompt).toBeNull();
  });

  it("/new builds prompt with user args", async () => {
    const app = buildMockApp();
    const cmd = BUILT_IN_COMMANDS.find((c) => c.name === "new")!;
    const prompt = await cmd.buildPrompt(app, "quantum computing");
    expect(prompt).toContain("quantum computing");
  });

  it("/vault includes vault stats", async () => {
    const app = buildMockApp();
    app.vault.getMarkdownFiles.mockReturnValue([
      { path: "a.md", basename: "a", stat: { mtime: 1 } },
      { path: "b.md", basename: "b", stat: { mtime: 2 } },
    ]);
    app.vault.getAllLoadedFiles = vi.fn().mockReturnValue([
      { path: "a.md", extension: "md" },
      { path: "folder" },
    ]);
    app.workspace.getLeavesOfType = vi.fn().mockReturnValue([]);

    const cmd = BUILT_IN_COMMANDS.find((c) => c.name === "vault")!;
    const prompt = await cmd.buildPrompt(app, "");
    expect(prompt).toContain("Total notes: 2");
  });

  it("all commands have required fields", () => {
    for (const cmd of BUILT_IN_COMMANDS) {
      expect(cmd.name).toBeTruthy();
      expect(cmd.description).toBeTruthy();
      expect(cmd.icon).toBeTruthy();
      expect(typeof cmd.buildPrompt).toBe("function");
      expect(typeof cmd.requiresActiveNote).toBe("boolean");
    }
  });
});
