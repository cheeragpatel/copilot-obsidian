import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  it("renders the title, subtitle, and suggestion buttons", () => {
    render(<EmptyState onSuggestionClick={vi.fn()} />);

    expect(screen.getByText("GitHub Copilot for Obsidian")).toBeInTheDocument();
    expect(
      screen.getByText(
        /Ask questions, get help with your notes, or use Agent mode/i,
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(4);
  });

  it("calls onSuggestionClick with the suggestion text", async () => {
    const user = userEvent.setup();
    const onSuggestionClick = vi.fn();

    render(<EmptyState onSuggestionClick={onSuggestionClick} />);

    await user.click(screen.getByRole("button", { name: "Create a new note outline" }));

    expect(onSuggestionClick).toHaveBeenCalledWith("Create a new note outline");
  });
});
