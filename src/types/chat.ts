import type { MCPServerEntry } from "./settings";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  isStreaming: boolean;
  toolCalls?: ToolCallInfo[];
  attachments?: FileAttachment[];
  agentName?: string;
}

export interface ToolCallInfo {
  id: string;
  name: string;
  status: "running" | "complete" | "error";
  result?: string;
}

export interface FileAttachment {
  path: string;
  name: string;
  type: string;
}

export interface ConversationMeta {
  sessionId: string;
  title: string;
  model: string;
  messageCount: number;
  lastUpdated: number;
}

export interface MCPToolInfo {
  name: string;
  description?: string;
  enabled: boolean;
}

export interface MCPServerState {
  server: MCPServerEntry;
  enabled: boolean;
  tools: MCPToolInfo[];
  source: "settings" | "vault" | "home";
}

/** Represents a pending permission request shown inline in the chat. */
export interface PendingPermission {
  id: string;
  kind: string;
  details: Record<string, unknown>;
  resolve: (result: { kind: "approved" } | { kind: "denied-by-rules"; rules: unknown[] }) => void;
}
