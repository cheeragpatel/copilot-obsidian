import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as Obsidian from "obsidian";
import type { ChatMessage } from "../types/chat";
import { renderWithContext } from "./testUtils";
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
  it('renders a user message with the "You" label using markdown rendering', () => {
    render(
      <MessageBubble
        message={createMessage({ role: "user", content: "**My** note summary" })}
      />,
    );

    expect(screen.getByText("You")).toBeInTheDocument();
    expect(screen.getByTestId("markdown")).toHaveTextContent("**My** note summary");
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

  it("inserts assistant content into the active note", async () => {
    const user = userEvent.setup();
    const replaceSelection = vi.fn();

    renderWithContext(<MessageBubble message={createMessage({ content: "Insert me" })} />, {
      app: {
        workspace: {
          getActiveFile: vi.fn().mockReturnValue({ path: "Note.md" }),
          activeEditor: {
            editor: {
              replaceSelection,
            },
          },
        },
      },
    });

    await user.click(screen.getByTitle("Insert into note"));

    expect(replaceSelection).toHaveBeenCalledWith("Insert me");
  });

  it("shows a notice when there is no active note to insert into", async () => {
    const user = userEvent.setup();
    const noticeSpy = vi.spyOn(Obsidian, "Notice");

    renderWithContext(<MessageBubble message={createMessage({ content: "Insert me" })} />, {
      app: {
        workspace: {
          getActiveFile: vi.fn().mockReturnValue(null),
          activeEditor: undefined,
        },
      },
    });

    await user.click(screen.getByTitle("Insert into note"));

    expect(noticeSpy).toHaveBeenCalledWith("Open a note first");
  });

  it("does not render markdown when the content is empty", () => {
    render(<MessageBubble message={createMessage({ content: "" })} />);

    expect(screen.queryByTestId("markdown")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Copy message")).not.toBeInTheDocument();
  });

  it("shows the streaming cursor when the message is streaming with content", () => {
    const { container } = render(
      <MessageBubble message={createMessage({ content: "Hello", isStreaming: true })} />,
    );

    expect(container.querySelector(".copilot-streaming-cursor")).toBeInTheDocument();
  });

  it("shows thinking dots when streaming with no content yet", () => {
    const { container } = render(
      <MessageBubble message={createMessage({ content: "", isStreaming: true })} />,
    );

    expect(container.querySelector(".copilot-thinking-dots")).toBeInTheDocument();
    expect(container.querySelector(".copilot-streaming-cursor")).not.toBeInTheDocument();
  });

  it("shows tool calls when they are present", () => {
    render(
      <MessageBubble
        message={
          createMessage({
            toolCalls: [
              { id: "tc1", name: "searchVault", status: "running" },
              { id: "tc2", name: "openNote", status: "complete" },
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

  it("handles clipboard write failure gracefully", async () => {
    const user = userEvent.setup();
    const noticeSpy = vi.spyOn(Obsidian, "Notice");
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValueOnce(new Error("Clipboard denied"));

    render(<MessageBubble message={createMessage({ content: "Copy me" })} />);

    // Should not throw when clipboard fails
    await expect(
      user.click(screen.getByTitle("Copy message")),
    ).resolves.toBeUndefined();
  });

});
