import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useChatStore } from "../store/chatStore";
import { ChatMode } from "../types/constants";
import type { CustomAgentEntry } from "../types/settings";
import { ChatHeader } from "./ChatHeader";
import { renderWithContext } from "./testUtils";

function createAgent(name: string, enabled = true): CustomAgentEntry {
  return {
    name,
    displayName: name,
    description: `${name} description`,
    prompt: `${name} prompt`,
    enabled,
  };
}

describe("ChatHeader", () => {
  it("renders the title, new conversation button, mode selector, and model selector", () => {
    renderWithContext(
      <ChatHeader onNewConversation={vi.fn()} onModeSwitch={vi.fn()} />,
    );

    expect(screen.getByText("Copilot")).toBeInTheDocument();
    expect(screen.getByTitle("New conversation")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ask" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Agent" })).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("calls the callback when the new conversation button is clicked", async () => {
    const user = userEvent.setup();
    const onNewConversation = vi.fn();

    renderWithContext(
      <ChatHeader
        onNewConversation={onNewConversation}
        onModeSwitch={vi.fn()}
      />,
    );

    await user.click(screen.getByTitle("New conversation"));

    expect(onNewConversation).toHaveBeenCalledTimes(1);
  });

  it("does not render the agent picker when there are no custom agents", () => {
    useChatStore.setState({ currentMode: ChatMode.Agent });

    renderWithContext(
      <ChatHeader onNewConversation={vi.fn()} onModeSwitch={vi.fn()} />,
      { settings: { customAgents: [] } },
    );

    expect(screen.getAllByRole("combobox")).toHaveLength(1);
    expect(screen.queryByRole("option", { name: "No agent" })).not.toBeInTheDocument();
  });

  it("renders the agent picker when enabled agents are available", () => {
    useChatStore.setState({ currentMode: ChatMode.Agent });

    renderWithContext(
      <ChatHeader onNewConversation={vi.fn()} onModeSwitch={vi.fn()} />,
      {
        settings: {
          customAgents: [createAgent("writer"), createAgent("reviewer", false)],
        },
      },
    );

    expect(screen.getAllByRole("combobox")).toHaveLength(2);
    expect(screen.getByRole("option", { name: "No agent" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "@writer" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "@reviewer" })).not.toBeInTheDocument();
  });
});
