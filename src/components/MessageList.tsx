import * as React from "react";
import { useEffect, useRef, useState, useCallback } from "react";
import type { ChatMessage } from "../types/chat";
import { MessageBubble } from "./MessageBubble";
import { PermissionPromptInline } from "./PermissionPromptInline";

interface MessageListProps {
  messages: ChatMessage[];
}

const SCROLL_THRESHOLD = 100; // px from bottom to consider "near bottom"

const MessageListImpl: React.FC<MessageListProps> = ({ messages }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [showJumpBtn, setShowJumpBtn] = useState(false);

  const checkScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < SCROLL_THRESHOLD;
    // Only update state when the value actually changes — this avoids wasted
    // renders during streaming when the user keeps scrolling at the bottom.
    setIsNearBottom((prev) => (prev === nearBottom ? prev : nearBottom));
    setShowJumpBtn((prev) => (prev === !nearBottom ? prev : !nearBottom));
  }, []);

  useEffect(() => {
    if (!isNearBottom) return;
    // Coalesce streaming-driven scrolls into the next animation frame and
    // use instant scrolling — smooth scroll on every delta causes jank.
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      bottomRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
    });
  }, [messages, isNearBottom]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

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
      <PermissionPromptInline />
      <div ref={bottomRef} />
      {showJumpBtn && (
        <button className="copilot-jump-bottom-btn" onClick={jumpToBottom} title="Jump to bottom">
          ↓
        </button>
      )}
    </div>
  );
};

export const MessageList = React.memo(MessageListImpl);
