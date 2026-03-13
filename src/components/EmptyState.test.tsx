import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { EmptyState } from "./EmptyState";
import { renderWithContext } from "./testUtils";

function renderEmptyState(onSuggestionClick = vi.fn()) {
  return renderWithContext(<EmptyState onSuggestionClick={onSuggestionClick} />, {
    app: {
      workspace: {
        getActiveFile: vi.fn().mockReturnValue({ basename: "Project Plan" }),
        on: vi.fn().mockReturnValue({}),
        offref: vi.fn(),
      },
    },
  });
}

describe("EmptyState", () => {
  it("renders the title and suggestion buttons", () => {
    renderEmptyState();

    expect(screen.getByText("GitHub Copilot for Obsidian")).toBeInTheDocument();
    expect(screen.getByText(/use \/commands and @agents/i)).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(4);
    expect(screen.getByRole("button", { name: /Summarize "Project Plan"/ })).toBeInTheDocument();
  });

  it("calls onSuggestionClick when a suggestion is clicked", async () => {
    const user = userEvent.setup();
    const onSuggestionClick = vi.fn();

    renderEmptyState(onSuggestionClick);

    await user.click(screen.getByRole("button", { name: /Summarize "Project Plan"/ }));

    expect(onSuggestionClick).toHaveBeenCalledWith("/summarize");
  });
});
