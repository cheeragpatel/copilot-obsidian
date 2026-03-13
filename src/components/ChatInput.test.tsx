import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { ChatInput } from "./ChatInput";
import { renderWithContext } from "./testUtils";

function renderChatInput(overrides: Parameters<typeof renderWithContext>[1] = {}) {
  return renderWithContext(
    <ChatInput onSend={vi.fn()} onAbort={vi.fn()} isLoading={false} />,
    overrides,
  );
}

describe("ChatInput", () => {
  it("renders the textarea and send button", () => {
    renderChatInput();

    expect(screen.getByRole("textbox")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument();
  });

  it("disables the send button when the input is empty", () => {
    renderChatInput();

    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  it("sends the message on Enter and clears the input", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();

    renderWithContext(<ChatInput onSend={onSend} onAbort={vi.fn()} isLoading={false} />);

    const textarea = screen.getByRole("textbox");
    await user.type(textarea, "Hello Copilot{enter}");

    expect(onSend).toHaveBeenCalledWith("Hello Copilot");
    expect(textarea).toHaveValue("");
  });

  it("adds a newline on Shift+Enter without sending", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();

    renderWithContext(<ChatInput onSend={onSend} onAbort={vi.fn()} isLoading={false} />);

    const textarea = screen.getByRole("textbox");
    await user.type(textarea, "Hello");
    await user.keyboard("{Shift>}{Enter}{/Shift}world");

    expect(onSend).not.toHaveBeenCalled();
    expect(textarea).toHaveValue("Hello\nworld");
  });

  it("shows a Stop button and disables the textarea while loading", async () => {
    const user = userEvent.setup();
    const onAbort = vi.fn();

    renderWithContext(<ChatInput onSend={vi.fn()} onAbort={onAbort} isLoading />);

    expect(screen.getByRole("textbox")).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Stop" }));

    expect(onAbort).toHaveBeenCalledTimes(1);
  });

  it("shows the autocomplete popup when typing a slash command", async () => {
    const user = userEvent.setup();
    renderChatInput();

    await user.type(screen.getByRole("textbox"), "/");

    expect(screen.getByText("/explain")).toBeInTheDocument();
    expect(screen.getByText("/summarize")).toBeInTheDocument();
  });

  it("hides autocomplete when the input is cleared", async () => {
    const user = userEvent.setup();
    renderChatInput();

    const textarea = screen.getByRole("textbox");
    await user.type(textarea, "/");
    expect(screen.getByText("/explain")).toBeInTheDocument();

    await user.clear(textarea);

    expect(screen.queryByText("/explain")).not.toBeInTheDocument();
  });

  it("shows @agent autocomplete", async () => {
    const user = userEvent.setup();
    renderChatInput({
      settings: {
        customAgents: [
          {
            name: "code-review",
            displayName: "Code Review",
            description: "Review code changes",
            prompt: "",
            enabled: true,
          },
        ],
      },
    });

    await user.type(screen.getByRole("textbox"), "@code-");

    expect(screen.getByText("@code-review")).toBeInTheDocument();
    expect(screen.getByText("Review code changes")).toBeInTheDocument();
  });
});
