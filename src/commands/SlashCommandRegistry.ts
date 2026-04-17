import type { App, TFile } from "obsidian";

export interface SlashCommand {
  name: string;
  description: string;
  icon: string;
  /** Build the prompt to send to Copilot. Returns null if command can't run (e.g., no active note). */
  buildPrompt: (app: App, userArgs: string) => Promise<string | null>;
  /** Whether this command requires an active note */
  requiresActiveNote: boolean;
}

/** Get the content of the currently active note, or null */
async function getActiveNoteContent(
  app: App,
): Promise<{ title: string; content: string; path: string } | null> {
  const file = app.workspace.getActiveFile();
  if (!file) return null;
  const content = await app.vault.cachedRead(file);
  return { title: file.basename, content, path: file.path };
}

/** Get a list of recent/open notes for context */
function getOpenNotes(app: App): string[] {
  const leaves = app.workspace.getLeavesOfType("markdown");
  return leaves
    .map((leaf: any) => leaf.view?.file?.path)
    .filter(Boolean)
    .slice(0, 10);
}

/** Get vault stats */
function getVaultStats(app: App): { totalNotes: number; folders: number } {
  const files = app.vault.getMarkdownFiles();
  const folders = app.vault.getAllLoadedFiles().filter((f: any) => !("extension" in f));
  return { totalNotes: files.length, folders: folders.length };
}

export const BUILT_IN_COMMANDS: SlashCommand[] = [
  {
    name: "explain",
    description: "Explain the active note",
    icon: "💡",
    requiresActiveNote: true,
    buildPrompt: async (app) => {
      const note = await getActiveNoteContent(app);
      if (!note) return null;
      return `Explain this note in detail:\n\n# ${note.title}\n\n${note.content}`;
    },
  },
  {
    name: "summarize",
    description: "Summarize the active note",
    icon: "📝",
    requiresActiveNote: true,
    buildPrompt: async (app) => {
      const note = await getActiveNoteContent(app);
      if (!note) return null;
      return `Provide a concise summary of this note:\n\n# ${note.title}\n\n${note.content}`;
    },
  },
  {
    name: "fix",
    description: "Fix grammar and spelling in the active note",
    icon: "🔧",
    requiresActiveNote: true,
    buildPrompt: async (app) => {
      const note = await getActiveNoteContent(app);
      if (!note) return null;
      return `Review and fix any grammar, spelling, or clarity issues in this note. Return the corrected version:\n\n# ${note.title}\n\n${note.content}`;
    },
  },
  {
    name: "outline",
    description: "Create an outline from the active note",
    icon: "📋",
    requiresActiveNote: true,
    buildPrompt: async (app) => {
      const note = await getActiveNoteContent(app);
      if (!note) return null;
      return `Create a structured outline from this note:\n\n# ${note.title}\n\n${note.content}`;
    },
  },
  {
    name: "tags",
    description: "Suggest tags for the active note",
    icon: "🏷️",
    requiresActiveNote: true,
    buildPrompt: async (app) => {
      const note = await getActiveNoteContent(app);
      if (!note) return null;
      return `Analyze this note and suggest relevant tags (as #hashtags) that would help organize it in my vault:\n\n# ${note.title}\n\n${note.content}`;
    },
  },
  {
    name: "links",
    description: "Find notes to link to from the active note",
    icon: "🔗",
    requiresActiveNote: true,
    buildPrompt: async (app) => {
      const note = await getActiveNoteContent(app);
      if (!note) return null;
      const allNotes = app.vault
        .getMarkdownFiles()
        .map((f: TFile) => f.basename)
        .slice(0, 100);
      return `Given this note and the list of other notes in my vault, suggest which notes should be linked together and why.\n\nCurrent note: ${note.title}\n\n${note.content}\n\nOther notes in vault:\n${allNotes.join("\n")}`;
    },
  },
  {
    name: "new",
    description: "Create a new note from a description",
    icon: "✨",
    requiresActiveNote: false,
    buildPrompt: async (_app, userArgs) => {
      if (!userArgs.trim()) return "Help me create a new note. What topic should it cover?";
      return `Create a well-structured Obsidian markdown note about: ${userArgs}. Include appropriate headings, bullet points, and suggestions for tags and links.`;
    },
  },
  {
    name: "vault",
    description: "Ask about your vault structure and content",
    icon: "🗄️",
    requiresActiveNote: false,
    buildPrompt: async (app, userArgs) => {
      const stats = getVaultStats(app);
      const openNotes = getOpenNotes(app);
      const recentFiles = app.vault
        .getMarkdownFiles()
        .sort((a: TFile, b: TFile) => (b.stat?.mtime || 0) - (a.stat?.mtime || 0))
        .slice(0, 20)
        .map((f: TFile) => f.path);

      const query = userArgs.trim() || "Give me an overview of my vault.";
      return `${query}\n\nVault context:\n- Total notes: ${stats.totalNotes}\n- Folders: ${stats.folders}\n- Currently open notes: ${openNotes.join(", ") || "none"}\n- Recently modified notes:\n${recentFiles.join("\n")}`;
    },
  },
  {
    name: "daily",
    description: "Help with your daily note",
    icon: "📅",
    requiresActiveNote: false,
    buildPrompt: async (app, userArgs) => {
      const today = new Date().toISOString().split("T")[0];
      const note = await getActiveNoteContent(app);
      const noteContext = note
        ? `\n\nCurrent note content:\n# ${note.title}\n\n${note.content}`
        : "";
      const query = userArgs.trim() || "Help me write my daily note for today.";
      return `${query}\n\nToday's date: ${today}${noteContext}`;
    },
  },
];

export class SlashCommandRegistry {
  private commands: Map<string, SlashCommand> = new Map();

  constructor() {
    for (const cmd of BUILT_IN_COMMANDS) {
      this.commands.set(cmd.name, cmd);
    }
  }

  get(name: string): SlashCommand | undefined {
    return this.commands.get(name);
  }

  getAll(): SlashCommand[] {
    return Array.from(this.commands.values());
  }

  /** Return commands matching a partial name (for autocomplete) */
  search(partial: string): SlashCommand[] {
    const lower = partial.toLowerCase();
    return this.getAll().filter(
      (cmd) =>
        cmd.name.toLowerCase().startsWith(lower) ||
        cmd.description.toLowerCase().includes(lower),
    );
  }

  register(command: SlashCommand): void {
    this.commands.set(command.name, command);
  }
}

// Module-level singleton so registered commands surface in autocomplete from
// any caller (the chat input, slash dispatcher, etc.) without plumbing.
let sharedRegistry: SlashCommandRegistry | null = null;

export function getSharedRegistry(): SlashCommandRegistry {
  if (!sharedRegistry) sharedRegistry = new SlashCommandRegistry();
  return sharedRegistry;
}

/** Return all known commands (built-ins + anything registered at runtime). */
export function getAllCommands(): SlashCommand[] {
  return getSharedRegistry().getAll();
}
