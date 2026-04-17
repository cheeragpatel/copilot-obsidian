import { render, screen } from "@testing-library/react";
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
});
