import * as React from "react";
import { useEffect, useRef, useState, useCallback } from "react";
import type { ChatMessage } from "../types/chat";
import { MessageBubble } from "./MessageBubble";
import { PermissionPromptInline } from "./PermissionPromptInline";

interface MessageListProps {
  messages: ChatMessage[];
}

const SCROLL_THRESHOLD = 150; // px from bottom to consider "near bottom"

const MessageListImpl: React.FC<MessageListProps> = ({ messages }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  // Track whether the user explicitly scrolled away (manual scroll up)
  const userScrolledAwayRef = useRef(false);
  const lastScrollTopRef = useRef(0);
  const [showJumpBtn, setShowJumpBtn] = useState(false);

  // Detect whether any message is actively streaming
  const isStreaming = messages.some((m) => m.isStreaming);

  const checkScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = distFromBottom < SCROLL_THRESHOLD;

    // Detect manual scroll UP by comparing with previous scrollTop.
    // If the user scrolled up (scrollTop decreased), mark as scrolled away.
    // If they scroll back near the bottom, clear the flag.
    if (el.scrollTop < lastScrollTopRef.current - 10) {
      userScrolledAwayRef.current = true;
    }
    if (nearBottom) {
      userScrolledAwayRef.current = false;
    }
    lastScrollTopRef.current = el.scrollTop;

    setShowJumpBtn(!nearBottom);
  }, []);

  // Derive a lightweight "content fingerprint" that changes on every delta
  // so the effect re-fires even when the messages array length is stable.
  const lastMsg = messages[messages.length - 1];
  const scrollTrigger = lastMsg
    ? `${messages.length}:${(lastMsg.content?.length ?? 0)}:${(lastMsg.thinkingContent?.length ?? 0)}:${lastMsg.toolCalls?.map((tc) => `${tc.id}:${tc.status}:${tc.result?.length ?? 0}`).join("|") ?? ""}`
    : "0";

  useEffect(() => {
    // Don't autoscroll if user manually scrolled away
    if (userScrolledAwayRef.current) return;

    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      bottomRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
    });
  }, [scrollTrigger, isStreaming]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // When a new user message is added, always scroll to bottom
  const msgCount = messages.length;
  useEffect(() => {
    userScrolledAwayRef.current = false;
    bottomRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
  }, [msgCount]);

  const jumpToBottom = useCallback(() => {
    userScrolledAwayRef.current = false;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    setShowJumpBtn(false);
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
