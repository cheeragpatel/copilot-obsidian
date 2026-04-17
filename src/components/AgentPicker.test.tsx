import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useChatStore } from "../store/chatStore";
import type { CustomAgentEntry } from "../types/settings";
import { AgentPicker } from "./AgentPicker";

function createAgent(name: string, enabled = true): CustomAgentEntry {
  return {
    name,
    displayName: name,
    description: `${name} description`,
    prompt: `${name} prompt`,
    enabled,
  };
}

describe("AgentPicker", () => {
  it("renders the dropdown with add agent option when there are no enabled agents", () => {
    render(
      <AgentPicker agents={[createAgent("writer", false)]} />,
    );

    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /No agent/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Add agent/ })).toBeInTheDocument();
  });

  it("renders a dropdown with enabled agents", () => {
    render(
      <AgentPicker
        agents={[createAgent("writer"), createAgent("reviewer", false)]}
      />,
    );

    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /No agent/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /@writer/ })).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: /@reviewer/ }),
    ).not.toBeInTheDocument();
  });

  it("updates the store when selecting an agent", async () => {
    const user = userEvent.setup();
    useChatStore.setState({
      discoveredAgents: [createAgent("writer")],
    });

    render(<AgentPicker agents={[createAgent("writer")]} />);

    await user.selectOptions(screen.getByRole("combobox"), "writer");

    expect(useChatStore.getState().selectedAgent).toBe("writer");
  });

  it('clears the selection when choosing "No agent"', async () => {
    const user = userEvent.setup();
    useChatStore.setState({ selectedAgent: "writer" });

    render(<AgentPicker agents={[createAgent("writer")]} />);

    await user.selectOptions(
      screen.getByRole("combobox"),
      screen.getByRole("option", { name: /No agent/ }),
    );

    expect(useChatStore.getState().selectedAgent).toBeNull();
  });

  it("exposes an accessible name on the select", () => {
    render(<AgentPicker agents={[createAgent("writer")]} />);

    expect(screen.getByRole("combobox", { name: "Custom agent" })).toBeInTheDocument();
  });
});
