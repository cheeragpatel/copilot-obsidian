import { render, screen } from "@testing-library/react";
import type { ChatMessage } from "../types/chat";
import { MessageList } from "./MessageList";

const messages: ChatMessage[] = [
  {
    id: "user-1",
    role: "user",
    content: "First question",
    timestamp: 1,
    isStreaming: false,
  },
  {
    id: "assistant-1",
    role: "assistant",
    content: "First answer",
    timestamp: 2,
    isStreaming: false,
  },
];

describe("MessageList", () => {
  it("renders all messages", () => {
    render(<MessageList messages={messages} />);

    expect(screen.getByText("First question")).toBeInTheDocument();
    expect(screen.getByText("First answer")).toBeInTheDocument();
  });

  it("renders empty when there are no messages", () => {
    const { container } = render(<MessageList messages={[]} />);

    expect(container.querySelectorAll(".copilot-message")).toHaveLength(0);
  });
});
