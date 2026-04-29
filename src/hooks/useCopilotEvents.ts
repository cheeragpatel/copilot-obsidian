import { useEffect } from "react";
import { useChatStore, generateId } from "../store/chatStore";
import { friendlyError } from "./friendlyError";
import type { CopilotPluginContext } from "../views/CopilotChatView";

interface SaveConversation {
  (): Promise<void> | void;
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
          const result =
            typeof event.data?.result === "string"
              ? event.data.result
              : JSON.stringify(event.data?.result);
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
        case "session.error":
          setError(friendlyError(event.data?.message || "An error occurred"));
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
    mergeDiscoveredMCPTool,
    saveConversation,
    setError,
    setLastMessageStreaming,
    setLoading,
    updateToolCall,
  ]);
}
