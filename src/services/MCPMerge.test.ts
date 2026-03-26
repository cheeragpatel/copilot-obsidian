import { mergeMCPServers } from "./MCPMerge";
import type { MCPServerEntry } from "../types/settings";
import type { MCPServerState } from "../types/chat";

describe("mergeMCPServers", () => {
  it("returns empty array when all inputs are empty", () => {
    expect(mergeMCPServers([], [], [])).toEqual([]);
  });

  it("merges settings servers with correct source tag", () => {
    const settings: MCPServerEntry[] = [
      { name: "docs", type: "http", url: "https://docs.example.com", enabled: true },
    ];

    const result = mergeMCPServers(settings, [], []);

    expect(result).toEqual([
      expect.objectContaining({
        server: expect.objectContaining({ name: "docs", source: "settings" }),
        enabled: true,
        source: "settings",
        tools: [],
      }),
    ]);
  });

  it("merges discovered servers with their source tag", () => {
    const discovered: MCPServerEntry[] = [
      { name: "vault-mcp", type: "http", url: "https://vault.example.com", enabled: true, source: "vault" },
      { name: "home-mcp", type: "stdio", command: "node", args: ["server.js"], enabled: true, source: "home" },
    ];

    const result = mergeMCPServers([], discovered, []);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ source: "vault", server: expect.objectContaining({ name: "vault-mcp" }) });
    expect(result[1]).toMatchObject({ source: "home", server: expect.objectContaining({ name: "home-mcp" }) });
  });

  it("deduplicates by name, settings take priority over discovered", () => {
    const settings: MCPServerEntry[] = [
      { name: "shared", type: "http", url: "https://settings.example.com", enabled: true },
    ];
    const discovered: MCPServerEntry[] = [
      { name: "shared", type: "http", url: "https://vault.example.com", enabled: true, source: "vault" },
      { name: "extra", type: "http", url: "https://extra.example.com", enabled: true, source: "vault" },
    ];

    const result = mergeMCPServers(settings, discovered, []);

    expect(result).toHaveLength(2);
    expect(result[0].server.url).toBe("https://settings.example.com");
    expect(result[0].source).toBe("settings");
    expect(result[1].server.name).toBe("extra");
  });

  it("preserves enabled/disabled state from existing servers", () => {
    const settings: MCPServerEntry[] = [
      { name: "docs", type: "http", url: "https://docs.example.com", enabled: true },
    ];
    const existing: MCPServerState[] = [
      {
        server: { name: "docs", type: "http", url: "https://docs.example.com", enabled: false, source: "settings" },
        enabled: false,
        source: "settings",
        tools: [{ name: "search", enabled: false, description: "Search docs" }],
      },
    ];

    const result = mergeMCPServers(settings, [], existing);

    expect(result[0].enabled).toBe(false);
    expect(result[0].tools).toEqual([{ name: "search", enabled: false, description: "Search docs" }]);
  });

  it("creates tools from configTools when no existing state", () => {
    const settings: MCPServerEntry[] = [
      {
        name: "ctx7",
        type: "http",
        url: "https://mcp.context7.com",
        enabled: true,
        configTools: ["query-docs", "resolve-library-id"],
      },
    ];

    const result = mergeMCPServers(settings, [], []);

    expect(result[0].tools).toEqual([
      { name: "query-docs", enabled: true },
      { name: "resolve-library-id", enabled: true },
    ]);
  });

  it("ignores wildcard configTools", () => {
    const settings: MCPServerEntry[] = [
      { name: "all-tools", type: "http", url: "https://example.com", enabled: true, configTools: ["*"] },
    ];

    const result = mergeMCPServers(settings, [], []);

    expect(result[0].tools).toEqual([]);
  });

  it("uses fallback source for discovered servers without explicit source", () => {
    const discovered: MCPServerEntry[] = [
      { name: "no-source", type: "http", url: "https://example.com", enabled: true },
    ];

    const result = mergeMCPServers([], discovered, []);

    expect(result[0].source).toBe("vault");
  });
});
