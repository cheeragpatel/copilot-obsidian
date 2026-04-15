export const PLUGIN_ID = "github-copilot";
export const COPILOT_CHAT_VIEW_TYPE = "copilot-chat-view";

export enum ChatMode {
  Ask = "ask",
  Agent = "agent",
}

export const DEFAULT_MODEL = "claude-sonnet-4.6";

export const AVAILABLE_MODELS = [
  "claude-sonnet-4.6",
  "claude-opus-4.6",
  "claude-sonnet-4.5",
  "claude-opus-4.5",
  "claude-haiku-4.5",
  "gpt-5.1",
  "gpt-5.1-codex",
  "gpt-5.1-codex-mini",
  "gpt-4.1",
  "gpt-4.1-mini",
  "gpt-4o",
  "o4-mini",
  "o3",
  "gemini-2.5-pro",
  "gemini-2.5-flash",
] as const;

export type ModelName = (typeof AVAILABLE_MODELS)[number] | string;
