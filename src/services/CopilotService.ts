import { CopilotClient, defineTool, SessionEvent } from "@github/copilot-sdk";
import type { App } from "obsidian";
import { ChatMode, DEFAULT_MODEL } from "../types/constants";
import type { PluginSettings } from "../types/settings";
import type { FileAttachment } from "../types/chat";
import { ConfigDiscovery } from "./ConfigDiscovery";
import { promptPermission } from "../views/PermissionModal";

type EventCallback = (event: SessionEvent) => void;

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
      console.error("[Copilot] Failed to initialize client:", error);
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

    // Build MCP server config from settings
    const mcpServers = { ...(options.mcpServers || this.buildMCPConfig()) };

    // Merge discovered MCP servers (settings take precedence by name)
    for (const discovered of discoveredConfig.mcpServers) {
      if (!mcpServers[discovered.name]) {
        if (discovered.type === "http") {
          mcpServers[discovered.name] = {
            type: "http",
            url: discovered.url,
          };
        } else if (discovered.type === "stdio") {
          mcpServers[discovered.name] = {
            type: "stdio",
            command: discovered.command,
            args: discovered.args || [],
            env: discovered.env || {},
          };
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

    // Attach event listener
    this.session.on((event: SessionEvent) => {
      for (const listener of this.eventListeners) {
        listener(event);
      }
    });
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

  async resumeSession(sessionId: string, tools?: ReturnType<typeof defineTool>[]): Promise<void> {
    if (!this.client) {
      throw new Error("CopilotClient not initialized.");
    }

    this.session = await this.client.resumeSession(sessionId, {
      tools: tools || [],
      onPermissionRequest: (request: any) => promptPermission(this.app, request),
    });

    this.session.on((event: SessionEvent) => {
      for (const listener of this.eventListeners) {
        listener(event);
      }
    });
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

  private buildMCPConfig(): Record<string, any> {
    const config: Record<string, any> = {};
    for (const server of this.settings.mcpServers) {
      if (!server.enabled) continue;
      if (server.type === "http") {
        config[server.name] = {
          type: "http",
          url: server.url,
        };
      } else if (server.type === "stdio") {
        config[server.name] = {
          type: "stdio",
          command: server.command,
          args: server.args || [],
          env: server.env || {},
        };
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
  }
}
