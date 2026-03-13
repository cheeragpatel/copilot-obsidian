import { vi } from "vitest";

vi.mock("../tools/vaultTools", () => ({
  createVaultTools: vi.fn().mockReturnValue([]),
}));

import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useChatStore } from "../store/chatStore";
import type { ChatMessage } from "../types/chat";
import { ChatMode } from "../types/constants";
import { CopilotChatPanel } from "./CopilotChatPanel";
import { mockService, renderWithContext } from "./testUtils";

async function renderPanel(overrides?: Parameters<typeof renderWithContext>[1]) {
  const view = renderWithContext(<CopilotChatPanel />, overrides);
  await waitFor(() => expect(mockService.initialize).toHaveBeenCalled());
  return view;
}

describe("CopilotChatPanel", () => {
  it("renders in the initial state with the empty state", async () => {
    await renderPanel();

    expect(screen.getByText("GitHub Copilot for Obsidian")).toBeInTheDocument();
    expect(mockService.createSession).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gpt-4.1", mode: "ask" }),
    );
  });

  it("renders the message list when messages exist", async () => {
    const messages: ChatMessage[] = [
      {
        id: "message-1",
        role: "user",
        content: "Existing message",
        timestamp: 1,
        isStreaming: false,
      },
    ];
    useChatStore.setState({ messages });

    await renderPanel();

    expect(screen.getByText("Existing message")).toBeInTheDocument();
    expect(screen.queryByText("GitHub Copilot for Obsidian")).not.toBeInTheDocument();
  });

  it("shows an error banner and clears it when dismissed", async () => {
    const user = userEvent.setup();
    useChatStore.setState({ error: "Something went wrong" });

    await renderPanel();

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "×" }));

    await waitFor(() => {
      expect(screen.queryByText("Something went wrong")).not.toBeInTheDocument();
    });
    expect(useChatStore.getState().error).toBeNull();
  });

  it("sends a message on user input", async () => {
    const user = userEvent.setup();
    await renderPanel();

    await user.type(screen.getByRole("textbox"), "Hello Copilot");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(mockService.sendMessage).toHaveBeenCalledWith("Hello Copilot");
    });

    expect(useChatStore.getState().messages).toHaveLength(2);
    expect(useChatStore.getState().messages[0]).toMatchObject({
      role: "user",
      content: "Hello Copilot",
    });
    expect(useChatStore.getState().messages[1]).toMatchObject({
      role: "assistant",
      content: "",
      isStreaming: true,
    });
  });

  it("switches modes and updates the store", async () => {
    const user = userEvent.setup();

    await renderPanel();
    await user.click(screen.getByRole("button", { name: "Agent" }));

    await waitFor(() => {
      expect(mockService.switchMode).toHaveBeenCalledWith(ChatMode.Agent, []);
    });

    expect(useChatStore.getState().currentMode).toBe(ChatMode.Agent);
    expect(screen.getByRole("button", { name: "Agent" })).toHaveClass("active");
  });

  it("calls abort from the stop button and resets loading state", async () => {
    const user = userEvent.setup();
    const messages: ChatMessage[] = [
      {
        id: "message-1",
        role: "assistant",
        content: "Thinking...",
        timestamp: 1,
        isStreaming: true,
      },
    ];
    useChatStore.setState({ isLoading: true, messages });

    await renderPanel();
    await user.click(screen.getByRole("button", { name: "Stop" }));

    await waitFor(() => {
      expect(mockService.abort).toHaveBeenCalledTimes(1);
    });
    expect(useChatStore.getState().isLoading).toBe(false);
    expect(useChatStore.getState().messages[0]).toMatchObject({
      isStreaming: false,
    });
  });
});
