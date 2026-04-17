import * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useChatStore } from "../store/chatStore";

interface MCPPickerProps {
  onMCPChange?: () => void;
  onRefresh?: () => void;
}

export const MCPPicker: React.FC<MCPPickerProps> = ({ onMCPChange, onRefresh }) => {
  const { mcpServers, toggleMCP, toggleMCPTool } = useChatStore();
  const [isOpen, setIsOpen] = useState(false);
  const [expandedServers, setExpandedServers] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstFocusRef = useRef<HTMLButtonElement>(null);

  const enabledCount = mcpServers.filter((server) => server.enabled).length;

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      firstFocusRef.current?.focus();
    }
  }, [isOpen]);

  const handleToggleServer = useCallback(
    (serverName: string) => {
      toggleMCP(serverName);
      onMCPChange?.();
    },
    [onMCPChange, toggleMCP],
  );

  const handleToggleTool = useCallback(
    (serverName: string, toolName: string, serverEnabled: boolean) => {
      if (!serverEnabled) return;
      toggleMCPTool(serverName, toolName);
      onMCPChange?.();
    },
    [onMCPChange, toggleMCPTool],
  );

  const toggleExpanded = useCallback((serverName: string) => {
    setExpandedServers((current) =>
      current.includes(serverName)
        ? current.filter((name) => name !== serverName)
        : [...current, serverName],
    );
  }, []);

  return (
    <div className="copilot-mcp-picker" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`copilot-mcp-btn${enabledCount === 0 ? " is-muted" : ""}`}
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-label="Configure MCP servers"
        title={`${enabledCount} MCP server${enabledCount === 1 ? "" : "s"} enabled`}
      >
        <span aria-hidden="true">⚡</span>
        <span>{enabledCount}</span>
      </button>

      {isOpen && (
        <div
          className="copilot-mcp-dropdown"
          role="group"
          aria-labelledby="copilot-mcp-title"
        >
          <div className="copilot-mcp-header">
            <span id="copilot-mcp-title">MCP Servers</span>
            <div style={{ display: "flex", gap: "4px" }}>
              {onRefresh && (
                <button
                  ref={firstFocusRef}
                  type="button"
                  className="copilot-mcp-close"
                  onClick={() => onRefresh()}
                  aria-label="Refresh MCP tools"
                  title="Refresh tool list"
                >
                  ↻
                </button>
              )}
              <button
                ref={onRefresh ? undefined : firstFocusRef}
                type="button"
                className="copilot-mcp-close"
                onClick={() => {
                  setIsOpen(false);
                  triggerRef.current?.focus();
                }}
                aria-label="Close MCP picker"
              >
                ×
              </button>
            </div>
          </div>

          {mcpServers.length === 0 ? (
            <div className="copilot-mcp-empty">
              <strong>No MCP servers found</strong>
              <span>Configure MCP servers in settings or Copilot config files.</span>
            </div>
          ) : (
            <div className="copilot-mcp-server-list">
              {mcpServers.map((serverState) => {
                const serverName = serverState.server.name;
                const source = serverState.source || serverState.server.source || "settings";
                const isExpanded = expandedServers.includes(serverName);
                const legendId = `copilot-mcp-server-${serverName}`;

                return (
                  <fieldset className="copilot-mcp-server" key={serverName}>
                    <legend id={legendId} className="copilot-sr-only">
                      {serverName}
                    </legend>
                    <div className="copilot-mcp-server-row">
                      <label className="copilot-mcp-server-main">
                        <input
                          type="checkbox"
                          checked={serverState.enabled}
                          onChange={() => handleToggleServer(serverName)}
                        />
                        <span
                          className={`copilot-mcp-server-name${serverState.enabled ? " is-enabled" : " is-disabled"}`}
                        >
                          {serverName}
                        </span>
                      </label>

                      <div className="copilot-mcp-server-actions">
                        <span className="copilot-mcp-source-badge" data-source={source}>
                          {source}
                        </span>
                        <button
                          type="button"
                          className="copilot-mcp-expand-btn"
                          onClick={() => toggleExpanded(serverName)}
                          aria-expanded={isExpanded}
                          aria-label={`${isExpanded ? "Collapse" : "Expand"} ${serverName} tools`}
                        >
                          {isExpanded ? "▾" : "▸"}
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className={`copilot-mcp-tools-list${serverState.enabled ? "" : " is-disabled"}`}>
                        {serverState.tools.length > 0 ? (
                          serverState.tools.map((tool) => (
                            <label
                              className={`copilot-mcp-tool-row${serverState.enabled ? "" : " is-disabled"}`}
                              key={`${serverName}:${tool.name}`}
                            >
                              <input
                                type="checkbox"
                                checked={tool.enabled}
                                disabled={!serverState.enabled}
                                onChange={() =>
                                  handleToggleTool(serverName, tool.name, serverState.enabled)
                                }
                              />
                              <div className="copilot-mcp-tool-text">
                                <span className="copilot-mcp-tool-name">{tool.name}</span>
                                {tool.description && (
                                  <span className="copilot-mcp-tool-description">
                                    {tool.description}
                                  </span>
                                )}
                              </div>
                            </label>
                          ))
                        ) : (
                          <div className="copilot-mcp-tools-empty">
                            {serverState.enabled
                              ? "Tools populate when first used. Send a message that calls this server to discover its tools."
                              : "Enable this server to use its tools."}
                          </div>
                        )}
                      </div>
                    )}
                  </fieldset>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
