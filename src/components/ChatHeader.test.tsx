import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatHeader } from "./ChatHeader";
import { renderWithContext } from "./testUtils";

describe("ChatHeader", () => {
  it("renders the title and new conversation button", () => {
    renderWithContext(
      <ChatHeader onNewConversation={vi.fn()} />,
    );

    expect(screen.getByText("Copilot")).toBeInTheDocument();
    expect(screen.getByTitle("New conversation")).toBeInTheDocument();
  });

  it("calls the callback when the new conversation button is clicked", async () => {
    const user = userEvent.setup();
    const onNewConversation = vi.fn();

    renderWithContext(
      <ChatHeader onNewConversation={onNewConversation} />,
    );

    await user.click(screen.getByTitle("New conversation"));

    expect(onNewConversation).toHaveBeenCalledTimes(1);
  });
});
