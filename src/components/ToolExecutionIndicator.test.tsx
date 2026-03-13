import { render, screen } from "@testing-library/react";
import type { ToolCallInfo } from "../types/chat";
import { ToolExecutionIndicator } from "./ToolExecutionIndicator";

function renderIndicator(toolCalls: ToolCallInfo[]) {
  return render(<ToolExecutionIndicator toolCalls={toolCalls} />);
}

describe("ToolExecutionIndicator", () => {
  it("renders a running tool with the spinner class", () => {
    const { container } = renderIndicator([{ name: "searchVault", status: "running" }]);

    expect(
      container.querySelector(".copilot-tool-call.running .copilot-tool-spinner"),
    ).toBeInTheDocument();
  });

  it("renders a complete tool with a checkmark", () => {
    renderIndicator([{ name: "openNote", status: "complete" }]);

    expect(screen.getByText("✓")).toBeInTheDocument();
  });

  it("renders an error tool with an X mark", () => {
    renderIndicator([{ name: "writeNote", status: "error" }]);

    expect(screen.getByText("✗")).toBeInTheDocument();
  });

  it("renders multiple tool calls", () => {
    const { container } = renderIndicator([
      { name: "searchVault", status: "running" },
      { name: "openNote", status: "complete" },
      { name: "writeNote", status: "error" },
    ]);

    expect(container.querySelectorAll(".copilot-tool-call")).toHaveLength(3);
  });
});
