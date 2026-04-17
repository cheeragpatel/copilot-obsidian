import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ConversationMeta } from "../types/chat";
import { ConversationHistory } from "./ConversationHistory";

const conversations: ConversationMeta[] = [
  {
    sessionId: "session-1",
    title: "Daily notes recap",
    model: "gpt-4.1",
    messageCount: 2,
    lastUpdated: new Date("2024-01-01T00:00:00Z").getTime(),
  },
  {
    sessionId: "session-2",
    title: "Untitled",
    model: "gpt-4o",
    messageCount: 4,
    lastUpdated: new Date("2024-01-02T00:00:00Z").getTime(),
  },
];

describe("ConversationHistory", () => {
  it("renders an empty state when there are no conversations", () => {
    render(
      <ConversationHistory conversations={[]} onSelect={vi.fn()} onClose={vi.fn()} />,
    );

    expect(screen.getByText("No previous conversations")).toBeInTheDocument();
  });

  it("renders conversation items", () => {
    render(
      <ConversationHistory
        conversations={conversations}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("Daily notes recap")).toBeInTheDocument();
    expect(screen.getByText("Untitled")).toBeInTheDocument();
  });

  it("calls onSelect with the sessionId when an item is clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(
      <ConversationHistory
        conversations={conversations}
        onSelect={onSelect}
        onClose={vi.fn()}
      />,
    );

    await user.click(screen.getByText("Daily notes recap"));

    expect(onSelect).toHaveBeenCalledWith("session-1");
  });

  it("calls onClose when the close button is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <ConversationHistory
        conversations={conversations}
        onSelect={vi.fn()}
        onClose={onClose}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Close conversation history" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the overlay is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { container } = render(
      <ConversationHistory
        conversations={conversations}
        onSelect={vi.fn()}
        onClose={onClose}
      />,
    );

    const overlay = container.querySelector(".copilot-conversations-overlay");
    expect(overlay).not.toBeNull();

    await user.click(overlay!);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders the modal with dialog role and aria-modal", () => {
    render(
      <ConversationHistory
        conversations={conversations}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Conversations" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("renders conversation rows as buttons", () => {
    render(
      <ConversationHistory
        conversations={conversations}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const row = screen.getByRole("button", { name: /Daily notes recap/ });
    expect(row.tagName).toBe("BUTTON");
  });

  it("closes when Escape is pressed", () => {
    const onClose = vi.fn();
    render(
      <ConversationHistory
        conversations={conversations}
        onSelect={vi.fn()}
        onClose={onClose}
      />,
    );

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
