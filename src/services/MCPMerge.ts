import type { MCPServerEntry } from "../types/settings";
import type { MCPServerState } from "../types/chat";

export function mergeMCPServers(
  settingsServers: MCPServerEntry[] = [],
  discoveredServers: MCPServerEntry[] = [],
  existingServers: MCPServerState[] = [],
): MCPServerState[] {
  const merged: MCPServerState[] = [];
  const seen = new Set<string>();
  const existingByName = new Map(existingServers.map((server) => [server.server.name, server]));

  const appendServer = (server: MCPServerEntry, fallbackSource: MCPServerState["source"]) => {
    if (seen.has(server.name)) return;
    seen.add(server.name);

    const existing = existingByName.get(server.name);
    const enabled = existing?.enabled ?? server.enabled;
    const source = server.source || fallbackSource;

    const configuredTools = server.configTools && !server.configTools.includes("*")
      ? server.configTools.map((name) => ({ name, enabled: true }))
      : [];

    merged.push({
      server: { ...server, enabled, source },
      enabled,
      tools: existing?.tools.map((tool) => ({ ...tool })) || configuredTools,
      source,
    });
  };

  for (const server of settingsServers) {
    appendServer(server, "settings");
  }

  for (const server of discoveredServers) {
    appendServer(server, server.source || "vault");
  }

  return merged;
}
