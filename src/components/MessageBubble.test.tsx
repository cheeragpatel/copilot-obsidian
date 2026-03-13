import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ChatMessage } from "../types/chat";
import { MessageBubble } from "./MessageBubble";

function createMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "message-1",
    role: "assistant",
    content: "Hello from Copilot",
    timestamp: 1,
    isStreaming: false,
    ...overrides,
  };
}

describe("MessageBubble", () => {
  it('renders a user message with the "You" label', () => {
    render(
      <MessageBubble
        message={createMessage({ role: "user", content: "My note summary" })}
      />,
    );

    expect(screen.getByText("You")).toBeInTheDocument();
    expect(screen.getByText("My note summary")).toBeInTheDocument();
  });

  it('renders an assistant message with the "Copilot" label and markdown content', () => {
    render(<MessageBubble message={createMessage({ content: "**Bold** text" })} />);

    expect(screen.getByText("Copilot")).toBeInTheDocument();
    expect(screen.getByTestId("markdown")).toHaveTextContent("**Bold** text");
    expect(screen.getByTitle("Copy message")).toBeInTheDocument();
  });

  it("copies the message content and shows a success indicator", async () => {
    const user = userEvent.setup();
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined);

    render(<MessageBubble message={createMessage({ content: "Copy me" })} />);

    await user.click(screen.getByTitle("Copy message"));

    expect(writeText).toHaveBeenCalledWith("Copy me");
    expect(screen.getByTitle("Copied!")).toHaveTextContent("✓");
  });

  it("does not render markdown when the content is empty", () => {
    render(<MessageBubble message={createMessage({ content: "" })} />);

    expect(screen.queryByTestId("markdown")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Copy message")).not.toBeInTheDocument();
  });

  it("shows the streaming cursor when the message is streaming", () => {
    const { container } = render(
      <MessageBubble message={createMessage({ content: "", isStreaming: true })} />,
    );

    expect(container.querySelector(".copilot-streaming-cursor")).toBeInTheDocument();
  });

  it("shows tool calls when they are present", () => {
    render(
      <MessageBubble
        message={
          createMessage({
            toolCalls: [
              { name: "searchVault", status: "running" },
              { name: "openNote", status: "complete" },
            ],
          })
        }
      />,
    );

    expect(screen.getByText("searchVault")).toBeInTheDocument();
    expect(screen.getByText("openNote")).toBeInTheDocument();
  });

  it("displays the custom agent name when set", () => {
    render(<MessageBubble message={createMessage({ agentName: "writer" })} />);

    expect(screen.getByText("@writer")).toBeInTheDocument();
    expect(screen.queryByText("Copilot")).not.toBeInTheDocument();
  });
});
