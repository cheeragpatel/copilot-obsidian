import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { AttachmentChips } from "./AttachmentChips";

describe("AttachmentChips", () => {
  it("renders nothing when items is empty", () => {
    const { container } = render(<AttachmentChips items={[]} onRemove={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders one chip per attachment with an accessible remove button", async () => {
    const onRemove = vi.fn();
    const user = userEvent.setup();
    render(
      <AttachmentChips
        items={[
          { path: "Notes/a.md", name: "a.md", type: "text/markdown" },
          { path: "Notes/b.md", name: "b.md", type: "text/markdown" },
        ]}
        onRemove={onRemove}
      />,
    );

    expect(screen.getByText("a.md")).toBeInTheDocument();
    expect(screen.getByText("b.md")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove b.md" }));
    expect(onRemove).toHaveBeenCalledWith("Notes/b.md");
  });
});
