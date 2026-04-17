import { ChatMode, DEFAULT_MODEL } from "./constants";
import { DEFAULT_SETTINGS, type PluginSettings } from "./settings";

describe("src/types/settings", () => {
  const pluginSettingsKeyMap: Record<keyof PluginSettings, true> = {
    cliPath: true,
    defaultModel: true,
    streaming: true,
    openOnStartup: true,
    defaultMode: true,
    mcpServers: true,
    customAgents: true,
    skillDirectories: true,
    inheritConfig: true,
    disabledSkills: true,
    excludedTools: true,
    systemMessage: true,
    logLevel: true,
    autoIncludeCurrentNote: true,
    exportFolder: true,
  };

  const expectedKeys = Object.keys(pluginSettingsKeyMap).sort();

  it("includes all required plugin settings properties", () => {
    expect(DEFAULT_SETTINGS).toMatchObject({
      cliPath: "copilot",
      defaultModel: DEFAULT_MODEL,
      streaming: true,
      openOnStartup: false,
      defaultMode: ChatMode.Ask,
      mcpServers: [],
      customAgents: [],
      skillDirectories: [".github/skills", ".copilot/skills"],
      inheritConfig: true,
      disabledSkills: [],
      excludedTools: [],
      systemMessage: "",
      logLevel: "info",
    });

    expect(Object.keys(DEFAULT_SETTINGS).sort()).toEqual(expectedKeys);
  });

  it('defaults cliPath to "copilot"', () => {
    expect(DEFAULT_SETTINGS.cliPath).toBe("copilot");
  });

  it("defaults streaming to true", () => {
    expect(DEFAULT_SETTINGS.streaming).toBe(true);
  });

  it("defaults openOnStartup to false", () => {
    expect(DEFAULT_SETTINGS.openOnStartup).toBe(false);
  });

  it("defaults the chat mode to ask", () => {
    expect(DEFAULT_SETTINGS.defaultMode).toBe(ChatMode.Ask);
  });

  it("defaults mcpServers to an empty array", () => {
    expect(DEFAULT_SETTINGS.mcpServers).toEqual([]);
    expect(DEFAULT_SETTINGS.mcpServers).toHaveLength(0);
  });

  it("defaults customAgents to an empty array", () => {
    expect(DEFAULT_SETTINGS.customAgents).toEqual([]);
    expect(DEFAULT_SETTINGS.customAgents).toHaveLength(0);
  });

  it("defaults inheritConfig to true", () => {
    expect(DEFAULT_SETTINGS.inheritConfig).toBe(true);
  });

  it('defaults logLevel to "info"', () => {
    expect(DEFAULT_SETTINGS.logLevel).toBe("info");
  });

  it("keeps PluginSettings keys aligned with DEFAULT_SETTINGS", () => {
    expect(Object.keys(DEFAULT_SETTINGS).sort()).toEqual(expectedKeys);
  });
});
