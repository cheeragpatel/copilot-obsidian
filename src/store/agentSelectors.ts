import type { CustomAgentEntry } from "../types/settings";

/**
 * Build the merged, deduped, sorted list of agents shown in pickers and
 * autocomplete. Settings-configured agents take precedence over discovered
 * agents when names collide. Disabled settings agents are excluded.
 */
export function getAvailableAgents(
  settingsAgents: readonly CustomAgentEntry[] | undefined | null,
  discoveredAgents: readonly CustomAgentEntry[] | undefined | null,
): CustomAgentEntry[] {
  const byName = new Map<string, CustomAgentEntry>();

  for (const agent of settingsAgents || []) {
    if (!agent || !agent.name) continue;
    if (agent.enabled === false) continue;
    byName.set(agent.name, agent);
  }

  for (const agent of discoveredAgents || []) {
    if (!agent || !agent.name) continue;
    if (byName.has(agent.name)) continue;
    byName.set(agent.name, agent);
  }

  return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
}
