import type { Editor, Plugin } from "obsidian";
import { Notice } from "obsidian";
import { COPILOT_EVENT_SEND_PROMPT } from "../types/constants";

export type InlineCommandKind =
  | "rewrite"
  | "summarize"
  | "expand"
  | "explain"
  | "fix-grammar";

interface InlineCommandSpec {
  id: string;
  name: string;
  kind: InlineCommandKind;
}

export const INLINE_EDITOR_COMMANDS: InlineCommandSpec[] = [
  { id: "copilot-chat:rewrite-selection", name: "Copilot: Rewrite selection", kind: "rewrite" },
  { id: "copilot-chat:summarize-selection", name: "Copilot: Summarize selection", kind: "summarize" },
  { id: "copilot-chat:expand-selection", name: "Copilot: Expand selection", kind: "expand" },
  { id: "copilot-chat:explain-selection", name: "Copilot: Explain selection", kind: "explain" },
  { id: "copilot-chat:fix-grammar", name: "Copilot: Fix grammar in selection", kind: "fix-grammar" },
];

export function buildInlineCommandPrompt(kind: InlineCommandKind, selection: string): string {
  const text = selection.trim();
  switch (kind) {
    case "rewrite":
      return `Rewrite the following text for clarity and flow while preserving the original meaning. Return only the rewritten text without commentary.\n\n${text}`;
    case "summarize":
      return `Summarize the following text concisely. Return only the summary.\n\n${text}`;
    case "expand":
      return `Expand the following text with additional detail and supporting context. Return only the expanded text.\n\n${text}`;
    case "explain":
      return `Explain the following text in plain language so a newcomer can understand it.\n\n${text}`;
    case "fix-grammar":
      return `Fix grammar, spelling, and punctuation in the following text. Preserve the original meaning. Return only the corrected text.\n\n${text}`;
  }
}

function dispatchPrompt(plugin: Plugin, prompt: string): void {
  // TODO(wave-3): replace this chat-routed flow with a one-shot session that
  // calls editor.replaceSelection(result) directly. That requires a new
  // CopilotService entrypoint, which is out of scope for this wave.
  (plugin.app.workspace as any).trigger(COPILOT_EVENT_SEND_PROMPT, { prompt });
}

export function registerInlineEditorCommands(plugin: Plugin): void {
  for (const spec of INLINE_EDITOR_COMMANDS) {
    plugin.addCommand({
      id: spec.id,
      name: spec.name,
      editorCallback: (editor: Editor) => {
        const selection = editor.getSelection();
        if (!selection.trim()) {
          new Notice("Select some text first");
          return;
        }
        const prompt = buildInlineCommandPrompt(spec.kind, selection);
        dispatchPrompt(plugin, prompt);
        new Notice("Sent to Copilot Chat — see panel for the response.");
      },
    });
  }

  plugin.registerEvent(
    plugin.app.workspace.on("editor-menu", (menu: any, editor: Editor) => {
      const selection = editor.getSelection();
      if (!selection.trim()) return;

      menu.addItem((item: any) => {
        item.setTitle("Copilot").setIcon("bot-message-square");
        const submenu = item.setSubmenu?.();
        const target = submenu ?? menu;
        for (const spec of INLINE_EDITOR_COMMANDS) {
          target.addItem((sub: any) => {
            sub
              .setTitle(spec.name.replace(/^Copilot:\s*/, ""))
              .onClick(() => {
                const prompt = buildInlineCommandPrompt(spec.kind, selection);
                dispatchPrompt(plugin, prompt);
                new Notice("Sent to Copilot Chat — see panel for the response.");
              });
          });
        }
      });
    }),
  );
}
