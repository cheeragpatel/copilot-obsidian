import { getAvailableAgents } from "./agentSelectors";
import type { CustomAgentEntry } from "../types/settings";

function agent(name: string, overrides: Partial<CustomAgentEntry> = {}): CustomAgentEntry {
  return {
    name,
    displayName: name,
    description: "",
    prompt: "",
    enabled: true,
    ...overrides,
  };
}

describe("getAvailableAgents", () => {
  it("returns an empty array when both inputs are empty/nullish", () => {
    expect(getAvailableAgents(undefined, undefined)).toEqual([]);
    expect(getAvailableAgents([], [])).toEqual([]);
    expect(getAvailableAgents(null, null)).toEqual([]);
  });

  it("excludes disabled settings agents", () => {
    const result = getAvailableAgents([agent("a"), agent("b", { enabled: false })], []);
    expect(result.map((a) => a.name)).toEqual(["a"]);
  });

  it("merges discovered agents and dedupes by name with settings winning", () => {
    const settings = [agent("shared", { displayName: "Settings Shared" })];
    const discovered = [
      agent("shared", { displayName: "Discovered Shared" }),
      agent("only-discovered"),
    ];
    const result = getAvailableAgents(settings, discovered);
    expect(result.map((a) => a.name)).toEqual(["only-discovered", "shared"]);
    expect(result.find((a) => a.name === "shared")?.displayName).toBe("Settings Shared");
  });

  it("sorts results alphabetically by name", () => {
    const result = getAvailableAgents([agent("zeta"), agent("alpha"), agent("mike")], []);
    expect(result.map((a) => a.name)).toEqual(["alpha", "mike", "zeta"]);
  });
});
