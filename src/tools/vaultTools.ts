import { defineTool } from "@github/copilot-sdk";
import type { App, TFile, TFolder } from "obsidian";

export function createVaultTools(app: App) {
  const readNote = defineTool("read_note", {
    description: "Read the full content of a note in the Obsidian vault by its file path (e.g., 'folder/note.md')",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the note file relative to vault root (e.g., 'Daily Notes/2024-01-15.md')" },
      },
      required: ["path"],
    },
    handler: async (args: { path: string }) => {
      const file = app.vault.getAbstractFileByPath(args.path);
      if (!file || !(file instanceof (app.vault as any).constructor)) {
        // Use metadataCache to check if file exists
        const tfile = app.vault.getFileByPath(args.path);
        if (!tfile) {
          return { error: `Note not found: ${args.path}` };
        }
        const content = await app.vault.cachedRead(tfile);
        return { path: args.path, content };
      }
      const content = await app.vault.cachedRead(file as TFile);
      return { path: args.path, content };
    },
  });

  const searchVault = defineTool("search_vault", {
    description: "Search for notes in the Obsidian vault by text query. Returns matching file paths and snippets.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query text to find in note contents" },
        limit: { type: "number", description: "Maximum number of results to return (default: 10)" },
      },
      required: ["query"],
    },
    handler: async (args: { query: string; limit?: number }) => {
      const limit = args.limit || 10;
      const results: { path: string; snippet: string }[] = [];
      const files = app.vault.getMarkdownFiles();

      for (const file of files) {
        if (results.length >= limit) break;
        try {
          const content = await app.vault.cachedRead(file);
          const lowerContent = content.toLowerCase();
          const lowerQuery = args.query.toLowerCase();
          const index = lowerContent.indexOf(lowerQuery);
          if (index !== -1) {
            const start = Math.max(0, index - 50);
            const end = Math.min(content.length, index + args.query.length + 50);
            const snippet = (start > 0 ? "..." : "") + content.slice(start, end) + (end < content.length ? "..." : "");
            results.push({ path: file.path, snippet });
          }
        } catch {
          // Skip files that can't be read
        }
      }

      return { query: args.query, resultCount: results.length, results };
    },
  });

  const listNotes = defineTool("list_notes", {
    description: "List notes (markdown files) in a specific folder of the Obsidian vault. Use '/' or '' for the root folder.",
    parameters: {
      type: "object",
      properties: {
        folder: { type: "string", description: "Folder path relative to vault root (e.g., 'Daily Notes'). Use '' for root." },
        recursive: { type: "boolean", description: "If true, include files in subfolders (default: false)" },
      },
      required: [],
    },
    handler: async (args: { folder?: string; recursive?: boolean }) => {
      const folderPath = args.folder || "";
      const recursive = args.recursive || false;
      const files = app.vault.getMarkdownFiles();

      const filtered = files.filter((f) => {
        if (recursive) {
          return folderPath === "" || f.path.startsWith(folderPath + "/");
        }
        const fileFolder = f.path.substring(0, f.path.lastIndexOf("/")) || "";
        return fileFolder === folderPath;
      });

      return {
        folder: folderPath || "/",
        count: filtered.length,
        files: filtered.map((f) => ({
          path: f.path,
          name: f.basename,
          size: f.stat.size,
          modified: f.stat.mtime,
        })),
      };
    },
  });

  const createNote = defineTool("create_note", {
    description: "Create a new note in the Obsidian vault with the given content",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path for the new note relative to vault root (e.g., 'Notes/my-note.md')" },
        content: { type: "string", description: "Markdown content for the new note" },
      },
      required: ["path", "content"],
    },
    handler: async (args: { path: string; content: string }) => {
      const existing = app.vault.getAbstractFileByPath(args.path);
      if (existing) {
        return { error: `File already exists: ${args.path}` };
      }

      // Ensure parent folder exists
      const folderPath = args.path.substring(0, args.path.lastIndexOf("/"));
      if (folderPath) {
        const folder = app.vault.getAbstractFileByPath(folderPath);
        if (!folder) {
          await app.vault.createFolder(folderPath);
        }
      }

      await app.vault.create(args.path, args.content);
      return { created: true, path: args.path };
    },
  });

  const editNote = defineTool("edit_note", {
    description: "Edit an existing note in the Obsidian vault. Can append, prepend, or replace content.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the note to edit" },
        operation: {
          type: "string",
          enum: ["append", "prepend", "replace"],
          description: "How to modify the note: append to end, prepend to beginning, or replace entire content",
        },
        content: { type: "string", description: "Content to add or replace with" },
      },
      required: ["path", "operation", "content"],
    },
    handler: async (args: { path: string; operation: string; content: string }) => {
      const file = app.vault.getFileByPath(args.path);
      if (!file) {
        return { error: `Note not found: ${args.path}` };
      }

      const existing = await app.vault.read(file);

      let newContent: string;
      switch (args.operation) {
        case "append":
          newContent = existing + "\n" + args.content;
          break;
        case "prepend":
          newContent = args.content + "\n" + existing;
          break;
        case "replace":
          newContent = args.content;
          break;
        default:
          return { error: `Unknown operation: ${args.operation}` };
      }

      await app.vault.modify(file, newContent);
      return { edited: true, path: args.path, operation: args.operation };
    },
  });

  const getActiveNote = defineTool("get_active_note", {
    description: "Get the content of the currently active/open note in Obsidian",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
    handler: async () => {
      const activeFile = app.workspace.getActiveFile();
      if (!activeFile) {
        return { error: "No note is currently open" };
      }

      const content = await app.vault.cachedRead(activeFile);
      return {
        path: activeFile.path,
        name: activeFile.basename,
        content,
      };
    },
  });

  const getNoteMetadata = defineTool("get_note_metadata", {
    description: "Get the frontmatter/properties and metadata of a note in the Obsidian vault",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the note file" },
      },
      required: ["path"],
    },
    handler: async (args: { path: string }) => {
      const file = app.vault.getFileByPath(args.path);
      if (!file) {
        return { error: `Note not found: ${args.path}` };
      }

      const metadata = app.metadataCache.getFileCache(file);
      return {
        path: args.path,
        frontmatter: metadata?.frontmatter || {},
        tags: metadata?.tags?.map((t) => t.tag) || [],
        headings: metadata?.headings?.map((h) => ({ level: h.level, text: h.heading })) || [],
        links: metadata?.links?.map((l) => l.link) || [],
        size: file.stat.size,
        created: file.stat.ctime,
        modified: file.stat.mtime,
      };
    },
  });

  return [readNote, searchVault, listNotes, createNote, editNote, getActiveNote, getNoteMetadata];
}
