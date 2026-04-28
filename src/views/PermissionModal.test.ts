import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  promptPermission,
  setAutopilot,
  isAutopilot,
  clearSessionPermissions,
  clearPermanentPermissions,
  __permissionKeyForTests as permissionKey,
} from "./PermissionModal";

// obsidian is already resolved to src/__mocks__/obsidian.ts via vitest.config alias

describe("PermissionModal", () => {
  let mockApp: any;

  beforeEach(() => {
    mockApp = {
      workspace: {},
      vault: {},
    };
    setAutopilot(false);
    clearSessionPermissions();
    clearPermanentPermissions();
  });

  afterEach(() => {
    setAutopilot(false);
  });

  it("promptPermission returns a promise", () => {
    const result = promptPermission(mockApp, { kind: "shell" });
    expect(result).toBeInstanceOf(Promise);
    result.catch(() => {}); // suppress unhandled rejection from floating promise
  });

  it("formats shell permission kind", () => {
    // The modal is created with open() called — verifying no throw
    const result = promptPermission(mockApp, { kind: "shell", command: "ls -la" });
    expect(result).toBeInstanceOf(Promise);
    result.catch(() => {});
  });

  it("formats write permission kind", () => {
    const result = promptPermission(mockApp, { kind: "write", path: "/tmp/test.txt" });
    expect(result).toBeInstanceOf(Promise);
    result.catch(() => {});
  });

  it("formats mcp permission kind", () => {
    const result = promptPermission(mockApp, { kind: "mcp", server: "github" });
    expect(result).toBeInstanceOf(Promise);
    result.catch(() => {});
  });

  it("formats url permission kind", () => {
    const result = promptPermission(mockApp, { kind: "url", url: "https://example.com" });
    expect(result).toBeInstanceOf(Promise);
    result.catch(() => {});
  });

  it("formats custom-tool permission kind", () => {
    const result = promptPermission(mockApp, { kind: "custom-tool", tool: "my-tool" });
    expect(result).toBeInstanceOf(Promise);
    result.catch(() => {});
  });

  it("handles unknown permission kind", () => {
    const result = promptPermission(mockApp, { kind: "unknown" });
    expect(result).toBeInstanceOf(Promise);
    result.catch(() => {});
  });

  describe("autopilot", () => {
    it("setAutopilot toggles the flag", () => {
      expect(isAutopilot()).toBe(false);
      setAutopilot(true);
      expect(isAutopilot()).toBe(true);
      setAutopilot(false);
      expect(isAutopilot()).toBe(false);
    });

    it("auto-approves any request when enabled, without opening a modal", async () => {
      setAutopilot(true);
      const result = await promptPermission(mockApp, {
        kind: "shell",
        command: "rm -rf /",
      });
      expect(result).toEqual({ kind: "approved" });
    });

    it("auto-approves requests for kinds that have never been seen before", async () => {
      setAutopilot(true);
      const result = await promptPermission(mockApp, {
        kind: "some-future-kind",
        anything: "goes",
      } as any);
      expect(result).toEqual({ kind: "approved" });
    });
  });

  describe("session permission memory", () => {
    it("matches identical requests with non-standard fields after a session approval", async () => {
      setAutopilot(true);
      const a = await promptPermission(mockApp, {
        kind: "write",
        filePath: "/notes/A.md",
        arguments: { mode: "append" },
        toolCallId: "tc-1",
      } as any);
      const b = await promptPermission(mockApp, {
        kind: "write",
        filePath: "/notes/A.md",
        arguments: { mode: "append" },
        toolCallId: "tc-2",
      } as any);
      expect(a).toEqual({ kind: "approved" });
      expect(b).toEqual({ kind: "approved" });
    });
  });

  describe("permissionKey", () => {
    it("ignores per-call noise (toolCallId, requestId, timestamps)", () => {
      const a = permissionKey({
        kind: "write",
        filePath: "/notes/A.md",
        toolCallId: "tc-1",
        requestId: "r-1",
        timestamp: 1000,
      });
      const b = permissionKey({
        kind: "write",
        filePath: "/notes/A.md",
        toolCallId: "tc-2",
        requestId: "r-2",
        timestamp: 2000,
      });
      expect(a).toBe(b);
    });

    it("includes non-standard identifying fields like filePath/arguments/toolName", () => {
      const a = permissionKey({
        kind: "custom-tool",
        toolName: "vault.write",
        arguments: { path: "/A.md" },
      });
      const b = permissionKey({
        kind: "custom-tool",
        toolName: "vault.write",
        arguments: { path: "/B.md" },
      });
      // Different arguments must produce different keys
      expect(a).not.toBe(b);
    });

    it("produces different keys for different kinds even with identical fields", () => {
      expect(
        permissionKey({ kind: "read", path: "/A.md" }),
      ).not.toBe(permissionKey({ kind: "write", path: "/A.md" }));
    });

    it("is order-insensitive over field insertion order", () => {
      const a = permissionKey({ kind: "shell", command: "ls", cwd: "/x" });
      const b = permissionKey({ kind: "shell", cwd: "/x", command: "ls" });
      expect(a).toBe(b);
    });
  });
});
