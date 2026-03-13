export const PLUGIN_ID = "github-copilot-for-obsidian";
export const COPILOT_CHAT_VIEW_TYPE = "copilot-chat-view";

export enum ChatMode {
  Ask = "ask",
  Agent = "agent",
}

export const DEFAULT_MODEL = "gpt-4.1";

export const AVAILABLE_MODELS = [
  "gpt-4.1",
  "gpt-4o",
  "gpt-4.1-mini",
  "claude-sonnet-4.5",
  "claude-sonnet-4",
  "o4-mini",
] as const;

export type ModelName = (typeof AVAILABLE_MODELS)[number] | string;
