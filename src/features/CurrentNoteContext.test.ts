import { describe, it, expect, vi } from "vitest";

vi.unmock("obsidian");

import {
  buildCurrentNoteContext,
  wrapPromptWithCurrentNote,
} from "./CurrentNoteContext";
import { createMockApp, TFile } from "../__mocks__/obsidian";

describe("buildCurrentNoteContext", () => {
  it("returns undefined when there is no active file", async () => {
    const app = createMockApp();
    expect(await buildCurrentNoteContext(app)).toBeUndefined();
  });

  it("returns undefined when the active file is not markdown", async () => {
    const app = createMockApp();
    app.workspace.getActiveFile = vi.fn().mockReturnValue(new TFile("image.png"));
    expect(await buildCurrentNoteContext(app)).toBeUndefined();
  });

  it("returns the note + content snippet for an active markdown file", async () => {
    const app = createMockApp();
    const file = new TFile("notes/hello.md");
    app.workspace.getActiveFile = vi.fn().mockReturnValue(file);
    app.vault.cachedRead = vi.fn().mockResolvedValue("# Title\nbody text");

    const ctx = await buildCurrentNoteContext(app);
    expect(ctx?.note).toBe(file);
    expect(ctx?.contentSnippet).toBe("# Title\nbody text");
    expect(ctx?.truncated).toBe(false);
  });

  it("truncates content past the cap", async () => {
    const app = createMockApp();
    const file = new TFile("big.md");
    app.workspace.getActiveFile = vi.fn().mockReturnValue(file);
    app.vault.cachedRead = vi.fn().mockResolvedValue("x".repeat(5000));

    const ctx = await buildCurrentNoteContext(app, 100);
    expect(ctx?.truncated).toBe(true);
    expect(ctx?.contentSnippet.length).toBeLessThan(200);
    expect(ctx?.contentSnippet).toContain("…(truncated)");
  });
});

describe("wrapPromptWithCurrentNote", () => {
  it("wraps the prompt with a context block", () => {
    const file = new TFile("notes/x.md");
    const wrapped = wrapPromptWithCurrentNote("What is this?", {
      note: file,
      contentSnippet: "# Title\nbody",
      truncated: false,
    });
    expect(wrapped).toContain('<context source="current-note" path="notes/x.md">');
    expect(wrapped).toContain("# Title\nbody");
    expect(wrapped).toContain("</context>");
    expect(wrapped.endsWith("What is this?")).toBe(true);
  });
});
