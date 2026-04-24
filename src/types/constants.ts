export const PLUGIN_ID = "github-copilot-chat";
export const COPILOT_CHAT_VIEW_TYPE = "copilot-chat-view";

export enum ChatMode {
  Ask = "ask",
  Agent = "agent",
  Autopilot = "autopilot",
}

/** Map a UI ChatMode to the CLI's underlying agent mode. */
export function toCliAgentMode(mode: ChatMode): "interactive" | "autopilot" {
  return mode === ChatMode.Autopilot ? "autopilot" : "interactive";
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

// Workspace events emitted by the plugin so the React panel can react without
// a direct plugin reference (avoids prop-drilling through the view).
export const COPILOT_EVENT_NEW_CONVERSATION = "copilot-chat:new-conversation";
export const COPILOT_EVENT_EXPORT_CONVERSATION = "copilot-chat:export-conversation";
export const COPILOT_EVENT_SEND_PROMPT = "copilot-chat:send-prompt";
