import * as React from "react";
import { useState, useCallback, useMemo, useContext } from "react";
import { Notice } from "obsidian";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import type { ChatMessage } from "../types/chat";
import { PluginContext } from "../views/CopilotChatView";
import { ToolExecutionIndicator } from "./ToolExecutionIndicator";

interface MessageBubbleProps {
  message: ChatMessage;
}

/** Inline copy button for code blocks */
const CodeBlockCopyButton: React.FC<{ code: string }> = ({ code }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      new Notice("Failed to copy to clipboard");
    }
  }, [code]);
  return (
    <button
      className="copilot-code-copy-btn"
      onClick={handleCopy}
      title={copied ? "Copied!" : "Copy code"}
    >
      {copied ? "✓" : "⧉"}
    </button>
  );
};

const MessageBubbleImpl: React.FC<MessageBubbleProps> = ({ message }) => {
  const [copied, setCopied] = useState(false);
  const ctx = useContext(PluginContext);

  // Detect Obsidian dark/light theme
  const isDark = useMemo(() => {
    return document.body.classList.contains("theme-dark");
  }, []);
  const codeTheme = isDark ? oneDark : oneLight;

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      new Notice("Failed to copy to clipboard");
    }
  }, [message.content]);

  const handleInsertIntoNote = useCallback(() => {
    const activeFile = ctx?.app?.workspace.getActiveFile?.();
    const editor = ctx?.app?.workspace.activeEditor?.editor;

    if (!activeFile || !editor) {
      new Notice("Open a note first");
      return;
    }

    editor.replaceSelection(message.content);
  }, [ctx, message.content]);

  // Memoize the markdown components map so ReactMarkdown doesn't see a fresh
  // object every render (which would defeat its internal memoization).
  const markdownComponents = useMemo(
    () => ({
      code({ node, className, children, ...props }: any) {
        const match = /language-(\w+)/.exec(className || "");
        const inline = !match && !className;
        const codeStr = String(children).replace(/\n$/, "");
        return !inline ? (
          <div className="copilot-code-block-wrapper">
            <CodeBlockCopyButton code={codeStr} />
            <SyntaxHighlighter
              language={match ? match[1] : "text"}
              style={codeTheme}
              PreTag="div"
              {...props}
            >
              {codeStr}
            </SyntaxHighlighter>
          </div>
        ) : (
          <code className={className} {...props}>
            {children}
          </code>
        );
      },
    }),
    [codeTheme],
  );

  const remarkPlugins = useMemo(() => [remarkGfm], []);

  const isUser = message.role === "user";
  const isSystem = message.role === "system";
  const isThinking = !isUser && !isSystem && message.isStreaming && !message.content && !message.thinkingContent;
  const isActivelyThinking = !isUser && !isSystem && message.isStreaming && !!message.thinkingContent;
  const isDone = !isUser && !isSystem && !message.isStreaming && message.content;

  if (isSystem) {
    return (
      <div className="copilot-system-message" role="note" aria-label="System message">
        {message.content}
      </div>
    );
  }

  return (
    <div className="copilot-message">
      <div className="copilot-message-header">
        <div className="copilot-message-icon">
          {isUser ? "👤" : "🤖"}
        </div>
        <span className="copilot-message-role">
          {isUser ? "You" : message.agentName ? `@${message.agentName}` : "Copilot"}
        </span>
        {(isThinking || isActivelyThinking) && (
          <span className="copilot-thinking-badge">thinking…</span>
        )}
        {isDone && (
          <span className="copilot-done-badge">✓</span>
        )}
        {!isUser && message.content && (
          <div className="copilot-message-actions">
            <button
              className="copilot-message-copy-btn"
              onClick={handleInsertIntoNote}
              title="Insert into note"
              aria-label="Insert into note"
            >
              📝
            </button>
            <button
              className="copilot-message-copy-btn"
              onClick={handleCopy}
              title={copied ? "Copied!" : "Copy message"}
              aria-label={copied ? "Copied!" : "Copy message"}
            >
              {copied ? "✓" : "📋"}
            </button>
          </div>
        )}
      </div>

      {message.toolCalls && message.toolCalls.length > 0 && (
        <ToolExecutionIndicator toolCalls={message.toolCalls} />
      )}

      {message.thinkingContent && (
        <details className="copilot-thinking-content" open={isActivelyThinking && !message.content}>
          <summary>💭 {isActivelyThinking && !message.content ? "Thinking…" : "Thought process"}</summary>
          <div className="copilot-thinking-text">{message.thinkingContent}</div>
        </details>
      )}

      <div className="copilot-message-body">
        {isThinking && (
          <div className="copilot-thinking-indicator">
            <div className="copilot-thinking-dots">
              <span /><span /><span />
            </div>
          </div>
        )}
        {message.content ? (
          <ReactMarkdown
            remarkPlugins={remarkPlugins}
            components={markdownComponents}
          >
            {message.content}
          </ReactMarkdown>
        ) : null}
        {message.isStreaming && message.content && <span className="copilot-streaming-cursor" />}
      </div>
    </div>
  );
};

export const MessageBubble = React.memo(MessageBubbleImpl);
