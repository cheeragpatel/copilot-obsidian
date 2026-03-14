import * as React from "react";
import { useEffect, useRef, useState, useCallback } from "react";
import type { ChatMessage } from "../types/chat";
import { MessageBubble } from "./MessageBubble";

interface MessageListProps {
  messages: ChatMessage[];
}

const SCROLL_THRESHOLD = 100; // px from bottom to consider "near bottom"

export const MessageList: React.FC<MessageListProps> = ({ messages }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [showJumpBtn, setShowJumpBtn] = useState(false);

  const checkScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < SCROLL_THRESHOLD;
    setIsNearBottom(nearBottom);
    setShowJumpBtn(!nearBottom);
  }, []);

  useEffect(() => {
    if (isNearBottom) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isNearBottom]);

  const jumpToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    setShowJumpBtn(false);
    setIsNearBottom(true);
  }, []);

  return (
    <div className="copilot-message-list" ref={containerRef} onScroll={checkScroll}>
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
      <div ref={bottomRef} />
      {showJumpBtn && (
        <button className="copilot-jump-bottom-btn" onClick={jumpToBottom} title="Jump to bottom">
          ↓
        </button>
      )}
    </div>
  );
};
