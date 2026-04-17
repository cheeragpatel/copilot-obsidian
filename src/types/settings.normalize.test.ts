import { describe, it, expect } from "vitest";
import { normalizeSettings } from "./settings.normalize";
import { DEFAULT_SETTINGS } from "./settings";
import { ChatMode } from "./constants";

describe("normalizeSettings", () => {
  it("returns defaults for empty input", () => {
    const out = normalizeSettings({}, DEFAULT_SETTINGS);
    expect(out).toEqual(DEFAULT_SETTINGS);
  });

  it("falls back to default when defaultMode is not a known enum value", () => {
    const out = normalizeSettings({ defaultMode: "wat" }, DEFAULT_SETTINGS);
    expect(out.defaultMode).toBe(DEFAULT_SETTINGS.defaultMode);
  });

  it("preserves valid defaultMode values", () => {
    const out = normalizeSettings({ defaultMode: "agent" }, DEFAULT_SETTINGS);
    expect(out.defaultMode).toBe(ChatMode.Agent);
  });

  it("falls back to default when logLevel is invalid", () => {
    const out = normalizeSettings({ logLevel: "trace" }, DEFAULT_SETTINGS);
    expect(out.logLevel).toBe(DEFAULT_SETTINGS.logLevel);
  });

  it("trims defaultModel and falls back when blank", () => {
    expect(normalizeSettings({ defaultModel: "  gpt-4.1  " }, DEFAULT_SETTINGS).defaultModel).toBe(
      "gpt-4.1",
    );
    expect(normalizeSettings({ defaultModel: "   " }, DEFAULT_SETTINGS).defaultModel).toBe(
      DEFAULT_SETTINGS.defaultModel,
    );
  });

  it("drops MCP servers without a name and dedupes by name (first wins)", () => {
    const out = normalizeSettings(
      {
        mcpServers: [
          { name: "  ", type: "http", url: "https://example.com" },
          { name: "docs", type: "http", url: "https://a" },
          { name: "docs", type: "http", url: "https://b" },
        ],
      },
      DEFAULT_SETTINGS,
    );
    expect(out.mcpServers).toHaveLength(1);
    expect(out.mcpServers[0]).toMatchObject({ name: "docs", url: "https://a", source: "settings" });
  });

  it("drops http MCP servers missing a url", () => {
    const out = normalizeSettings(
      {
        mcpServers: [
          { name: "valid", type: "http", url: "https://x" },
          { name: "broken", type: "http", url: "" },
          { name: "broken2", type: "http" },
        ],
      },
      DEFAULT_SETTINGS,
    );
    expect(out.mcpServers.map((s) => s.name)).toEqual(["valid"]);
  });

  it("drops stdio MCP servers missing a command", () => {
    const out = normalizeSettings(
      {
        mcpServers: [
          { name: "ok", type: "stdio", command: "node server.js" },
          { name: "bad", type: "stdio", command: "  " },
          { name: "bad2", type: "stdio" },
        ],
      },
      DEFAULT_SETTINGS,
    );
    expect(out.mcpServers.map((s) => s.name)).toEqual(["ok"]);
  });

  it("trims string fields on MCP entries", () => {
    const out = normalizeSettings(
      {
        mcpServers: [
          { name: "  trimmed  ", type: "http", url: "  https://x  " },
        ],
      },
      DEFAULT_SETTINGS,
    );
    expect(out.mcpServers[0]).toMatchObject({ name: "trimmed", url: "https://x" });
  });

  it("drops custom agents with blank/missing names", () => {
    const out = normalizeSettings(
      {
        customAgents: [
          { name: "  ", displayName: "X", description: "", prompt: "", enabled: true },
          { name: "writer", displayName: "Writer", description: "d", prompt: "p", enabled: true },
          { name: "writer", displayName: "Other", description: "", prompt: "", enabled: false },
        ],
      },
      DEFAULT_SETTINGS,
    );
    expect(out.customAgents).toHaveLength(1);
    expect(out.customAgents[0].name).toBe("writer");
    expect(out.customAgents[0].displayName).toBe("Writer");
  });

  it("ignores arrays of garbage", () => {
    const out = normalizeSettings(
      { mcpServers: ["nope", 5, null], customAgents: [42] },
      DEFAULT_SETTINGS,
    );
    expect(out.mcpServers).toEqual([]);
    expect(out.customAgents).toEqual([]);
  });

  it("handles raw not being an object", () => {
    expect(normalizeSettings(null, DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings(42, DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
  });
});
