import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatMode } from "../types/constants";
import { ModeSelector } from "./ModeSelector";

describe("ModeSelector", () => {
  it("renders Ask and Agent buttons and marks the active mode", () => {
    render(
      <ModeSelector currentMode={ChatMode.Ask} onModeChange={vi.fn()} />,
    );

    expect(screen.getByRole("button", { name: "Ask" })).toHaveClass("active");
    expect(screen.getByRole("button", { name: "Agent" })).not.toHaveClass(
      "active",
    );
  });

  it("calls onModeChange when the Agent button is clicked", async () => {
    const user = userEvent.setup();
    const onModeChange = vi.fn();

    render(
      <ModeSelector currentMode={ChatMode.Ask} onModeChange={onModeChange} />,
    );

    await user.click(screen.getByRole("button", { name: "Agent" }));

    expect(onModeChange).toHaveBeenCalledWith(ChatMode.Agent);
  });

  it("calls onModeChange when the Ask button is clicked", async () => {
    const user = userEvent.setup();
    const onModeChange = vi.fn();

    render(
      <ModeSelector currentMode={ChatMode.Agent} onModeChange={onModeChange} />,
    );

    await user.click(screen.getByRole("button", { name: "Ask" }));

    expect(onModeChange).toHaveBeenCalledWith(ChatMode.Ask);
  });
});
