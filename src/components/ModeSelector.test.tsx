import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatMode } from "../types/constants";
import { ModeSelector } from "./ModeSelector";

describe("ModeSelector", () => {
  it("renders a dropdown with Ask and Agent options", () => {
    render(
      <ModeSelector currentMode={ChatMode.Ask} onModeChange={vi.fn()} />,
    );

    const select = screen.getByRole("combobox");
    expect(select).toHaveValue(ChatMode.Ask);
    expect(screen.getByRole("option", { name: "Ask" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Agent" })).toBeInTheDocument();
  });

  it("calls onModeChange when switching to Agent", async () => {
    const user = userEvent.setup();
    const onModeChange = vi.fn();

    render(
      <ModeSelector currentMode={ChatMode.Ask} onModeChange={onModeChange} />,
    );

    await user.selectOptions(screen.getByRole("combobox"), ChatMode.Agent);

    expect(onModeChange).toHaveBeenCalledWith(ChatMode.Agent);
  });

  it("calls onModeChange when switching to Ask", async () => {
    const user = userEvent.setup();
    const onModeChange = vi.fn();

    render(
      <ModeSelector currentMode={ChatMode.Agent} onModeChange={onModeChange} />,
    );

    await user.selectOptions(screen.getByRole("combobox"), ChatMode.Ask);

    expect(onModeChange).toHaveBeenCalledWith(ChatMode.Ask);
  });
});
