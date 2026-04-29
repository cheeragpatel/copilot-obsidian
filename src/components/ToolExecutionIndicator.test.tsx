import { render, screen, fireEvent } from "@testing-library/react";
import type { ToolCallInfo } from "../types/chat";
import { ToolExecutionIndicator } from "./ToolExecutionIndicator";

function renderIndicator(toolCalls: ToolCallInfo[]) {
  return render(<ToolExecutionIndicator toolCalls={toolCalls} />);
}

describe("ToolExecutionIndicator", () => {
  it("renders a running tool with the spinner class", () => {
    const { container } = renderIndicator([{ id: "t1", name: "searchVault", status: "running" }]);

    expect(
      container.querySelector(".copilot-tool-call.running .copilot-tool-spinner"),
    ).toBeInTheDocument();
  });

  it("renders a complete tool with a checkmark", () => {
    renderIndicator([{ id: "t2", name: "openNote", status: "complete" }]);

    expect(screen.getByText("✓")).toBeInTheDocument();
  });

  it("renders an error tool with an X mark", () => {
    renderIndicator([{ id: "t3", name: "writeNote", status: "error" }]);

    expect(screen.getByText("✗")).toBeInTheDocument();
  });

  it("shows error output by default when an error message is present", () => {
    renderIndicator([
      { id: "t3", name: "writeNote", status: "error", result: "Permission denied" },
    ]);

    expect(screen.getByText("Permission denied")).toBeInTheDocument();
  });

  it("renders multiple tool calls", () => {
    const { container } = renderIndicator([
      { id: "t4", name: "searchVault", status: "running" },
      { id: "t5", name: "openNote", status: "complete" },
      { id: "t6", name: "writeNote", status: "error" },
    ]);

    expect(container.querySelectorAll(".copilot-tool-call")).toHaveLength(3);
  });

  it("exposes the list of tool calls with ARIA roles", () => {
    renderIndicator([
      { id: "t7", name: "searchVault", status: "running" },
      { id: "t8", name: "openNote", status: "complete" },
    ]);

    const list = screen.getByRole("list", { name: "Tool executions" });
    expect(list).toBeInTheDocument();
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveAttribute("aria-label", "searchVault: running");
    expect(items[1]).toHaveAttribute("aria-label", "openNote: complete");
  });

  it("shows chevron and has-output class when result is present", () => {
    const { container } = renderIndicator([
      { id: "t9", name: "searchVault", status: "complete", result: "Found 3 notes" },
    ]);

    expect(container.querySelector(".copilot-tool-call.has-output")).toBeInTheDocument();
    expect(container.querySelector(".copilot-tool-call-chevron")).toBeInTheDocument();
  });

  it("does not show chevron when no result", () => {
    const { container } = renderIndicator([
      { id: "t10", name: "searchVault", status: "complete" },
    ]);

    expect(container.querySelector(".copilot-tool-call.has-output")).not.toBeInTheDocument();
    expect(container.querySelector(".copilot-tool-call-chevron")).not.toBeInTheDocument();
  });

  it("expands output on click and collapses on second click", () => {
    const { container } = renderIndicator([
      { id: "t11", name: "readFile", status: "complete", result: "file content here" },
    ]);

    const header = container.querySelector(".copilot-tool-call-header")!;

    // Initially collapsed
    expect(container.querySelector(".copilot-tool-call-output")).not.toBeInTheDocument();

    // Click to expand
    fireEvent.click(header);
    expect(container.querySelector(".copilot-tool-call-output")).toBeInTheDocument();
    expect(screen.getByText("file content here")).toBeInTheDocument();
    expect(container.querySelector(".copilot-tool-call-chevron.expanded")).toBeInTheDocument();

    // Click to collapse
    fireEvent.click(header);
    expect(container.querySelector(".copilot-tool-call-output")).not.toBeInTheDocument();
  });

  it("does not expand when clicking a tool call without output", () => {
    const { container } = renderIndicator([
      { id: "t12", name: "searchVault", status: "running" },
    ]);

    const header = container.querySelector(".copilot-tool-call-header")!;
    fireEvent.click(header);

    expect(container.querySelector(".copilot-tool-call-output")).not.toBeInTheDocument();
  });
});
