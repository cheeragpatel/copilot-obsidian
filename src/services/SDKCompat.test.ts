import {
  discoverTools,
  normalizeEventType,
  normalizeToolInfo,
  type DiscoveredTool,
} from "./SDKCompat";

describe("normalizeEventType", () => {
  it("maps camelCase SDK events to snake_case", () => {
    expect(normalizeEventType("tool.executionStart")).toBe("tool.execution_start");
    expect(normalizeEventType("tool.executionComplete")).toBe("tool.execution_complete");
    expect(normalizeEventType("assistant.message.delta")).toBe("assistant.message_delta");
  });

  it("passes through unknown event types unchanged", () => {
    expect(normalizeEventType("session.idle")).toBe("session.idle");
    expect(normalizeEventType("session.error")).toBe("session.error");
    expect(normalizeEventType("assistant.message")).toBe("assistant.message");
  });
});

describe("normalizeToolInfo", () => {
  it("returns null for falsy input", () => {
    expect(normalizeToolInfo(null)).toBeNull();
    expect(normalizeToolInfo(undefined)).toBeNull();
  });

  it("extracts name from mcpToolName", () => {
    const result = normalizeToolInfo({
      mcpToolName: "query-docs",
      description: "Query docs",
    });
    expect(result).toEqual({
      name: "query-docs",
      description: "Query docs",
    });
  });

  it("extracts name from toolName when mcpToolName is absent", () => {
    const result = normalizeToolInfo({
      toolName: "search",
      toolDescription: "Search things",
    });
    expect(result).toEqual({
      name: "search",
      description: "Search things",
    });
  });

  it("extracts name from name field", () => {
    const result = normalizeToolInfo({
      name: "read_file",
      description: "Reads a file",
    });
    expect(result).toEqual({
      name: "read_file",
      description: "Reads a file",
    });
  });

  it("builds namespacedName from serverName and rawName", () => {
    const result = normalizeToolInfo({
      toolName: "query-docs",
      serverName: "context7",
      description: "Query docs",
    });
    expect(result).toEqual({
      name: "query-docs",
      namespacedName: "context7/query-docs",
      description: "Query docs",
    });
  });

  it("uses mcpServerName for namespacedName", () => {
    const result = normalizeToolInfo({
      mcpToolName: "list",
      mcpServerName: "azure",
      description: "List resources",
    });
    expect(result).toEqual({
      name: "list",
      namespacedName: "azure/list",
      description: "List resources",
    });
  });

  it("uses explicit namespacedName over serverName", () => {
    const result = normalizeToolInfo({
      name: "query-docs",
      namespacedName: "ctx7/query-docs",
      serverName: "context7",
      description: "Query docs",
    });
    expect(result).toEqual({
      name: "query-docs",
      namespacedName: "ctx7/query-docs",
      description: "Query docs",
    });
  });

  it("falls back to toolDescription when description is missing", () => {
    const result = normalizeToolInfo({
      name: "search",
      toolDescription: "Full-text search",
    });
    expect(result).toEqual({
      name: "search",
      description: "Full-text search",
    });
  });

  it("returns empty string description when neither field is present", () => {
    const result = normalizeToolInfo({ name: "search" });
    expect(result).toEqual({
      name: "search",
      description: "",
    });
  });

  it("returns null when no name can be extracted", () => {
    expect(normalizeToolInfo({ description: "no name" })).toBeNull();
    expect(normalizeToolInfo({})).toBeNull();
  });

  it("derives tool name from namespacedName with slash", () => {
    const result = normalizeToolInfo({
      name: "context7/query-docs",
      description: "Query docs",
    });
    expect(result).toEqual({
      name: "query-docs",
      namespacedName: "context7/query-docs",
      description: "Query docs",
    });
  });
});

describe("discoverTools", () => {
  it("returns tools from client.rpc.tools.list (server-scoped RPC)", async () => {
    const client = {
      rpc: {
        tools: {
          list: vi.fn().mockResolvedValue({
            tools: [
              {
                name: "list_resources",
                namespacedName: "azure/list_resources",
                description: "List Azure resources",
              },
            ],
          }),
        },
      },
    };

    const tools = await discoverTools(null, client);
    expect(tools).toEqual([
      {
        name: "list_resources",
        namespacedName: "azure/list_resources",
        description: "List Azure resources",
      },
    ]);
    expect(client.rpc.tools.list).toHaveBeenCalledWith({});
  });

  it("returns tools from session.rpc.tools.list", async () => {
    const session = {
      rpc: {
        tools: {
          list: vi.fn().mockResolvedValue({
            tools: [{ name: "search", description: "Search" }],
          }),
        },
      },
    };

    const tools = await discoverTools(session, null);
    expect(tools).toEqual([{ name: "search", description: "Search" }]);
  });

  it("returns tools from session.listTools when rpc methods are unsupported", async () => {
    const session = {
      rpc: { tools: { list: vi.fn().mockRejectedValue(new Error("Method not found")) } },
      listTools: vi.fn().mockResolvedValue([{ name: "read", description: "Read" }]),
    };

    const tools = await discoverTools(session, null);
    expect(tools).toEqual([{ name: "read", description: "Read" }]);
  });

  it("falls through transport-not-available TypeErrors", async () => {
    const session = {
      rpc: { tools: { list: () => { throw new TypeError("rpc.tools.list is not a function"); } } },
      listTools: vi.fn().mockResolvedValue([{ name: "deploy", description: "Deploy" }]),
    };

    const tools = await discoverTools(session, null);
    expect(tools).toEqual([{ name: "deploy", description: "Deploy" }]);
  });

  it("rethrows real RPC failures so callers see them", async () => {
    const session = {
      rpc: { tools: { list: vi.fn().mockRejectedValue(new Error("network exploded")) } },
    };

    await expect(discoverTools(session, null)).rejects.toThrow("network exploded");
  });

  it("returns empty array when all transports report unsupported", async () => {
    const session = {
      rpc: { tools: { list: vi.fn().mockRejectedValue(new Error("Method not found")) } },
      listTools: vi.fn().mockRejectedValue(new Error("not implemented")),
    };

    const tools = await discoverTools(session, null);
    expect(tools).toEqual([]);
  });

  it("returns empty array for null session and client", async () => {
    const tools = await discoverTools(null, null);
    expect(tools).toEqual([]);
  });

  it("skips empty results and tries next strategy", async () => {
    const session = {
      rpc: { tools: { list: vi.fn().mockResolvedValue({ tools: [] }) } },
      listTools: vi.fn().mockResolvedValue([{ name: "edit", description: "Edit" }]),
    };

    const tools = await discoverTools(session, null);
    expect(tools).toEqual([{ name: "edit", description: "Edit" }]);
  });

  it("normalizes raw tool data from the SDK", async () => {
    const session = {
      rpc: {
        tools: {
          list: vi.fn().mockResolvedValue({
            tools: [
              {
                name: "query-docs",
                namespacedName: "context7/query-docs",
                description: "Query documentation",
              },
            ],
          }),
        },
      },
    };

    const tools = await discoverTools(session, null);
    expect(tools).toEqual([
      {
        name: "query-docs",
        namespacedName: "context7/query-docs",
        description: "Query documentation",
      },
    ]);
  });

  it("filters out tools that fail normalization", async () => {
    const session = {
      rpc: {
        tools: {
          list: vi.fn().mockResolvedValue({
            tools: [
              { name: "valid", description: "Valid tool" },
              { description: "No name tool" },
            ],
          }),
        },
      },
    };

    const tools = await discoverTools(session, null);
    expect(tools).toEqual([{ name: "valid", description: "Valid tool" }]);
  });

  it("handles session.listTools() returning a plain array", async () => {
    const session = {
      tools: vi.fn().mockResolvedValue([{ name: "ignored", description: "Ignored" }]),
      listTools: vi.fn().mockResolvedValue([{ name: "plan", description: "Plan" }]),
    };

    const tools = await discoverTools(session, null);
    expect(tools).toEqual([{ name: "plan", description: "Plan" }]);
  });
});
