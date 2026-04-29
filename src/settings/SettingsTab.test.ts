import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PluginSettingTab, Setting } from "obsidian";
import { DEFAULT_SETTINGS } from "../types/settings";

vi.mock("obsidian");

type TrackingSetting = {
  name?: string;
  desc?: string;
  settingEl: HTMLElement;
  textControl?: any;
  textAreaControl?: any;
  toggleControl?: any;
  dropdownControl?: any;
  buttonControl?: any;
  extraButtonControl?: any;
  setName: ReturnType<typeof vi.fn>;
  setDesc: ReturnType<typeof vi.fn>;
  addText: ReturnType<typeof vi.fn>;
  addTextArea: ReturnType<typeof vi.fn>;
  addToggle: ReturnType<typeof vi.fn>;
  addDropdown: ReturnType<typeof vi.fn>;
  addButton: ReturnType<typeof vi.fn>;
  addExtraButton: ReturnType<typeof vi.fn>;
};

function createTextControl() {
  const control: any = {};
  control.setPlaceholder = vi.fn((value: string) => {
    control.placeholder = value;
    return control;
  });
  control.setValue = vi.fn((value: string) => {
    control.value = value;
    return control;
  });
  control.onChange = vi.fn((handler: (value: string) => unknown) => {
    control.changeHandler = handler;
    return control;
  });
  return control;
}

function createTextAreaControl() {
  return createTextControl();
}

function createToggleControl() {
  const control: any = {};
  control.setValue = vi.fn((value: boolean) => {
    control.value = value;
    return control;
  });
  control.onChange = vi.fn((handler: (value: boolean) => unknown) => {
    control.changeHandler = handler;
    return control;
  });
  return control;
}

function createDropdownControl() {
  const control: any = { options: [] as Array<{ value: string; label: string }> };
  control.addOption = vi.fn((value: string, label: string) => {
    control.options.push({ value, label });
    return control;
  });
  control.setValue = vi.fn((value: string) => {
    control.value = value;
    return control;
  });
  control.onChange = vi.fn((handler: (value: string) => unknown) => {
    control.changeHandler = handler;
    return control;
  });
  return control;
}

function createButtonControl() {
  const control: any = {};
  control.setButtonText = vi.fn((text: string) => {
    control.text = text;
    return control;
  });
  control.onClick = vi.fn((handler: () => unknown) => {
    control.click = handler;
    return control;
  });
  return control;
}

function createExtraButtonControl() {
  const control: any = {};
  control.setIcon = vi.fn((icon: string) => {
    control.icon = icon;
    return control;
  });
  control.setTooltip = vi.fn((tooltip: string) => {
    control.tooltip = tooltip;
    return control;
  });
  control.onClick = vi.fn((handler: () => unknown) => {
    control.click = handler;
    return control;
  });
  return control;
}

function createMockPlugin(settingsOverrides: any = {}) {
  const settings = { ...DEFAULT_SETTINGS, ...settingsOverrides };
  return {
    app: {},
    settings,
    saveSettings: vi.fn().mockResolvedValue(undefined),
  };
}

describe("CopilotSettingsTab", () => {
  let CopilotSettingsTab: typeof import("./SettingsTab").CopilotSettingsTab;
  let settingInstances: TrackingSetting[];

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    settingInstances = [];

    const { PluginSettingTab: MockPluginSettingTab, Setting: MockSetting } =
      await vi.importActual<typeof import("../__mocks__/obsidian")>("../__mocks__/obsidian");

    class InstrumentedSetting extends MockSetting {
      name?: string;
      desc?: string;
      textControl?: any;
      textAreaControl?: any;
      toggleControl?: any;
      dropdownControl?: any;
      buttonControl?: any;
      extraButtonControl?: any;

      constructor(containerEl: any) {
        super(containerEl);
      }

      setName = vi.fn((name: string) => {
        this.name = name;
        return this;
      });

      setDesc = vi.fn((desc: string) => {
        this.desc = desc;
        return this;
      });

      addText = vi.fn((cb: (control: any) => void) => {
        this.textControl = createTextControl();
        cb(this.textControl);
        return this;
      });

      addTextArea = vi.fn((cb: (control: any) => void) => {
        this.textAreaControl = createTextAreaControl();
        cb(this.textAreaControl);
        return this;
      });

      addToggle = vi.fn((cb: (control: any) => void) => {
        this.toggleControl = createToggleControl();
        cb(this.toggleControl);
        return this;
      });

      addDropdown = vi.fn((cb: (control: any) => void) => {
        this.dropdownControl = createDropdownControl();
        cb(this.dropdownControl);
        return this;
      });

      addButton = vi.fn((cb: (control: any) => void) => {
        this.buttonControl = createButtonControl();
        cb(this.buttonControl);
        return this;
      });

      addExtraButton = vi.fn((cb: (control: any) => void) => {
        this.extraButtonControl = createExtraButtonControl();
        cb(this.extraButtonControl);
        return this;
      });
    }

    (PluginSettingTab as any).mockImplementation(function (this: any, app: any, plugin: any) {
      const instance = new MockPluginSettingTab(app, plugin);
      this.app = instance.app;
      this.plugin = instance.plugin;
      this.containerEl = instance.containerEl;
    });

    (Setting as any).mockImplementation(function (this: any, containerEl: any) {
      const instance = new InstrumentedSetting(containerEl);
      settingInstances.push(instance as unknown as TrackingSetting);
      return instance as any;
    });

    ({ CopilotSettingsTab } = await import("./SettingsTab"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function getSectionHeadings(tab: InstanceType<typeof CopilotSettingsTab>) {
    return (tab.containerEl.createEl as ReturnType<typeof vi.fn>).mock.calls
      .filter(([tag]) => tag === "h2")
      .map(([, attrs]) => attrs.text);
  }

  function getSetting(name: string) {
    const matching = settingInstances.filter((setting) => setting.name === name);
    expect(matching.length).toBeGreaterThan(0);
    return matching.at(-1)!;
  }

  function getSettingContaining(text: string) {
    const matching = settingInstances.filter((setting) => setting.name?.includes(text));
    expect(matching.length).toBeGreaterThan(0);
    return matching.at(-1)!;
  }

  function clickSetting(setting: TrackingSetting) {
    setting.settingEl.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  }

  function renderTab(settingsOverrides: any = {}) {
    const plugin = createMockPlugin(settingsOverrides);
    const tab = new CopilotSettingsTab(plugin.app as any, plugin);
    tab.display();
    return { plugin, tab };
  }

  it("creates instance with app and plugin references", () => {
    const app = { workspace: {} };
    const plugin = createMockPlugin();

    const tab = new CopilotSettingsTab(app as any, plugin);

    expect(tab).toBeInstanceOf(CopilotSettingsTab);
    expect(tab.app).toBe(app);
    expect((tab as any).plugin).toBe(plugin);
    expect((tab as any).settings).toBe(plugin.settings);
  });

  it("display() renders General section", () => {
    const plugin = createMockPlugin();
    const tab = new CopilotSettingsTab(plugin.app as any, plugin);

    tab.display();

    expect(tab.containerEl.empty).toHaveBeenCalledTimes(1);
    expect(getSectionHeadings(tab)).toContain("General");
    expect(settingInstances).toHaveLength(16);
    expect(tab.containerEl.createEl).toHaveBeenCalledTimes(10);
    expect(getSetting("Copilot CLI path").textControl.placeholder).toBe("copilot");
    expect(getSetting("Default model").dropdownControl.value).toBe(plugin.settings.defaultModel);
    expect(getSetting("Streaming responses").toggleControl.value).toBe(plugin.settings.streaming);
    expect(getSetting("Open chat on startup").toggleControl.value).toBe(plugin.settings.openOnStartup);
    expect(getSetting("Default mode").dropdownControl.value).toBe(plugin.settings.defaultMode);
    expect(getSetting("Auto-discover configuration").toggleControl.value).toBe(plugin.settings.inheritConfig);
  });

  it("display() renders MCP Servers section", () => {
    const plugin = createMockPlugin();
    const tab = new CopilotSettingsTab(plugin.app as any, plugin);

    tab.display();

    expect(getSectionHeadings(tab)).toContain("MCP Servers");
    expect(getSetting("Add MCP server").buttonControl.text).toBe("Add");
  });

  it("display() renders Custom Agents section", () => {
    const plugin = createMockPlugin();
    const tab = new CopilotSettingsTab(plugin.app as any, plugin);

    tab.display();

    expect(getSectionHeadings(tab)).toContain("Custom Agents");
    expect(getSetting("Add custom agent").buttonControl.text).toBe("Add");
  });

  it("display() renders Skills section", () => {
    const plugin = createMockPlugin({
      skillDirectories: ["/skills/one", "/skills/two"],
      disabledSkills: ["skill-a", "skill-b"],
    });
    const tab = new CopilotSettingsTab(plugin.app as any, plugin);

    tab.display();

    expect(getSectionHeadings(tab)).toContain("Skills");
    expect(getSetting("Skill directories").textAreaControl.value).toBe("/skills/one, /skills/two");
    expect(getSetting("Skill directories").textAreaControl.placeholder).toBe(".github/skills, .copilot/skills");
    expect(getSetting("Disabled skills").textAreaControl.value).toBe("skill-a, skill-b");
  });

  it("display() renders Advanced section", () => {
    const plugin = createMockPlugin({
      excludedTools: ["tool-a", "tool-b"],
      systemMessage: "Extra instructions",
      logLevel: "warn",
    });
    const tab = new CopilotSettingsTab(plugin.app as any, plugin);

    tab.display();

    expect(getSectionHeadings(tab)).toContain("Advanced");
    expect(getSetting("Excluded tools").textAreaControl.value).toBe("tool-a, tool-b");
    expect(getSetting("System message").textAreaControl.value).toBe("Extra instructions");
    expect(getSetting("Log level").dropdownControl.value).toBe("warn");
  });

  it("display() shows MCP servers as collapsed expandable rows", () => {
    const plugin = createMockPlugin({
      mcpServers: [
        {
          name: "filesystem",
          type: "http",
          url: "https://example.com/mcp",
          enabled: true,
        },
      ],
    });
    const tab = new CopilotSettingsTab(plugin.app as any, plugin);

    tab.display();

    const serverSetting = getSettingContaining("filesystem");
    expect(serverSetting.name).toBe("▶ filesystem");
    expect(serverSetting.desc).toBe("https://example.com/mcp");
    expect(serverSetting.toggleControl).toBeUndefined();
    expect(serverSetting.buttonControl).toBeUndefined();
  });

  it("display() shows custom agents as collapsed expandable rows", () => {
    const plugin = createMockPlugin({
      customAgents: [
        {
          name: "summarizer",
          displayName: "Summarizer",
          description: "Summarizes notes",
          prompt: "Summarize the note.",
          enabled: false,
        },
      ],
    });
    const tab = new CopilotSettingsTab(plugin.app as any, plugin);

    tab.display();

    const agentSetting = getSettingContaining("@summarizer");
    expect(agentSetting.name).toBe("▶ @summarizer");
    expect(agentSetting.desc).toBe("Summarizes notes");
    expect(agentSetting.toggleControl).toBeUndefined();
    expect(agentSetting.buttonControl).toBeUndefined();
  });

  it("updates general settings when control callbacks fire", async () => {
    const { plugin } = renderTab();

    await getSetting("Copilot CLI path").textControl.changeHandler("/usr/local/bin/copilot");
    expect(plugin.settings.cliPath).toBe("/usr/local/bin/copilot");

    await getSetting("Copilot CLI path").textControl.changeHandler("");
    expect(plugin.settings.cliPath).toBe(DEFAULT_SETTINGS.cliPath);

    await getSetting("Default model").dropdownControl.changeHandler("claude-sonnet-4.5");
    expect(plugin.settings.defaultModel).toBe("claude-sonnet-4.5");

    await getSetting("Streaming responses").toggleControl.changeHandler(false);
    expect(plugin.settings.streaming).toBe(false);

    await getSetting("Open chat on startup").toggleControl.changeHandler(true);
    expect(plugin.settings.openOnStartup).toBe(true);

    await getSetting("Default mode").dropdownControl.changeHandler("agent");
    expect(plugin.settings.defaultMode).toBe("agent");

    await getSetting("Auto-discover configuration").toggleControl.changeHandler(false);
    expect(plugin.settings.inheritConfig).toBe(false);

    expect(plugin.saveSettings).toHaveBeenCalledTimes(7);
  });

  it("updates skill and advanced settings when control callbacks fire", async () => {
    const { plugin } = renderTab({
      skillDirectories: ["/skills/original"],
      disabledSkills: ["old-skill"],
      excludedTools: ["old-tool"],
      systemMessage: "Original instructions",
      logLevel: "info",
    });

    await getSetting("Skill directories").textAreaControl.changeHandler(" /skills/one, , /skills/two ");
    expect(plugin.settings.skillDirectories).toEqual(["/skills/one", "/skills/two"]);

    await getSetting("Disabled skills").textAreaControl.changeHandler(" skill-a, , skill-b ");
    expect(plugin.settings.disabledSkills).toEqual(["skill-a", "skill-b"]);

    await getSetting("Excluded tools").textAreaControl.changeHandler(" tool-a, , tool-b ");
    expect(plugin.settings.excludedTools).toEqual(["tool-a", "tool-b"]);

    await getSetting("System message").textAreaControl.changeHandler("Use concise answers");
    expect(plugin.settings.systemMessage).toBe("Use concise answers");

    await getSetting("Log level").dropdownControl.changeHandler("error");
    expect(plugin.settings.logLevel).toBe("error");

    expect(plugin.saveSettings).toHaveBeenCalledTimes(5);
  });

  it("expands, edits, toggles, and removes MCP servers", async () => {
    const { plugin, tab } = renderTab({
      mcpServers: [
        {
          name: "filesystem",
          type: "stdio",
          command: "npx @modelcontextprotocol/server-filesystem",
          args: ["/vault"],
          enabled: true,
        },
      ],
    });
    const displaySpy = vi.spyOn(tab, "display");

    clickSetting(getSettingContaining("filesystem"));

    expect(displaySpy).toHaveBeenCalledTimes(1);
    expect(getSettingContaining("filesystem").name).toBe("▼ filesystem");
    expect(getSetting("Type").dropdownControl.value).toBe("stdio");
    expect(getSetting("Command").textControl.value).toBe("npx @modelcontextprotocol/server-filesystem");
    expect(getSetting("Args").textControl.value).toBe("/vault");

    await getSetting("Name").textControl.changeHandler("docs");
    await getSetting("Args").textControl.changeHandler('--path "/My Vault"');
    expect(plugin.settings.mcpServers[0].name).toBe("docs");
    expect(plugin.settings.mcpServers[0].args).toEqual(["--path", "/My Vault"]);
    expect(getSettingContaining("docs").desc).toBe("npx @modelcontextprotocol/server-filesystem --path \"/My Vault\"");

    await getSetting("Type").dropdownControl.changeHandler("http");
    expect(plugin.settings.mcpServers[0].type).toBe("http");
    expect(getSetting("URL").textControl.value).toBe("https://");

    await getSetting("URL").textControl.changeHandler("https://example.com/mcp");
    await getSetting("Enabled").toggleControl.changeHandler(false);
    expect(plugin.settings.mcpServers[0]).toMatchObject({
      name: "docs",
      type: "http",
      url: "https://example.com/mcp",
      enabled: false,
    });
    expect(getSettingContaining("docs").desc).toBe("https://example.com/mcp");

    await getSetting("Delete").buttonControl.click();
    expect(plugin.settings.mcpServers).toEqual([]);
    expect(plugin.saveSettings).toHaveBeenCalledTimes(6);
    expect(displaySpy).toHaveBeenCalledTimes(3);
  });

  it("expands, edits, toggles, and removes custom agents", async () => {
    const { plugin, tab } = renderTab({
      customAgents: [
        {
          name: "summarizer",
          displayName: "Summarizer",
          description: "",
          prompt: "Summarize the note.",
          enabled: false,
        },
      ],
    });
    const displaySpy = vi.spyOn(tab, "display");

    clickSetting(getSettingContaining("@summarizer"));

    expect(displaySpy).toHaveBeenCalledTimes(1);
    expect(getSettingContaining("@summarizer").name).toBe("▼ @summarizer");
    expect(getSetting("Display Name").textControl.value).toBe("Summarizer");
    expect(getSetting("Prompt/Instructions").textAreaControl.value).toBe("Summarize the note.");

    await getSetting("Name").textControl.changeHandler("researcher");
    await getSetting("Display Name").textControl.changeHandler("Research Agent");
    await getSetting("Description").textAreaControl.changeHandler("Investigates vault context");
    await getSetting("Prompt/Instructions").textAreaControl.changeHandler("Gather facts before answering.");
    await getSetting("Enabled").toggleControl.changeHandler(true);

    expect(plugin.settings.customAgents[0]).toEqual({
      name: "researcher",
      displayName: "Research Agent",
      description: "Investigates vault context",
      prompt: "Gather facts before answering.",
      enabled: true,
    });
    expect(getSettingContaining("@researcher").desc).toBe("Investigates vault context");

    await getSetting("Delete").buttonControl.click();
    expect(plugin.settings.customAgents).toEqual([]);
    expect(plugin.saveSettings).toHaveBeenCalledTimes(6);
    expect(displaySpy).toHaveBeenCalledTimes(2);
  });

  it("display() rerenders on add MCP server and expands the new entry", async () => {
    const plugin = createMockPlugin({ mcpServers: [] });
    const tab = new CopilotSettingsTab(plugin.app as any, plugin);
    const displaySpy = vi.spyOn(tab, "display");

    tab.display();
    displaySpy.mockClear();

    await getSetting("Add MCP server").buttonControl.click();

    expect(plugin.settings.mcpServers).toEqual([
      {
        name: "new-server",
        type: "http",
        url: "https://",
        enabled: true,
        source: "settings",
      },
    ]);
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    expect(displaySpy).toHaveBeenCalledTimes(1);
    expect(getSettingContaining("new-server").name).toBe("▼ new-server");
    expect(getSetting("Type").dropdownControl.value).toBe("http");
    expect(getSetting("URL").textControl.value).toBe("https://");
    expect(getSetting("Enabled").toggleControl.value).toBe(true);
    expect(getSetting("Delete").buttonControl.text).toBe("Delete");
  });

  it("display() rerenders on add custom agent and expands the new entry", async () => {
    const plugin = createMockPlugin({ customAgents: [] });
    const tab = new CopilotSettingsTab(plugin.app as any, plugin);
    const displaySpy = vi.spyOn(tab, "display");

    tab.display();
    displaySpy.mockClear();

    await getSetting("Add custom agent").buttonControl.click();

    expect(plugin.settings.customAgents).toEqual([
      {
        name: "my-agent",
        displayName: "My Agent",
        description: "A custom agent",
        prompt: "You are a helpful assistant.",
        enabled: true,
      },
    ]);
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    expect(displaySpy).toHaveBeenCalledTimes(1);
    expect(getSettingContaining("@my-agent").name).toBe("▼ @my-agent");
    expect(getSetting("Display Name").textControl.value).toBe("My Agent");
    expect(getSetting("Description").textAreaControl.value).toBe("A custom agent");
    expect(getSetting("Prompt/Instructions").textAreaControl.value).toBe("You are a helpful assistant.");
    expect(getSetting("Enabled").toggleControl.value).toBe(true);
    expect(getSetting("Delete").buttonControl.text).toBe("Delete");
  });
});
