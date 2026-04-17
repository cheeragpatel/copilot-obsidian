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

export function parseToolName(raw: string): { serverName: string | undefined; toolName: string } {
  if (raw.includes("/")) {
    const slashIndex = raw.indexOf("/");
    return {
      serverName: raw.slice(0, slashIndex),
      toolName: raw.slice(slashIndex + 1),
    };
  }

  if (raw.includes("_")) {
    const underscoreIndex = raw.indexOf("_");
    return {
      serverName: raw.slice(0, underscoreIndex),
      toolName: raw.slice(underscoreIndex + 1),
    };
  }

  return { serverName: undefined, toolName: raw };
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

export async function discoverTools(session: any, client: any): Promise<DiscoveredTool[]> {
  const lookups: Array<() => any> = [
    // Server-scoped RPC exposes the full tool list (including MCP tools with namespacedName).
    // This is where tools.list actually lives in the real SDK — the session RPC only handles
    // pending tool calls.
    () => client?.rpc?.tools?.list?.({}),
    () => session?.rpc?.tools?.list?.({}),
    () => session?.listTools?.(),
    () => session?.getTools?.(),
    () => session?.tools?.(),
    () => client?.listTools?.(),
    () => client?.getTools?.(),
    () => client?.tools?.(),
  ];

  for (const lookup of lookups) {
    try {
      const result = await lookup();
      const tools = Array.isArray(result)
        ? result
        : Array.isArray(result?.tools)
          ? result.tools
          : [];

      if (tools.length > 0) {
        return tools
          .map((t: any) => normalizeToolInfo(t))
          .filter((t: DiscoveredTool | null): t is DiscoveredTool => t !== null);
      }
    } catch {
      // Try the next lookup strategy
    }
  }

  return [];
}
