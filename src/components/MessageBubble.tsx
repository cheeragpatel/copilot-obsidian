import * as React from "react";
import { useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import type { ChatMessage } from "../types/chat";
import { ToolExecutionIndicator } from "./ToolExecutionIndicator";

interface MessageBubbleProps {
  message: ChatMessage;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [message.content]);

  const isUser = message.role === "user";
  const isThinking = !isUser && message.isStreaming && !message.content;
  const isDone = !isUser && !message.isStreaming && message.content;

  return (
    <div className="copilot-message">
      <div className="copilot-message-header">
        <div className="copilot-message-icon">
          {isUser ? "👤" : "🤖"}
        </div>
        <span className="copilot-message-role">
          {isUser ? "You" : message.agentName ? `@${message.agentName}` : "Copilot"}
        </span>
        {isThinking && (
          <span className="copilot-thinking-badge">thinking…</span>
        )}
        {isDone && (
          <span className="copilot-done-badge">✓</span>
        )}
        {!isUser && message.content && (
          <button
            className="copilot-message-copy-btn"
            onClick={handleCopy}
            title={copied ? "Copied!" : "Copy message"}
          >
            {copied ? "✓" : "📋"}
          </button>
        )}
      </div>

      {message.toolCalls && message.toolCalls.length > 0 && (
        <ToolExecutionIndicator toolCalls={message.toolCalls} />
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
            remarkPlugins={[remarkGfm]}
            components={{
              code({ node, className, children, ...props }: any) {
                const match = /language-(\w+)/.exec(className || "");
                const inline = !match && !className;
                return !inline ? (
                  <SyntaxHighlighter
                    language={match ? match[1] : "text"}
                    PreTag="div"
                    {...props}
                  >
                    {String(children).replace(/\n$/, "")}
                  </SyntaxHighlighter>
                ) : (
                  <code className={className} {...props}>
                    {children}
                  </code>
                );
              },
            }}
          >
            {message.content}
          </ReactMarkdown>
        ) : null}
        {message.isStreaming && message.content && <span className="copilot-streaming-cursor" />}
      </div>
    </div>
  );
};
