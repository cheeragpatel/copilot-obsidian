import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

  const mockHomeFiles = (files: Record<string, string>) => {
    const fs = {
      existsSync: vi.fn((candidate: string) => Object.prototype.hasOwnProperty.call(files, candidate)),
      readFileSync: vi.fn((candidate: string) => files[candidate]),
      readdirSync: vi.fn((_dir: string) => [] as string[]),
      statSync: vi.fn((_p: string) => ({ isDirectory: (): boolean => false })),
    };

    (window as Window & { require?: (name: string) => unknown }).require = vi.fn((name: string) => {
      if (name === "fs") return fs;
      if (name === "path") return path;
      throw new Error(`Unexpected module: ${name}`);
    });

    return fs;
  };

  beforeEach(() => {
    mockApp = createMockApp();
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete (window as Window & { require?: (name: string) => unknown }).require;
    vi.restoreAllMocks();
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
            type: "local",
            command: "node",
            args: ["server.js"],
            env: { TOKEN: "secret" },
            tools: ["*"],
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
        headers: undefined,
        configTools: undefined,
        enabled: true,
        source: "vault",
      },
      {
        name: "local",
        type: "stdio",
        url: undefined,
        command: "node",
        args: ["server.js"],
        env: { TOKEN: "secret" },
        headers: undefined,
        configTools: ["*"],
        enabled: true,
        source: "vault",
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
        headers: undefined,
        configTools: undefined,
        enabled: true,
        source: "vault",
      },
    ]);
    expect(warnSpy).toHaveBeenCalledWith(
      "[Copilot] Failed to parse .github/copilot/mcp.json:",
      expect.any(String),
    );
  });

  it("discovers home MCP servers from mcp-config.json before other home configs", async () => {
    mockApp._addFile(
      ".copilot/mcp.json",
      JSON.stringify({
        servers: {
          shared: { type: "http", url: "https://vault.example.com" },
          vaultOnly: { type: "http", url: "https://vault-only.example.com" },
        },
      }),
    );

    const homeRoot = os.homedir() || "/Users/tester";
    mockHomeFiles({
      [path.join(homeRoot, ".copilot", "mcp-config.json")]: JSON.stringify({
        mcpServers: {
          shared: { type: "http", url: "https://home-should-not-win.example.com" },
          homePreferred: {
            type: "local",
            command: "npx",
            args: ["-y", "server"],
            env: { TOKEN: "secret" },
            tools: ["*"],
          },
          context7: {
            type: "http",
            url: "https://mcp.context7.com/mcp",
            headers: { CONTEXT7_API_KEY: "secret" },
            tools: ["query-docs", "resolve-library-id"],
          },
        },
      }),
      [path.join(homeRoot, ".copilot", "mcp.json")]: JSON.stringify({
        servers: {
          homePreferred: { type: "http", url: "https://wrong.example.com" },
          homeStandard: { type: "http", url: "https://home-standard.example.com" },
        },
      }),
      [path.join(homeRoot, ".copilot", "config.json")]: JSON.stringify({
        mcpServers: {
          homeConfig: { type: "stdio", command: "node", args: ["config.js"] },
        },
      }),
      [path.join(homeRoot, "Library", "Application Support", "github-copilot", "mcp.json")]: JSON.stringify({
        servers: {
          macHome: { type: "http", url: "https://mac.example.com" },
        },
      }),
      [path.join(homeRoot, ".config", "github-copilot", "mcp.json")]: JSON.stringify({
        mcpServers: {},
      }),
    });

    const discovery = new ConfigDiscovery(mockApp as any);
    const config = await discovery.discover();

    expect(config.mcpServers).toEqual([
      {
        name: "shared",
        type: "http",
        url: "https://vault.example.com",
        command: undefined,
        args: undefined,
        env: undefined,
        headers: undefined,
        configTools: undefined,
        enabled: true,
        source: "vault",
      },
      {
        name: "vaultOnly",
        type: "http",
        url: "https://vault-only.example.com",
        command: undefined,
        args: undefined,
        env: undefined,
        headers: undefined,
        configTools: undefined,
        enabled: true,
        source: "vault",
      },
      {
        name: "homePreferred",
        type: "stdio",
        url: undefined,
        command: "npx",
        args: ["-y", "server"],
        env: { TOKEN: "secret" },
        headers: undefined,
        configTools: ["*"],
        enabled: true,
        source: "home",
      },
      {
        name: "context7",
        type: "http",
        url: "https://mcp.context7.com/mcp",
        command: undefined,
        args: undefined,
        env: undefined,
        headers: { CONTEXT7_API_KEY: "secret" },
        configTools: ["query-docs", "resolve-library-id"],
        enabled: true,
        source: "home",
      },
      {
        name: "homeStandard",
        type: "http",
        url: "https://home-standard.example.com",
        command: undefined,
        args: undefined,
        env: undefined,
        headers: undefined,
        configTools: undefined,
        enabled: true,
        source: "home",
      },
      {
        name: "homeConfig",
        type: "stdio",
        url: undefined,
        command: "node",
        args: ["config.js"],
        env: undefined,
        headers: undefined,
        configTools: undefined,
        enabled: true,
        source: "home",
      },
      {
        name: "macHome",
        type: "http",
        url: "https://mac.example.com",
        command: undefined,
        args: undefined,
        env: undefined,
        headers: undefined,
        configTools: undefined,
        enabled: true,
        source: "home",
      },
    ]);
  });

  it("warns and skips invalid home MCP config files", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const homeRoot = os.homedir() || "/Users/tester";
    const invalidPath = path.join(homeRoot, ".copilot", "mcp-config.json");

    mockHomeFiles({
      [invalidPath]: "{invalid json",
      [path.join(homeRoot, ".copilot", "config.json")]: JSON.stringify({
        mcpServers: {
          recovered: { type: "http", url: "https://recovered.example.com" },
        },
      }),
    });

    const discovery = new ConfigDiscovery(mockApp as any);
    const config = await discovery.discover();

    expect(config.mcpServers).toEqual([
      {
        name: "recovered",
        type: "http",
        url: "https://recovered.example.com",
        command: undefined,
        args: undefined,
        env: undefined,
        headers: undefined,
        configTools: undefined,
        enabled: true,
        source: "home",
      },
    ]);
    expect(warnSpy).toHaveBeenCalledWith(
      `[Copilot] Failed to parse ${invalidPath}:`,
      expect.any(String),
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

  it("discovers global agents using os.homedir() for cross-platform home resolution", async () => {
    const homeRoot = os.homedir() || "/tmp/tester";
    const agentContent = [
      "---",
      'name: "reviewer"',
      'description: "Reviews code"',
      "---",
      "You are a code reviewer.",
    ].join("\n");

    const fsMock = mockHomeFiles({});
    fsMock.existsSync.mockImplementation((candidate: string) => {
      return candidate === path.join(homeRoot, ".copilot", "agents");
    });
    fsMock.readdirSync.mockImplementation((dir: string) => {
      if (dir === path.join(homeRoot, ".copilot", "agents")) {
        return ["reviewer.agent.md"];
      }
      return [];
    });
    fsMock.statSync.mockImplementation((p: string) => ({
      isDirectory: () => p === path.join(homeRoot, ".copilot", "agents"),
    }));
    fsMock.readFileSync.mockImplementation((p: string) => {
      if (p === path.join(homeRoot, ".copilot", "agents", "reviewer.agent.md")) {
        return agentContent;
      }
      throw new Error("Not found");
    });

    const discovery = new ConfigDiscovery(mockApp as any);
    const config = await discovery.discover();

    expect(config.agents).toEqual([
      expect.objectContaining({
        name: "reviewer",
        description: "Reviews code",
      }),
    ]);
  });

  it("probes home MCP paths rooted at os.homedir() for cross-platform correctness", async () => {
    const homeRoot = os.homedir() || "/tmp/tester";
    const expectedPath = path.join(homeRoot, ".copilot", "mcp.json");

    const fsMock = mockHomeFiles({
      [expectedPath]: JSON.stringify({
        servers: { cross: { type: "http", url: "https://cross.example.com" } },
      }),
    });

    const discovery = new ConfigDiscovery(mockApp as any);
    const config = await discovery.discover();

    expect(fsMock.existsSync).toHaveBeenCalledWith(expectedPath);
    expect(config.mcpServers).toEqual([
      expect.objectContaining({ name: "cross", url: "https://cross.example.com" }),
    ]);
  });
});
