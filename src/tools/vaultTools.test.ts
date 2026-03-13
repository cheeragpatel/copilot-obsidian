vi.mock("obsidian");
vi.mock("@github/copilot-sdk", () => ({
  defineTool: (name: string, config: any) => ({ name, ...config }),
}));

const { createMockApp, TFile } = await vi.importActual<typeof import("../__mocks__/obsidian")>(
  "../__mocks__/obsidian",
);

import { createVaultTools } from "./vaultTools";

describe("createVaultTools", () => {
  let mockApp: any;
  let tools: any[];

  const getTool = (name: string) => {
    const tool = tools.find((t: any) => t.name === name);
    expect(tool).toBeDefined();
    return tool;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockApp = createMockApp();
    tools = createVaultTools(mockApp);
  });

  describe("read_note", () => {
    it("returns content when file exists", async () => {
      const file = new TFile("test.md");
      mockApp.vault.getFileByPath.mockReturnValue(file);
      mockApp.vault.cachedRead.mockResolvedValue("# Test note\nHello world");

      const readNote = getTool("read_note");
      const result = await readNote.handler({ path: "test.md" });

      expect(mockApp.vault.getFileByPath).toHaveBeenCalledWith("test.md");
      expect(mockApp.vault.cachedRead).toHaveBeenCalledWith(file);
      expect(result).toEqual({ path: "test.md", content: "# Test note\nHello world" });
    });

    it("returns error when file not found", async () => {
      const readNote = getTool("read_note");
      const result = await readNote.handler({ path: "missing.md" });

      expect(result).toEqual({ error: "Note not found: missing.md" });
      expect(mockApp.vault.cachedRead).not.toHaveBeenCalled();
    });
  });

  describe("search_vault", () => {
    it("returns matching files with snippets", async () => {
      const alpha = new TFile("alpha.md");
      const beta = new TFile("beta.md");
      const contents: Record<string, string> = {
        "alpha.md": "This note mentions Obsidian vault tools in the middle of the file.",
        "beta.md": "Nothing to see here.",
      };

      mockApp.vault.getMarkdownFiles.mockReturnValue([alpha, beta]);
      mockApp.vault.cachedRead.mockImplementation(async (file: TFile) => contents[file.path]);

      const searchVault = getTool("search_vault");
      const result = await searchVault.handler({ query: "vault tools" });

      expect(result.query).toBe("vault tools");
      expect(result.resultCount).toBe(1);
      expect(result.results).toEqual([
        {
          path: "alpha.md",
          snippet: expect.stringContaining("vault tools"),
        },
      ]);
    });

    it("returns empty results for no matches", async () => {
      const file = new TFile("note.md");
      mockApp.vault.getMarkdownFiles.mockReturnValue([file]);
      mockApp.vault.cachedRead.mockResolvedValue("Completely unrelated content");

      const searchVault = getTool("search_vault");
      const result = await searchVault.handler({ query: "missing" });

      expect(result).toEqual({ query: "missing", resultCount: 0, results: [] });
    });

    it("respects the limit parameter", async () => {
      const first = new TFile("first.md");
      const second = new TFile("second.md");
      const third = new TFile("third.md");
      const contents: Record<string, string> = {
        "first.md": "query appears in the first note",
        "second.md": "another query appears in the second note",
        "third.md": "yet another query appears in the third note",
      };

      mockApp.vault.getMarkdownFiles.mockReturnValue([first, second, third]);
      mockApp.vault.cachedRead.mockImplementation(async (file: TFile) => contents[file.path]);

      const searchVault = getTool("search_vault");
      const result = await searchVault.handler({ query: "query", limit: 2 });

      expect(result.resultCount).toBe(2);
      expect(result.results.map((entry: any) => entry.path)).toEqual(["first.md", "second.md"]);
    });

    it("searches case-insensitively", async () => {
      const file = new TFile("case.md");
      mockApp.vault.getMarkdownFiles.mockReturnValue([file]);
      mockApp.vault.cachedRead.mockResolvedValue("Mixed Case Content with COPILOT inside");

      const searchVault = getTool("search_vault");
      const result = await searchVault.handler({ query: "copilot" });

      expect(result.resultCount).toBe(1);
      expect(result.results[0]).toEqual({
        path: "case.md",
        snippet: expect.stringContaining("COPILOT"),
      });
    });
  });

  describe("list_notes", () => {
    it("lists files in the root folder", async () => {
      const root = new TFile("root.md");
      const nested = new TFile("folder/nested.md");
      mockApp.vault.getMarkdownFiles.mockReturnValue([root, nested]);

      const listNotes = getTool("list_notes");
      const result = await listNotes.handler({});

      expect(result.folder).toBe("/");
      expect(result.count).toBe(1);
      expect(result.files).toEqual([
        {
          path: "root.md",
          name: "root",
          size: root.stat.size,
          modified: root.stat.mtime,
        },
      ]);
    });

    it("lists files in a specific folder", async () => {
      const direct = new TFile("projects/plan.md");
      const nested = new TFile("projects/archive/old.md");
      const other = new TFile("notes/todo.md");
      mockApp.vault.getMarkdownFiles.mockReturnValue([direct, nested, other]);

      const listNotes = getTool("list_notes");
      const result = await listNotes.handler({ folder: "projects" });

      expect(result.folder).toBe("projects");
      expect(result.count).toBe(1);
      expect(result.files.map((file: any) => file.path)).toEqual(["projects/plan.md"]);
    });

    it("includes subfolders in recursive mode", async () => {
      const direct = new TFile("projects/plan.md");
      const nested = new TFile("projects/archive/old.md");
      const other = new TFile("notes/todo.md");
      mockApp.vault.getMarkdownFiles.mockReturnValue([direct, nested, other]);

      const listNotes = getTool("list_notes");
      const result = await listNotes.handler({ folder: "projects", recursive: true });

      expect(result.count).toBe(2);
      expect(result.files.map((file: any) => file.path)).toEqual([
        "projects/plan.md",
        "projects/archive/old.md",
      ]);
    });

    it("returns empty results for a non-existent folder", async () => {
      mockApp.vault.getMarkdownFiles.mockReturnValue([new TFile("notes/test.md")]);

      const listNotes = getTool("list_notes");
      const result = await listNotes.handler({ folder: "missing" });

      expect(result).toEqual({ folder: "missing", count: 0, files: [] });
    });
  });

  describe("create_note", () => {
    it("creates a new note successfully", async () => {
      const createNote = getTool("create_note");
      const result = await createNote.handler({ path: "new-note.md", content: "Hello" });

      expect(mockApp.vault.create).toHaveBeenCalledWith("new-note.md", "Hello");
      expect(result).toEqual({ created: true, path: "new-note.md" });
    });

    it("returns an error if the file already exists", async () => {
      mockApp.vault.getAbstractFileByPath.mockReturnValue(new TFile("existing.md"));

      const createNote = getTool("create_note");
      const result = await createNote.handler({ path: "existing.md", content: "Hello" });

      expect(result).toEqual({ error: "File already exists: existing.md" });
      expect(mockApp.vault.create).not.toHaveBeenCalled();
      expect(mockApp.vault.createFolder).not.toHaveBeenCalled();
    });

    it("creates the parent folder if needed", async () => {
      mockApp.vault.getAbstractFileByPath.mockImplementation((path: string) => {
        if (path === "notes/new.md") {
          return null;
        }
        if (path === "notes") {
          return null;
        }
        return null;
      });

      const createNote = getTool("create_note");
      const result = await createNote.handler({ path: "notes/new.md", content: "Body" });

      expect(mockApp.vault.createFolder).toHaveBeenCalledWith("notes");
      expect(mockApp.vault.create).toHaveBeenCalledWith("notes/new.md", "Body");
      expect(result).toEqual({ created: true, path: "notes/new.md" });
    });
  });

  describe("edit_note", () => {
    it("appends content to the end of the note", async () => {
      const file = new TFile("edit.md");
      mockApp.vault.getFileByPath.mockReturnValue(file);
      mockApp.vault.read.mockResolvedValue("Existing content");

      const editNote = getTool("edit_note");
      const result = await editNote.handler({ path: "edit.md", operation: "append", content: "Appended" });

      expect(mockApp.vault.modify).toHaveBeenCalledWith(file, "Existing content\nAppended");
      expect(result).toEqual({ edited: true, path: "edit.md", operation: "append" });
    });

    it("prepends content to the beginning of the note", async () => {
      const file = new TFile("edit.md");
      mockApp.vault.getFileByPath.mockReturnValue(file);
      mockApp.vault.read.mockResolvedValue("Existing content");

      const editNote = getTool("edit_note");
      const result = await editNote.handler({ path: "edit.md", operation: "prepend", content: "Prepended" });

      expect(mockApp.vault.modify).toHaveBeenCalledWith(file, "Prepended\nExisting content");
      expect(result).toEqual({ edited: true, path: "edit.md", operation: "prepend" });
    });

    it("replaces the entire note content", async () => {
      const file = new TFile("edit.md");
      mockApp.vault.getFileByPath.mockReturnValue(file);
      mockApp.vault.read.mockResolvedValue("Existing content");

      const editNote = getTool("edit_note");
      const result = await editNote.handler({ path: "edit.md", operation: "replace", content: "Replacement" });

      expect(mockApp.vault.modify).toHaveBeenCalledWith(file, "Replacement");
      expect(result).toEqual({ edited: true, path: "edit.md", operation: "replace" });
    });

    it("returns an error for a non-existent file", async () => {
      const editNote = getTool("edit_note");
      const result = await editNote.handler({ path: "missing.md", operation: "append", content: "More" });

      expect(result).toEqual({ error: "Note not found: missing.md" });
      expect(mockApp.vault.read).not.toHaveBeenCalled();
      expect(mockApp.vault.modify).not.toHaveBeenCalled();
    });

    it("returns an error for an unknown operation", async () => {
      const file = new TFile("edit.md");
      mockApp.vault.getFileByPath.mockReturnValue(file);
      mockApp.vault.read.mockResolvedValue("Existing content");

      const editNote = getTool("edit_note");
      const result = await editNote.handler({ path: "edit.md", operation: "merge", content: "More" });

      expect(result).toEqual({ error: "Unknown operation: merge" });
      expect(mockApp.vault.modify).not.toHaveBeenCalled();
    });
  });

  describe("get_active_note", () => {
    it("returns the content of the active file", async () => {
      const file = new TFile("active.md");
      mockApp.workspace.getActiveFile.mockReturnValue(file);
      mockApp.vault.cachedRead.mockResolvedValue("Active content");

      const getActiveNote = getTool("get_active_note");
      const result = await getActiveNote.handler({});

      expect(result).toEqual({
        path: "active.md",
        name: "active",
        content: "Active content",
      });
    });

    it("returns an error when no file is open", async () => {
      const getActiveNote = getTool("get_active_note");
      const result = await getActiveNote.handler({});

      expect(result).toEqual({ error: "No note is currently open" });
      expect(mockApp.vault.cachedRead).not.toHaveBeenCalled();
    });
  });

  describe("get_note_metadata", () => {
    it("returns frontmatter, tags, headings, and links", async () => {
      const file = new TFile("meta.md");
      file.stat = { size: 321, ctime: 1000, mtime: 2000 };
      mockApp.vault.getFileByPath.mockReturnValue(file);
      mockApp.metadataCache.getFileCache.mockReturnValue({
        frontmatter: { title: "Meta" },
        tags: [{ tag: "#tag-one" }, { tag: "#tag-two" }],
        headings: [{ level: 1, heading: "Heading 1" }, { level: 2, heading: "Heading 2" }],
        links: [{ link: "linked-note" }, { link: "another-link" }],
      });

      const getNoteMetadata = getTool("get_note_metadata");
      const result = await getNoteMetadata.handler({ path: "meta.md" });

      expect(result).toEqual({
        path: "meta.md",
        frontmatter: { title: "Meta" },
        tags: ["#tag-one", "#tag-two"],
        headings: [
          { level: 1, text: "Heading 1" },
          { level: 2, text: "Heading 2" },
        ],
        links: ["linked-note", "another-link"],
        size: 321,
        created: 1000,
        modified: 2000,
      });
    });

    it("returns empty metadata when there is no cache", async () => {
      const file = new TFile("plain.md");
      file.stat = { size: 111, ctime: 222, mtime: 333 };
      mockApp.vault.getFileByPath.mockReturnValue(file);
      mockApp.metadataCache.getFileCache.mockReturnValue(null);

      const getNoteMetadata = getTool("get_note_metadata");
      const result = await getNoteMetadata.handler({ path: "plain.md" });

      expect(result).toEqual({
        path: "plain.md",
        frontmatter: {},
        tags: [],
        headings: [],
        links: [],
        size: 111,
        created: 222,
        modified: 333,
      });
    });

    it("returns an error for a non-existent file", async () => {
      const getNoteMetadata = getTool("get_note_metadata");
      const result = await getNoteMetadata.handler({ path: "missing.md" });

      expect(result).toEqual({ error: "Note not found: missing.md" });
      expect(mockApp.metadataCache.getFileCache).not.toHaveBeenCalled();
    });
  });
});
