import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConfigDiscovery } from "./ConfigDiscovery";

function createMockApp() {
  const files: Record<string, any> = {};
  const folders: Record<string, any> = {};

  return {
    vault: {
      getAbstractFileByPath: vi.fn((path: string) => files[path] || folders[path] || null),
      read: vi.fn(async (file: any) => file._content || ""),
    },
    _addFile(path: string, content: string) {
      const file = {
        path,
        extension: path.split(".").pop() || "",
        _content: content,
      };
      files[path] = file;
      return file;
    },
    _addFolder(path: string, children: any[] = []) {
      const folder = {
        path,
        children,
      };
      folders[path] = folder;
      return folder;
    },
  };
}

describe("ConfigDiscovery", () => {
  let mockApp: ReturnType<typeof createMockApp>;

  beforeEach(() => {
    mockApp = createMockApp();
    vi.clearAllMocks();
  });

  it("returns empty config when no standard config paths exist", async () => {
    const discovery = new ConfigDiscovery(mockApp as any);

    await expect(discovery.discover()).resolves.toEqual({
      skills: [],
      mcpServers: [],
      instructions: "",
      agents: [],
    });
  });

  it("discovers skill directories from standard locations", async () => {
    mockApp._addFolder(".github/skills");
    mockApp._addFolder(".copilot/skills");
    const discovery = new ConfigDiscovery(mockApp as any);

    const config = await discovery.discover();

    expect(config.skills).toEqual([".github/skills", ".copilot/skills"]);
    expect(mockApp.vault.getAbstractFileByPath).toHaveBeenCalledWith(".github/skills");
    expect(mockApp.vault.getAbstractFileByPath).toHaveBeenCalledWith(".copilot/skills");
  });

  it("discovers MCP servers from both supported config formats", async () => {
    mockApp._addFile(
      ".github/copilot/mcp.json",
      JSON.stringify({
        servers: {
          repo: { type: "http", url: "https://repo.example.com" },
        },
      }),
    );
    mockApp._addFile(
      ".copilot/mcp.json",
      JSON.stringify({
        mcpServers: {
          local: {
            type: "stdio",
            command: "node",
            args: ["server.js"],
            env: { TOKEN: "secret" },
          },
        },
      }),
    );
    const discovery = new ConfigDiscovery(mockApp as any);

    const config = await discovery.discover();

    expect(config.mcpServers).toEqual([
      {
        name: "repo",
        type: "http",
        url: "https://repo.example.com",
        command: undefined,
        args: undefined,
        env: undefined,
        enabled: true,
      },
      {
        name: "local",
        type: "stdio",
        url: undefined,
        command: "node",
        args: ["server.js"],
        env: { TOKEN: "secret" },
        enabled: true,
      },
    ]);
  });

  it("warns and skips invalid MCP config files", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockApp._addFile(".github/copilot/mcp.json", "{invalid json");
    mockApp._addFile(
      ".copilot/mcp.json",
      JSON.stringify({
        servers: {
          fallback: { url: "https://fallback.example.com" },
        },
      }),
    );
    const discovery = new ConfigDiscovery(mockApp as any);

    const config = await discovery.discover();

    expect(config.mcpServers).toEqual([
      {
        name: "fallback",
        type: "http",
        url: "https://fallback.example.com",
        command: undefined,
        args: undefined,
        env: undefined,
        enabled: true,
      },
    ]);
    expect(warnSpy).toHaveBeenCalledWith(
      "[Copilot] Failed to parse .github/copilot/mcp.json:",
      expect.any(SyntaxError),
    );
  });

  it("concatenates repo and personal instruction files", async () => {
    mockApp._addFile(".github/copilot-instructions.md", "Repo instructions");
    const alpha = mockApp._addFile(".copilot/instructions/alpha.md", "Alpha instructions");
    const skip = mockApp._addFile(".copilot/instructions/notes.txt", "Skip me");
    const zeta = mockApp._addFile(".copilot/instructions/zeta.md", "Zeta instructions");
    mockApp._addFolder(".copilot/instructions", [zeta, skip, alpha]);
    const discovery = new ConfigDiscovery(mockApp as any);

    const config = await discovery.discover();

    expect(config.instructions).toBe(
      "Repo instructions\n\nAlpha instructions\n\nZeta instructions",
    );
    expect(mockApp.vault.getAbstractFileByPath).toHaveBeenCalledWith(
      ".github/copilot-instructions.md",
    );
    expect(mockApp.vault.getAbstractFileByPath).toHaveBeenCalledWith(".copilot/instructions");
  });
});
