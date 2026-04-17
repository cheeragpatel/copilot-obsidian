export interface DiscoveredTool {
  name: string;
  namespacedName?: string;
  description: string;
}

const EVENT_TYPE_MAP: Record<string, string> = {
  "tool.executionStart": "tool.execution_start",
  "tool.executionComplete": "tool.execution_complete",
  "assistant.message.delta": "assistant.message_delta",
};

export function normalizeEventType(type: string): string {
  return EVENT_TYPE_MAP[type] ?? type;
}

export function normalizeToolInfo(
  eventData: any,
): { name: string; namespacedName?: string; description: string } | null {
  if (!eventData) return null;

  const rawName =
    typeof eventData.mcpToolName === "string" ? eventData.mcpToolName
    : typeof eventData.toolName === "string" ? eventData.toolName
    : typeof eventData.name === "string" ? eventData.name
    : undefined;

  const namespacedName =
    typeof eventData.namespacedName === "string" && eventData.namespacedName.trim()
      ? eventData.namespacedName.trim()
      : typeof eventData.mcpServerName === "string" && rawName
        ? `${eventData.mcpServerName}/${rawName}`
        : typeof eventData.serverName === "string" && rawName
          ? `${eventData.serverName}/${rawName}`
          : typeof rawName === "string" && rawName.includes("/")
            ? rawName
            : undefined;

  const name =
    typeof rawName === "string" && rawName.trim() && rawName !== namespacedName
      ? rawName.trim()
      : namespacedName?.includes("/")
        ? namespacedName.split("/").slice(1).join("/")
        : namespacedName?.includes("_")
          ? namespacedName.slice(namespacedName.indexOf("_") + 1)
          : typeof rawName === "string" && rawName.trim()
            ? rawName.trim()
            : undefined;

  if (!name) return null;

  const description =
    typeof eventData.description === "string"
      ? eventData.description
      : typeof eventData.toolDescription === "string"
        ? eventData.toolDescription
        : "";

  return {
    name,
    ...(namespacedName ? { namespacedName } : {}),
    description,
  };
}

/**
 * Returns true for errors that indicate a transport/method is simply not
 * supported by the current SDK build. Real RPC failures (network, validation,
 * timeouts) should bubble up so callers can log and diagnose them.
 */
function isUnsupportedMethodError(error: unknown): boolean {
  if (!error) return true;
  if (error instanceof TypeError) {
    return /is not a function|undefined/i.test(error.message || "");
  }
  const message = (error as { message?: string })?.message || "";
  const code = (error as { code?: string | number })?.code;
  if (code === -32601) return true; // JSON-RPC "Method not found"
  return /method not found|not implemented|unsupported|unknown method/i.test(message);
}

/**
 * Discover tools available to the current session. Tries server-scoped RPC
 * first (where MCP tools are namespaced), then session-scoped RPC, then the
 * session.listTools() helper. Each strategy is tried until one returns a
 * non-empty result. Errors that look like "this transport doesn't expose
 * the method" are swallowed; genuine RPC failures are rethrown so they
 * surface in logs.
 */
export async function discoverTools(session: any, client: any): Promise<DiscoveredTool[]> {
  const strategies: Array<{ name: string; run: () => any }> = [
    { name: "client.rpc.tools.list", run: () => client?.rpc?.tools?.list?.({}) },
    { name: "session.rpc.tools.list", run: () => session?.rpc?.tools?.list?.({}) },
    { name: "session.listTools", run: () => session?.listTools?.() },
  ];

  for (const strategy of strategies) {
    let result: unknown;
    try {
      result = await strategy.run();
    } catch (error) {
      if (isUnsupportedMethodError(error)) {
        continue;
      }
      throw error;
    }

    const tools = Array.isArray(result)
      ? result
      : Array.isArray((result as { tools?: unknown })?.tools)
        ? (result as { tools: unknown[] }).tools
        : [];

    if (tools.length > 0) {
      return tools
        .map((t: any) => normalizeToolInfo(t))
        .filter((t: DiscoveredTool | null): t is DiscoveredTool => t !== null);
    }
  }

  return [];
}
