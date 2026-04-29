import { useEffect } from "react";
import { useChatStore, generateId } from "../store/chatStore";
import { friendlyError } from "./friendlyError";
import type { CopilotPluginContext } from "../views/CopilotChatView";

interface SaveConversation {
  (): Promise<void> | void;
}

function stringifyToolValue(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value === undefined) return undefined;
  return JSON.stringify(value);
}

function toolContentBlockToText(block: any): string | undefined {
  if (!block || typeof block !== "object") return undefined;
  if (typeof block.text === "string") return block.text;
  if (typeof block.resource?.text === "string") return block.resource.text;
  if (typeof block.title === "string" && typeof block.uri === "string") {
    return `${block.title}: ${block.uri}`;
  }
  return undefined;
}

function formatToolResult(data: any): string | undefined {
  const result = data?.result;
  if (typeof result === "string") return result;
  if (result && typeof result === "object") {
    if (typeof result.detailedContent === "string") return result.detailedContent;
    if (typeof result.content === "string") return result.content;
    if (Array.isArray(result.contents)) {
      const text = result.contents
        .map(toolContentBlockToText)
        .filter((part: string | undefined): part is string => !!part)
        .join("\n");
      if (text) return text;
    }
    if (typeof result.error === "string") return result.error;
  }
  return stringifyToolValue(result);
}

function formatToolError(data: any): string {
  const error = data?.error;
  const message =
    (typeof error === "string" && error) ||
    (typeof error?.message === "string" && error.message) ||
    (typeof data?.message === "string" && data.message) ||
    (typeof data?.result?.error === "string" && data.result.error) ||
    formatToolResult(data) ||
    "Tool execution failed";

  const code = typeof error?.code === "string" && error.code ? ` (${error.code})` : "";
  return `${message}${code}`;
}

/**
 * Subscribes to Copilot SDK events and forwards them to the chat store.
 * The handler is intentionally a single big switch — it must stay in sync
 * with the SDK's event vocabulary (`assistant.message_delta`, `tool.*`,
 * `session.*`).
 */
export function useCopilotEvents(
  ctx: CopilotPluginContext | null,
  saveConversation: SaveConversation,
): void {
  const addMessage = useChatStore((s) => s.addMessage);
  const appendToLastAssistantMessage = useChatStore((s) => s.appendToLastAssistantMessage);
  const appendThinkingContent = useChatStore((s) => s.appendThinkingContent);
  const setLastMessageStreaming = useChatStore((s) => s.setLastMessageStreaming);
  const addToolCall = useChatStore((s) => s.addToolCall);
  const addToolCallWithId = useChatStore((s) => s.addToolCallWithId);
  const completeToolCallById = useChatStore((s) => s.completeToolCallById);
  const updateToolCall = useChatStore((s) => s.updateToolCall);
  const completeAllToolCalls = useChatStore((s) => s.completeAllToolCalls);
  const failRunningToolCalls = useChatStore((s) => s.failRunningToolCalls);
  const setLoading = useChatStore((s) => s.setLoading);
  const setError = useChatStore((s) => s.setError);
  const mergeDiscoveredMCPTool = useChatStore((s) => s.mergeDiscoveredMCPTool);

  useEffect(() => {
    if (!ctx) return;

    const unsubscribe = ctx.copilotService.onEvent((event: any) => {
      if (
        (event.type === "session.info" || event.type === "session.warning") &&
        (event.data?.infoType === "mcp" || event.data?.warningType === "mcp")
      ) {
        // eslint-disable-next-line no-console
        console.log("[copilot-obsidian] mcp event:", event.type, event.data);
      }

      switch (event.type) {
        case "assistant.message_delta":
        case "assistant.message.delta": {
          const delta = event.data?.deltaContent || event.data?.content || "";
          const messages = useChatStore.getState().messages;
          const lastMsg = messages[messages.length - 1];
          if (!lastMsg || lastMsg.role !== "assistant" || !lastMsg.isStreaming) {
            addMessage({
              id: generateId(),
              role: "assistant",
              content: delta,
              timestamp: Date.now(),
              isStreaming: true,
              agentName: useChatStore.getState().selectedAgent || undefined,
            });
          } else {
            appendToLastAssistantMessage(delta);
          }
          break;
        }
        case "assistant.thinking_delta":
        case "assistant.thinking.delta": {
          const delta = event.data?.deltaContent || event.data?.content || event.data?.delta || "";
          if (!delta) break;
          const msgs = useChatStore.getState().messages;
          const last = msgs[msgs.length - 1];
          if (!last || last.role !== "assistant" || !last.isStreaming) {
            addMessage({
              id: generateId(),
              role: "assistant",
              content: "",
              timestamp: Date.now(),
              isStreaming: true,
              thinkingContent: delta,
              agentName: useChatStore.getState().selectedAgent || undefined,
            });
          } else {
            appendThinkingContent(delta);
          }
          break;
        }
        case "assistant.thinking_done":
        case "assistant.thinking.done":
          // Thinking phase complete — content continues via message_delta
          break;
        case "assistant.message":
          completeAllToolCalls();
          setLastMessageStreaming(false);
          setLoading(false);
          break;
        case "tool.execution_start":
        case "tool.executionStart": {
          const messages = useChatStore.getState().messages;
          const lastMsg = messages[messages.length - 1];
          if (!lastMsg || lastMsg.role !== "assistant" || !lastMsg.isStreaming) {
            addMessage({
              id: generateId(),
              role: "assistant",
              content: "",
              timestamp: Date.now(),
              isStreaming: true,
              agentName: useChatStore.getState().selectedAgent || undefined,
            });
          }

          const toolName =
            event.data?.mcpToolName || event.data?.name || event.data?.toolName || "tool";
          const toolCallId = event.data?.tool_call_id || event.data?.toolCallId;
          const info = {
            id: toolCallId || generateId(),
            name: toolName,
            status: "running" as const,
          };
          if (toolCallId) {
            addToolCallWithId(info);
          } else {
            addToolCall(info);
          }

          const namespacedName = event.data?.namespacedName || event.data?.name;
          const description = event.data?.description || event.data?.toolDescription || "";
          if (namespacedName) {
            const serverName = namespacedName.split(/[/_]/)[0];
            if (serverName) {
              mergeDiscoveredMCPTool(serverName, { name: toolName, namespacedName, description });
            }
          }
          break;
        }
        case "tool.execution_complete":
        case "tool.executionComplete": {
          const toolCallId = event.data?.tool_call_id || event.data?.toolCallId;
          const success = event.data?.success !== false;
          const result = success ? formatToolResult(event.data) : formatToolError(event.data);
          if (toolCallId) {
            completeToolCallById(toolCallId, success, result);
          } else {
            updateToolCall(
              event.data?.mcpToolName || event.data?.name || event.data?.toolName || "tool",
              success ? "complete" : "error",
              result,
            );
          }
          break;
        }
        case "tool.execution_error":
        case "tool.execution.error": {
          const toolCallId = event.data?.tool_call_id || event.data?.toolCallId;
          const result = formatToolError(event.data);
          if (toolCallId) {
            completeToolCallById(toolCallId, false, result);
          } else {
            updateToolCall(
              event.data?.mcpToolName || event.data?.name || event.data?.toolName || "tool",
              "error",
              result,
            );
          }
          break;
        }
        case "session.error":
          setError(friendlyError(event.data?.message || "An error occurred"));
          failRunningToolCalls(friendlyError(event.data?.message || "An error occurred"));
          setLoading(false);
          break;
        case "session.idle":
          completeAllToolCalls();
          setLoading(false);
          setLastMessageStreaming(false);
          void saveConversation();
          break;
      }
    });

    return () => unsubscribe();
  }, [
    ctx,
    addMessage,
    addToolCall,
    addToolCallWithId,
    appendThinkingContent,
    appendToLastAssistantMessage,
    completeAllToolCalls,
    completeToolCallById,
    failRunningToolCalls,
    mergeDiscoveredMCPTool,
    saveConversation,
    setError,
    setLastMessageStreaming,
    setLoading,
    updateToolCall,
  ]);
}
