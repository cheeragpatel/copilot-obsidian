import {
  AVAILABLE_MODELS,
  ChatMode,
  COPILOT_CHAT_VIEW_TYPE,
  DEFAULT_MODEL,
  PLUGIN_ID,
  toCliAgentMode,
} from "./constants";

describe("src/types/constants", () => {
  it("defines the supported chat modes", () => {
    const chatModeValues = Object.values(ChatMode);

    expect(chatModeValues).toEqual(
      expect.arrayContaining([ChatMode.Ask, ChatMode.Agent, ChatMode.Autopilot]),
    );
    expect(ChatMode.Ask).toBe("ask");
    expect(ChatMode.Agent).toBe("agent");
    expect(ChatMode.Autopilot).toBe("autopilot");
    expect(new Set(chatModeValues).size).toBe(3);
  });

  it("maps UI chat modes to CLI agent modes", () => {
    expect(toCliAgentMode(ChatMode.Ask)).toBe("interactive");
    expect(toCliAgentMode(ChatMode.Agent)).toBe("interactive");
    expect(toCliAgentMode(ChatMode.Autopilot)).toBe("autopilot");
  });

  it("exports a default model as a defined string", () => {
    expect(DEFAULT_MODEL).toBeDefined();
    expect(typeof DEFAULT_MODEL).toBe("string");
    expect(DEFAULT_MODEL.length).toBeGreaterThan(0);
    expect(AVAILABLE_MODELS).toContain(DEFAULT_MODEL);
  });

  it("lists available models as a non-empty array of strings", () => {
    expect(Array.isArray(AVAILABLE_MODELS)).toBe(true);
    expect(AVAILABLE_MODELS.length).toBe(15);
    expect(AVAILABLE_MODELS.every((model) => typeof model === "string")).toBe(
      true,
    );
    expect(
      AVAILABLE_MODELS.every((model) => model.trim().length > 0),
    ).toBe(true);
    expect(AVAILABLE_MODELS).toContain("claude-sonnet-4.6");
    expect(AVAILABLE_MODELS).toContain("claude-opus-4.6");
  });

  it("exports the chat view type as a string", () => {
    expect(typeof COPILOT_CHAT_VIEW_TYPE).toBe("string");
    expect(COPILOT_CHAT_VIEW_TYPE.length).toBeGreaterThan(0);
  });

  it("defines the plugin id", () => {
    expect(PLUGIN_ID).toBeDefined();
    expect(typeof PLUGIN_ID).toBe("string");
    expect(PLUGIN_ID.length).toBeGreaterThan(0);
  });
});
