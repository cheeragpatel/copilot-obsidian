import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatInput } from "./ChatInput";

describe("ChatInput", () => {
  it("renders the textarea and send button", () => {
    render(<ChatInput onSend={vi.fn()} onAbort={vi.fn()} isLoading={false} />);

    expect(screen.getByRole("textbox")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument();
  });

  it("disables the send button when the input is empty", () => {
    render(<ChatInput onSend={vi.fn()} onAbort={vi.fn()} isLoading={false} />);

    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  it("sends the message on Enter and clears the input", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();

    render(<ChatInput onSend={onSend} onAbort={vi.fn()} isLoading={false} />);

    const textarea = screen.getByRole("textbox");
    await user.type(textarea, "Hello Copilot{enter}");

    expect(onSend).toHaveBeenCalledWith("Hello Copilot");
    expect(textarea).toHaveValue("");
  });

  it("adds a newline on Shift+Enter without sending", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();

    render(<ChatInput onSend={onSend} onAbort={vi.fn()} isLoading={false} />);

    const textarea = screen.getByRole("textbox");
    await user.type(textarea, "Hello");
    await user.keyboard("{Shift>}{Enter}{/Shift}world");

    expect(onSend).not.toHaveBeenCalled();
    expect(textarea).toHaveValue("Hello\nworld");
  });

  it("shows a Stop button and disables the textarea while loading", async () => {
    const user = userEvent.setup();
    const onAbort = vi.fn();

    render(<ChatInput onSend={vi.fn()} onAbort={onAbort} isLoading />);

    expect(screen.getByRole("textbox")).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Stop" }));

    expect(onAbort).toHaveBeenCalledTimes(1);
  });
});
