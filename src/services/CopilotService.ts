import { CopilotClient, defineTool, SessionEvent } from "@github/copilot-sdk";
import type { App } from "obsidian";
import { ChatMode, DEFAULT_MODEL } from "../types/constants";
import type { PluginSettings, MCPServerEntry } from "../types/settings";
import type { FileAttachment } from "../types/chat";
import { ConfigDiscovery } from "./ConfigDiscovery";
import { promptPermission } from "../views/PermissionModal";

type EventCallback = (event: SessionEvent) => void;

type DiscoveredTool = {
  name: string;
  namespacedName?: string;
  description: string;
};

interface SessionOptions {
  model?: string;
  mode?: ChatMode;
  tools?: ReturnType<typeof defineTool>[];
  mcpServers?: Record<string, any>;
  customAgents?: any[];
  skillDirectories?: string[];
  disabledSkills?: string[];
  excludedTools?: string[];
  systemMessage?: string;
}

export class CopilotService {
  private client: CopilotClient | null = null;
  private session: any = null;
  private settings: PluginSettings;
  private app: App;
  private eventListeners: Set<EventCallback> = new Set();
  private discoveredTools: Map<string, DiscoveredTool> = new Map();
  private currentMode: ChatMode;

  constructor(app: App, settings: PluginSettings) {
    this.app = app;
    this.settings = settings;
    this.currentMode = settings.defaultMode;
  }

  /**
   * Resolve the Copilot CLI path. Electron apps don't inherit the shell PATH,
   * so we probe common install locations when the default "copilot" fails.
   */
  private resolveCliPath(): string {
    const configured = this.settings.cliPath;
    if (configured && configured !== "copilot") {
      return configured;
    }

    const home = process.env.HOME || process.env.USERPROFILE || "";

    // Common install locations on macOS / Linux / Windows
    const candidates = [
      "/opt/homebrew/bin/copilot",
      "/usr/local/bin/copilot",
      "/usr/bin/copilot",
      `${home}/.npm-global/bin/copilot`,
      `${home}/.local/bin/copilot`,
      `${home}/.nvm/versions/node/${process.version}/bin/copilot`,
      `${process.env.LOCALAPPDATA || ""}\\npm\\copilot.cmd`,
      `${process.env.APPDATA || ""}\\npm\\copilot.cmd`,
    ];

    // Use Node's require('fs') via Electron's Node integration
    try {
      const fs = window.require("fs");
      for (const candidate of candidates) {
        if (candidate && fs.existsSync(candidate)) {
          console.log(`[Copilot] Found CLI at ${candidate}`);
          return candidate;
        }
      }
    } catch {
      // fs not available — fall through
    }

    return "copilot";
  }

  /**
   * Ensure common bin directories are in PATH so the CLI's
   * `#!/usr/bin/env node` shebang can find the node binary.
   */
  private ensurePath(): void {
    const home = process.env.HOME || process.env.USERPROFILE || "";
    const extraPaths = [
      "/opt/homebrew/bin",
      "/usr/local/bin",
      "/usr/bin",
      `${home}/.npm-global/bin`,
      `${home}/.local/bin`,
      `${home}/.nvm/versions/node/${process.version}/bin`,
    ].filter(Boolean);

    const currentPath = process.env.PATH || "";
    const missing = extraPaths.filter((p) => !currentPath.includes(p));
    if (missing.length > 0) {
      process.env.PATH = [...missing, currentPath].join(":");
    }
  }

  async initialize(): Promise<void> {
    try {
      const cliPath = this.resolveCliPath();

      // Electron doesn't inherit the user's shell PATH, so node/copilot
      // aren't found. Augment PATH with common bin directories.
      this.ensurePath();

      this.client = new CopilotClient({
        cliPath,
        logLevel: this.settings.logLevel === "warn" ? "warning" : this.settings.logLevel,
      });
      await this.client.start();
    } catch (error) {
      console.error("[Copilot] Failed to initialize client:", (error as Error)?.message || "Unknown error");
      throw error;
    }
  }

  async createSession(options: SessionOptions = {}): Promise<void> {
    if (!this.client) {
      throw new Error("CopilotClient not initialized. Call initialize() first.");
    }

    // Destroy existing session if any
    if (this.session) {
      try {
        await this.session.destroy();
      } catch {
        // Ignore cleanup errors
      }
    }

    this.discoveredTools.clear();

    const model = options.model || this.settings.defaultModel || DEFAULT_MODEL;
    const mode = options.mode || this.currentMode;
    this.currentMode = mode;

    // Auto-discover config from .github/ and .copilot/ directories
    let discoveredConfig = {
      skills: [] as string[],
      mcpServers: [] as any[],
      instructions: "",
    };

    if (this.settings.inheritConfig) {
      const discovery = new ConfigDiscovery(this.app);
      discoveredConfig = await discovery.discover();
    }

    const hasExplicitMCPServers = Object.prototype.hasOwnProperty.call(options, "mcpServers");

    // Build MCP server config from settings unless the caller provided an explicit selection.
    const mcpServers = hasExplicitMCPServers
      ? { ...(options.mcpServers || {}) }
      : this.buildMCPConfig();

    // Merge discovered MCP servers (settings take precedence by name) unless the caller
    // already provided the exact MCP set to use for this session.
    if (!hasExplicitMCPServers) {
      for (const discovered of discoveredConfig.mcpServers) {
        if (!mcpServers[discovered.name]) {
          const discoveredServer = this.serializeMCPServer(discovered);
          if (discoveredServer) {
            mcpServers[discovered.name] = discoveredServer;
          }
        }
      }
    }

    const allSkillDirs = [...new Set([
      ...this.settings.skillDirectories,
      ...discoveredConfig.skills,
    ])];

    // Build custom agents config
    const customAgents = options.customAgents || this.buildAgentsConfig();

    // Build session config
    const sessionConfig: any = {
      model,
      streaming: this.settings.streaming,
      onPermissionRequest: (request: any) => promptPermission(this.app, request),
    };

    // Add tools in agent mode
    if (mode === ChatMode.Agent && options.tools) {
      sessionConfig.tools = options.tools;
    }

    // Add MCP servers if configured
    if (Object.keys(mcpServers).length > 0) {
      sessionConfig.mcpServers = mcpServers;
    }

    // Add custom agents if configured
    if (customAgents.length > 0) {
      sessionConfig.customAgents = customAgents;
    }

    // Add skill directories
    const skillDirectories = options.skillDirectories || allSkillDirs;
    if (skillDirectories.length > 0) {
      sessionConfig.skillDirectories = skillDirectories;
    }

    // Add disabled skills
    if (this.settings.disabledSkills.length > 0) {
      sessionConfig.disabledSkills = options.disabledSkills || this.settings.disabledSkills;
    }

    // Add excluded tools
    if (this.settings.excludedTools.length > 0) {
      sessionConfig.excludedTools = options.excludedTools || this.settings.excludedTools;
    }

    // Add system message
    const systemMsg = options.systemMessage || this.settings.systemMessage;
    const combinedSystemMsg = [discoveredConfig.instructions, systemMsg]
      .filter(Boolean)
      .join("\n\n");

    if (combinedSystemMsg) {
      sessionConfig.systemMessage = {
        mode: "append",
        content: combinedSystemMsg,
      };
    }

    this.session = await this.client.createSession(sessionConfig);
    this.attachSessionListener();
  }

  async sendMessage(prompt: string, attachments?: FileAttachment[]): Promise<void> {
    if (!this.session) {
      throw new Error("No active session. Call createSession() first.");
    }

    const messageOptions: any = { prompt };

    if (attachments && attachments.length > 0) {
      messageOptions.attachments = attachments.map((a) => ({
        type: "file" as const,
        path: a.path,
        displayName: a.name,
      }));
    }

    await this.session.send(messageOptions);
  }

  async sendAndWait(prompt: string, timeout = 120000): Promise<string | null> {
    if (!this.session) {
      throw new Error("No active session. Call createSession() first.");
    }

    const response = await this.session.sendAndWait({ prompt }, timeout);
    return response?.data?.content || null;
  }

  async abort(): Promise<void> {
    if (this.session) {
      await this.session.abort();
    }
  }

  onEvent(callback: EventCallback): () => void {
    this.eventListeners.add(callback);
    return () => {
      this.eventListeners.delete(callback);
    };
  }

  async switchMode(mode: ChatMode, tools?: ReturnType<typeof defineTool>[]): Promise<void> {
    this.currentMode = mode;
    await this.createSession({ mode, tools });
  }

  getMode(): ChatMode {
    return this.currentMode;
  }

  getSessionId(): string | null {
    return this.session?.sessionId || null;
  }

  async listTools(): Promise<DiscoveredTool[]> {
    const lookups = [
      () => (this.session as any)?.rpc?.tools?.list?.({}),
      () => (this.session as any)?.listTools?.(),
      () => (this.session as any)?.getTools?.(),
      () => (this.session as any)?.tools?.(),
      () => (this.client as any)?.listTools?.(),
      () => (this.client as any)?.getTools?.(),
      () => (this.client as any)?.tools?.(),
    ];

    for (const lookup of lookups) {
      try {
        const result = await lookup();
        const tools = Array.isArray(result)
          ? result
          : Array.isArray(result?.tools)
            ? result.tools
            : [];

        if (tools.length > 0) {
          return this.rememberDiscoveredTools(tools);
        }
      } catch {
        // Ignore lookup errors and continue to the next fallback.
      }
    }

    return this.rememberDiscoveredTools([]);
  }

  async resumeSession(sessionId: string, tools?: ReturnType<typeof defineTool>[]): Promise<void> {
    if (!this.client) {
      throw new Error("CopilotClient not initialized.");
    }

    this.discoveredTools.clear();

    this.session = await this.client.resumeSession(sessionId, {
      tools: tools || [],
      onPermissionRequest: (request: any) => promptPermission(this.app, request),
    });

    this.attachSessionListener();
  }

  async listSessions(): Promise<any[]> {
    if (!this.client) return [];
    return await this.client.listSessions();
  }

  async deleteSession(sessionId: string): Promise<void> {
    if (!this.client) return;
    await this.client.deleteSession(sessionId);
  }

  async getAvailableModels(): Promise<{ id: string; name: string }[]> {
    if (!this.client) return [];
    try {
      const models = await this.client.listModels();
      return models.map((m: any) => ({ id: m.id, name: m.name || m.id }));
    } catch {
      return [];
    }
  }

  isConnected(): boolean {
    if (!this.client) return false;
    return this.client.getState() === "connected";
  }

  updateSettings(settings: PluginSettings): void {
    this.settings = settings;
  }

  private attachSessionListener(): void {
    if (!this.session?.on) return;

    this.session.on((event: SessionEvent) => {
      const discoveredTool = this.extractDiscoveredToolFromEvent(event);
      if (discoveredTool) {
        this.rememberDiscoveredTools([discoveredTool]);
      }

      for (const listener of this.eventListeners) {
        listener(event);
      }
    });
  }

  private normalizeDiscoveredTool(tool: any): DiscoveredTool | null {
    const namespacedName = typeof tool?.namespacedName === "string" && tool.namespacedName.trim()
      ? tool.namespacedName.trim()
      : typeof tool?.name === "string" && tool.name.includes("/")
        ? tool.name
        : undefined;

    const name = typeof tool?.name === "string" && tool.name.trim() && tool.name !== namespacedName
      ? tool.name.trim()
      : namespacedName?.includes("/")
        ? namespacedName.split("/").slice(1).join("/")
        : namespacedName?.includes("_")
          ? namespacedName.slice(namespacedName.indexOf("_") + 1)
          : typeof tool?.name === "string" && tool.name.trim()
            ? tool.name.trim()
            : undefined;

    if (!name) return null;

    const description = typeof tool?.description === "string"
      ? tool.description
      : typeof tool?.toolDescription === "string"
        ? tool.toolDescription
        : "";

    return {
      name,
      ...(namespacedName ? { namespacedName } : {}),
      description,
    };
  }

  private rememberDiscoveredTools(tools: any[]): DiscoveredTool[] {
    for (const tool of tools) {
      const normalized = this.normalizeDiscoveredTool(tool);
      if (!normalized) continue;

      const key = normalized.namespacedName || normalized.name;
      const existing = this.discoveredTools.get(key);
      this.discoveredTools.set(key, {
        ...existing,
        ...normalized,
        description: normalized.description || existing?.description || "",
      });
    }

    return Array.from(this.discoveredTools.values()).sort((left, right) =>
      (left.namespacedName || left.name).localeCompare(right.namespacedName || right.name),
    );
  }

  private extractDiscoveredToolFromEvent(event: SessionEvent): DiscoveredTool | null {
    const eventType = event.type as string;
    if (eventType !== "tool.execution_start" && eventType !== "tool.executionStart") {
      return null;
    }

    const eventData = event.data as any;
    const rawName = typeof eventData?.mcpToolName === "string"
      ? eventData.mcpToolName
      : typeof eventData?.name === "string"
        ? eventData.name
        : typeof eventData?.toolName === "string"
          ? eventData.toolName
          : undefined;

    const namespacedName = typeof eventData?.namespacedName === "string"
      ? eventData.namespacedName
      : typeof eventData?.mcpServerName === "string" && rawName
        ? `${eventData.mcpServerName}/${rawName}`
        : typeof eventData?.serverName === "string" && rawName
          ? `${eventData.serverName}/${rawName}`
          : undefined;

    return this.normalizeDiscoveredTool({
      name: rawName || namespacedName,
      namespacedName,
      description: typeof eventData?.description === "string"
        ? eventData.description
        : typeof eventData?.toolDescription === "string"
          ? eventData.toolDescription
          : "",
    });
  }

  private serializeMCPServer(server: MCPServerEntry): Record<string, any> | null {
    const toolConfig = server.configTools && server.configTools.length > 0
      ? { tools: server.configTools }
      : {};

    if (server.type === "http" && server.url) {
      return {
        type: "http",
        url: server.url,
        ...(server.headers ? { headers: server.headers } : {}),
        ...toolConfig,
      };
    }

    if (server.type === "stdio" && server.command) {
      return {
        type: "stdio",
        command: server.command,
        args: server.args || [],
        env: server.env || {},
        ...toolConfig,
      };
    }

    return null;
  }

  private buildMCPConfig(): Record<string, any> {
    const config: Record<string, any> = {};
    for (const server of this.settings.mcpServers) {
      if (!server.enabled) continue;
      const serialized = this.serializeMCPServer(server);
      if (serialized) {
        config[server.name] = serialized;
      }
    }
    return config;
  }

  private buildAgentsConfig(): any[] {
    return this.settings.customAgents
      .filter((a) => a.enabled)
      .map((a) => ({
        name: a.name,
        displayName: a.displayName,
        description: a.description,
        prompt: a.prompt,
      }));
  }

  async destroy(): Promise<void> {
    try {
      if (this.session) {
        await this.session.destroy();
        this.session = null;
      }
    } catch {
      // Ignore session cleanup errors
    }

    try {
      if (this.client) {
        await this.client.stop();
        this.client = null;
      }
    } catch {
      // Ignore client cleanup errors
    }

    this.eventListeners.clear();
    this.discoveredTools.clear();
  }
}
