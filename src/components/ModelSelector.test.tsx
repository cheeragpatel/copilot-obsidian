import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useChatStore } from "../store/chatStore";
import { AVAILABLE_MODELS } from "../types/constants";
import { ModelSelector } from "./ModelSelector";

describe("ModelSelector", () => {
  it("renders a select with all available models", () => {
    render(<ModelSelector />);

    expect(screen.getByRole("combobox")).toBeInTheDocument();
    AVAILABLE_MODELS.forEach((model) => {
      expect(screen.getByRole("option", { name: model })).toHaveValue(model);
    });
  });

  it("shows the current model as selected", () => {
    useChatStore.setState({ currentModel: "gpt-4o" });

    render(<ModelSelector />);

    expect(screen.getByRole("combobox")).toHaveValue("gpt-4o");
  });

  it("updates the store when the selection changes", async () => {
    const user = userEvent.setup();

    render(<ModelSelector />);

    await user.selectOptions(screen.getByRole("combobox"), "o4-mini");

    expect(useChatStore.getState().currentModel).toBe("o4-mini");
  });

  it("exposes an accessible name on the select", () => {
    render(<ModelSelector />);

    expect(screen.getByRole("combobox", { name: "Language model" })).toBeInTheDocument();
  });
});
