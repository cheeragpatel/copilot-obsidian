import { describe, it, expect, vi } from "vitest";
import {
  INLINE_EDITOR_COMMANDS,
  buildInlineCommandPrompt,
  registerInlineEditorCommands,
} from "./InlineEditorCommands";

describe("buildInlineCommandPrompt", () => {
  it("emits a rewrite-flavored prompt", () => {
    expect(buildInlineCommandPrompt("rewrite", "  hello  ")).toMatch(/Rewrite the following text/);
    expect(buildInlineCommandPrompt("rewrite", "hello")).toContain("hello");
  });

  it("emits dedicated prompts for each kind", () => {
    expect(buildInlineCommandPrompt("summarize", "x")).toMatch(/Summarize/);
    expect(buildInlineCommandPrompt("expand", "x")).toMatch(/Expand/);
    expect(buildInlineCommandPrompt("explain", "x")).toMatch(/Explain/);
    expect(buildInlineCommandPrompt("fix-grammar", "x")).toMatch(/grammar/i);
  });
});

describe("registerInlineEditorCommands", () => {
  function makePlugin() {
    const trigger = vi.fn();
    const on = vi.fn().mockReturnValue({});
    return {
      addCommand: vi.fn(),
      registerEvent: vi.fn(),
      app: {
        workspace: { trigger, on, offref: vi.fn() },
      },
    } as any;
  }

  it("registers one Obsidian command per inline kind plus the editor menu", () => {
    const plugin = makePlugin();
    registerInlineEditorCommands(plugin);
    expect(plugin.addCommand).toHaveBeenCalledTimes(INLINE_EDITOR_COMMANDS.length);
    expect(plugin.app.workspace.on).toHaveBeenCalledWith("editor-menu", expect.any(Function));
    expect(plugin.registerEvent).toHaveBeenCalledTimes(1);
  });

  it("invokes the editorCallback only when there is a non-empty selection", () => {
    const plugin = makePlugin();
    registerInlineEditorCommands(plugin);
    const cmd = plugin.addCommand.mock.calls[0][0];

    cmd.editorCallback({ getSelection: () => "" });
    expect(plugin.app.workspace.trigger).not.toHaveBeenCalled();

    cmd.editorCallback({ getSelection: () => "make this nicer" });
    expect(plugin.app.workspace.trigger).toHaveBeenCalledWith(
      "copilot-chat:send-prompt",
      expect.objectContaining({ prompt: expect.stringContaining("make this nicer") }),
    );
  });
});
