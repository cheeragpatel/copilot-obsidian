import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { AutocompletePopup, type AutocompleteItem } from "./AutocompletePopup";

const items: AutocompleteItem[] = [
  { type: "command", label: "/explain", description: "Explain", icon: "📖", value: "/explain " },
  { type: "agent", label: "@bot", description: "Bot agent", icon: "🤖", value: "@bot " },
];

describe("AutocompletePopup", () => {
  it("renders nothing when items is empty", () => {
    const { container } = render(
      <AutocompletePopup items={[]} selectedIndex={0} onSelect={vi.fn()} onHover={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders items with role=option and aria-selected", () => {
    render(
      <AutocompletePopup items={items} selectedIndex={1} onSelect={vi.fn()} onHover={vi.fn()} />,
    );
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveAttribute("aria-selected", "false");
    expect(options[1]).toHaveAttribute("aria-selected", "true");
  });

  it("invokes onSelect on click and onHover on mouse-enter", async () => {
    const onSelect = vi.fn();
    const onHover = vi.fn();
    const user = userEvent.setup();
    render(
      <AutocompletePopup items={items} selectedIndex={0} onSelect={onSelect} onHover={onHover} />,
    );

    await user.click(screen.getByText("@bot"));
    expect(onSelect).toHaveBeenCalledWith(items[1]);

    await user.hover(screen.getByText("/explain"));
    expect(onHover).toHaveBeenCalledWith(0);
  });
});
