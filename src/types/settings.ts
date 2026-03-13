import { ChatMode, DEFAULT_MODEL } from "./constants";

export interface MCPServerEntry {
  name: string;
  type: "http" | "stdio";
  url?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  enabled: boolean;
}

export interface CustomAgentEntry {
  name: string;
  displayName: string;
  description: string;
  prompt: string;
  enabled: boolean;
}

export interface PluginSettings {
  cliPath: string;
  defaultModel: string;
  streaming: boolean;
  openOnStartup: boolean;
  defaultMode: ChatMode;
  mcpServers: MCPServerEntry[];
  customAgents: CustomAgentEntry[];
  skillDirectories: string[];
  disabledSkills: string[];
  excludedTools: string[];
  systemMessage: string;
  logLevel: "debug" | "info" | "warn" | "error";
}

export const DEFAULT_SETTINGS: PluginSettings = {
  cliPath: "copilot",
  defaultModel: DEFAULT_MODEL,
  streaming: true,
  openOnStartup: false,
  defaultMode: ChatMode.Ask,
  mcpServers: [],
  customAgents: [],
  skillDirectories: [],
  disabledSkills: [],
  excludedTools: [],
  systemMessage: "",
  logLevel: "info",
};
