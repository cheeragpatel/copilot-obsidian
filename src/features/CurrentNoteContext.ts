import type { App, TFile } from "obsidian";

const DEFAULT_SNIPPET_CAP = 2000;

export interface CurrentNoteContext {
  note: TFile;
  contentSnippet: string;
  truncated: boolean;
}

export async function buildCurrentNoteContext(
  app: App,
  cap: number = DEFAULT_SNIPPET_CAP,
): Promise<CurrentNoteContext | undefined> {
  const file = app.workspace.getActiveFile?.();
  if (!file || (file as TFile).extension !== "md") return undefined;

  const content = await app.vault.cachedRead(file as TFile);
  const truncated = content.length > cap;
  const snippet = truncated ? content.slice(0, cap) + "\n…(truncated)" : content;

  return {
    note: file as TFile,
    contentSnippet: snippet,
    truncated,
  };
}

export function wrapPromptWithCurrentNote(
  prompt: string,
  ctx: CurrentNoteContext,
): string {
  return (
    `<context source="current-note" path="${ctx.note.path}">\n` +
    `${ctx.contentSnippet}\n` +
    `</context>\n\n` +
    prompt
  );
}
