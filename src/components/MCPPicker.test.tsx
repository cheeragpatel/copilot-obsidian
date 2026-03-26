import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MCPPicker } from "./MCPPicker";
import { useChatStore } from "../store/chatStore";
import { ChatMode, DEFAULT_MODEL } from "../types/constants";
import type { MCPServerState } from "../types/chat";

const baseState = {
  messages: [],
  currentMode: ChatMode.Ask,
  currentModel: DEFAULT_MODEL,
  availableModels: [],
  isLoading: false,
  currentSessionId: null,
  error: null,
  selectedAgent: null,
  conversations: [],
  discoveredAgents: [],
  mcpServers: [] as MCPServerState[],
};

const createMCPServer = (overrides: Partial<MCPServerState> = {}): MCPServerState => ({
  server: {
    name: "docs",
    type: "http",
    url: "https://docs.example.com",
    enabled: true,
  },
  enabled: true,
  source: "settings",
  tools: [
    { name: "search", description: "Search docs", enabled: true },
    { name: "fetch", description: "Fetch doc page", enabled: false },
  ],
  ...overrides,
});

beforeEach(() => {
  useChatStore.setState(baseState);
});

describe("MCPPicker", () => {
  it("shows the empty state when no MCP servers are available", async () => {
    const user = userEvent.setup();

    render(<MCPPicker />);

    await user.click(screen.getByRole("button", { name: "Configure MCP servers" }));

    expect(screen.getByText("No MCP servers found")).toBeInTheDocument();
    expect(screen.getByText(/configure MCP servers in settings/i)).toBeInTheDocument();
  });

  it("toggles servers and tools and notifies callers", async () => {
    const user = userEvent.setup();
    const onMCPChange = vi.fn();

    useChatStore.setState({
      ...baseState,
      mcpServers: [createMCPServer()],
    });

    render(<MCPPicker onMCPChange={onMCPChange} />);

    await user.click(screen.getByRole("button", { name: "Configure MCP servers" }));
    await user.click(screen.getByRole("button", { name: "Expand docs tools" }));
    await user.click(screen.getByRole("checkbox", { name: /search/i }));

    expect(useChatStore.getState().mcpServers[0].tools[0].enabled).toBe(false);
    expect(onMCPChange).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("checkbox", { name: /^docs$/i }));

    expect(useChatStore.getState().mcpServers[0].enabled).toBe(false);
    expect(onMCPChange).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("checkbox", { name: /search/i })).toBeDisabled();
  });

  it("closes the dropdown when clicking outside", async () => {
    const user = userEvent.setup();

    useChatStore.setState({
      ...baseState,
      mcpServers: [createMCPServer()],
    });

    render(
      <div>
        <MCPPicker />
        <button type="button">Outside</button>
      </div>,
    );

    await user.click(screen.getByRole("button", { name: "Configure MCP servers" }));
    expect(screen.getByText("MCP Servers")).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole("button", { name: "Outside" }));

    expect(screen.queryByText("MCP Servers")).not.toBeInTheDocument();
  });

  it("renders ARIA attributes on the server list and server items", async () => {
    const user = userEvent.setup();

    useChatStore.setState({
      ...baseState,
      mcpServers: [createMCPServer()],
    });

    render(<MCPPicker />);

    await user.click(screen.getByRole("button", { name: "Configure MCP servers" }));

    const listbox = screen.getByRole("listbox", { name: "MCP Servers" });
    expect(listbox).toBeInTheDocument();

    const option = screen.getByRole("option");
    expect(option).toHaveAttribute("aria-selected", "true");
  });
});
