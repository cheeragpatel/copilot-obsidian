import { defineTool } from "@github/copilot-sdk";
import type { App, CachedMetadata, TFile } from "obsidian";

const DEFAULT_SEARCH_LIMIT = 20;
const SEARCH_SNIPPET_LENGTH = 200;

type SearchMatchType = "path" | "metadata" | "content";

type SearchCandidate = {
  file: TFile;
  matchType: Exclude<SearchMatchType, "content">;
  fallbackSnippet?: string;
};

function normalizeSearchLimit(limit?: number): number {
  if (typeof limit !== "number" || !Number.isFinite(limit) || limit < 1) {
    return DEFAULT_SEARCH_LIMIT;
  }

  return Math.floor(limit);
}

function flattenFrontmatterValue(value: unknown): string[] {
  if (value == null) {
    return [];
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return [String(value)];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => flattenFrontmatterValue(item));
  }

  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, nestedValue]) => [
      key,
      ...flattenFrontmatterValue(nestedValue),
    ]);
  }

  return [];
}

function findFrontmatterMatch(frontmatter: CachedMetadata["frontmatter"] | undefined, queryLower: string): string | null {
  if (!frontmatter) {
    return null;
  }

  for (const [key, value] of Object.entries(frontmatter)) {
    const flattenedValue = flattenFrontmatterValue(value);
    const searchableParts = [key, ...flattenedValue];

    if (searchableParts.some((part) => part.toLowerCase().includes(queryLower))) {
      return flattenedValue.length > 0 ? `${key}: ${flattenedValue.join(", ")}` : key;
    }
  }

  return null;
}

function findMetadataMatch(cache: CachedMetadata | null, queryLower: string): string | null {
  const headingMatch = cache?.headings?.find((heading) => heading.heading.toLowerCase().includes(queryLower));
  if (headingMatch) {
    return headingMatch.heading;
  }

  const tagMatch = cache?.tags?.find((tag) => tag.tag.toLowerCase().includes(queryLower));
  if (tagMatch) {
    return tagMatch.tag;
  }

  return findFrontmatterMatch(cache?.frontmatter, queryLower);
}

function buildContentSnippet(content: string, queryLower: string): string {
  const matchIndex = content.toLowerCase().indexOf(queryLower);
  const startIndex = matchIndex >= 0 ? matchIndex : 0;
  return content.slice(startIndex, startIndex + SEARCH_SNIPPET_LENGTH);
}

async function readSearchSnippet(app: App, file: TFile, queryLower: string, fallbackSnippet = ""): Promise<string> {
  try {
    const content = await app.vault.cachedRead(file);
    return buildContentSnippet(content, queryLower);
  } catch {
    return fallbackSnippet.slice(0, SEARCH_SNIPPET_LENGTH);
  }
}

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
    description: "Search for notes in the Obsidian vault using path, metadata cache, and content matches ranked by relevance.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query text to find in note paths, metadata, and contents" },
        limit: { type: "number", description: "Maximum number of results to return (default: 20)" },
      },
      required: ["query"],
    },
    handler: async (args: { query: string; limit?: number }) => {
      const query = args.query.trim();
      if (!query) {
        return { query, resultCount: 0, results: [] };
      }

      const limit = normalizeSearchLimit(args.limit);
      const queryLower = query.toLowerCase();
      const files = app.vault.getMarkdownFiles();
      const matchedPaths = new Set<string>();
      const fastMatches: SearchCandidate[] = [];
      const results: { path: string; snippet: string; matchType: SearchMatchType }[] = [];

      for (const file of files) {
        if (fastMatches.length >= limit) {
          break;
        }

        if (file.path.toLowerCase().includes(queryLower)) {
          fastMatches.push({ file, matchType: "path" });
          matchedPaths.add(file.path);
        }
      }

      if (fastMatches.length < limit) {
        for (const file of files) {
          if (fastMatches.length >= limit) {
            break;
          }

          if (matchedPaths.has(file.path)) {
            continue;
          }

          const metadataSnippet = findMetadataMatch(app.metadataCache.getFileCache(file), queryLower);
          if (!metadataSnippet) {
            continue;
          }

          fastMatches.push({ file, matchType: "metadata", fallbackSnippet: metadataSnippet });
          matchedPaths.add(file.path);
        }
      }

      for (const match of fastMatches) {
        if (results.length >= limit) {
          break;
        }

        const snippet = await readSearchSnippet(app, match.file, queryLower, match.fallbackSnippet);
        results.push({
          path: match.file.path,
          snippet,
          matchType: match.matchType,
        });
      }

      if (results.length < limit) {
        for (const file of files) {
          if (results.length >= limit) {
            break;
          }

          if (matchedPaths.has(file.path)) {
            continue;
          }

          try {
            const content = await app.vault.cachedRead(file);
            if (!content.toLowerCase().includes(queryLower)) {
              continue;
            }

            matchedPaths.add(file.path);
            results.push({
              path: file.path,
              snippet: buildContentSnippet(content, queryLower),
              matchType: "content",
            });
          } catch {
            // Skip files that can't be read
          }
        }
      }

      return { query, resultCount: results.length, results };
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
