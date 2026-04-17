import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatHeader } from "./ChatHeader";
import { renderWithContext } from "./testUtils";

describe("ChatHeader", () => {
  it("renders the title, history button, and new conversation button", () => {
    renderWithContext(
      <ChatHeader onNewConversation={vi.fn()} onHistoryClick={vi.fn()} />,
    );

    expect(screen.getByText("Copilot")).toBeInTheDocument();
    expect(screen.getByTitle("Conversation history")).toBeInTheDocument();
    expect(screen.getByTitle("New conversation")).toBeInTheDocument();
  });

  it("calls the callback when the new conversation button is clicked", async () => {
    const user = userEvent.setup();
    const onNewConversation = vi.fn();

    renderWithContext(
      <ChatHeader onNewConversation={onNewConversation} onHistoryClick={vi.fn()} />,
    );

    await user.click(screen.getByTitle("New conversation"));

    expect(onNewConversation).toHaveBeenCalledTimes(1);
  });

  it("calls the callback when the history button is clicked", async () => {
    const user = userEvent.setup();
    const onHistoryClick = vi.fn();

    renderWithContext(
      <ChatHeader onNewConversation={vi.fn()} onHistoryClick={onHistoryClick} />,
    );

    await user.click(screen.getByTitle("Conversation history"));

    expect(onHistoryClick).toHaveBeenCalledTimes(1);
  });

  it("exposes accessible names on icon-only buttons", () => {
    renderWithContext(
      <ChatHeader onNewConversation={vi.fn()} onHistoryClick={vi.fn()} />,
    );

    expect(screen.getByRole("button", { name: "New conversation" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Conversation history" })).toBeInTheDocument();
  });

  it("exposes connection status as a live region", () => {
    renderWithContext(
      <ChatHeader onNewConversation={vi.fn()} onHistoryClick={vi.fn()} isConnected />,
    );

    expect(screen.getByRole("status", { name: "Connected" })).toBeInTheDocument();
  });
});
