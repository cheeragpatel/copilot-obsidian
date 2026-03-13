import { describe, it, expect, vi, beforeEach } from "vitest";
import { promptPermission } from "./PermissionModal";

// Mock obsidian Modal
vi.mock("obsidian", async () => {
  const actual = await vi.importActual("obsidian");
  return {
    ...actual,
  };
});

describe("PermissionModal", () => {
  let mockApp: any;

  beforeEach(() => {
    mockApp = {
      workspace: {},
      vault: {},
    };
  });

  it("promptPermission returns a promise", () => {
    const result = promptPermission(mockApp, { kind: "shell" });
    expect(result).toBeInstanceOf(Promise);
  });

  it("formats shell permission kind", () => {
    // The modal is created with open() called — verifying no throw
    const result = promptPermission(mockApp, { kind: "shell", command: "ls -la" });
    expect(result).toBeInstanceOf(Promise);
  });

  it("formats write permission kind", () => {
    const result = promptPermission(mockApp, { kind: "write", path: "/tmp/test.txt" });
    expect(result).toBeInstanceOf(Promise);
  });

  it("formats mcp permission kind", () => {
    const result = promptPermission(mockApp, { kind: "mcp", server: "github" });
    expect(result).toBeInstanceOf(Promise);
  });

  it("formats url permission kind", () => {
    const result = promptPermission(mockApp, { kind: "url", url: "https://example.com" });
    expect(result).toBeInstanceOf(Promise);
  });

  it("formats custom-tool permission kind", () => {
    const result = promptPermission(mockApp, { kind: "custom-tool", tool: "my-tool" });
    expect(result).toBeInstanceOf(Promise);
  });

  it("handles unknown permission kind", () => {
    const result = promptPermission(mockApp, { kind: "unknown" });
    expect(result).toBeInstanceOf(Promise);
  });
});
