import { render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { ChatControlsBar } from "./ChatControlsBar";
import { ChatMode } from "../types/constants";
import { renderWithContext } from "./testUtils";

describe("ChatControlsBar", () => {
  it("renders mode, model, MCP and agent controls", () => {
    renderWithContext(
      <ChatControlsBar
        currentMode={ChatMode.Ask}
        agents={[]}
        onMode={vi.fn()}
        onModel={vi.fn()}
        onMCPChange={vi.fn()}
        onMCPRefresh={vi.fn()}
        onAddAgent={vi.fn()}
      />,
    );

    expect(screen.getByRole("option", { name: "Ask" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Agent" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Configure MCP servers" })).toBeInTheDocument();
  });
});
