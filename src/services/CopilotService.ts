import { CopilotClient, defineTool, SessionEvent } from "@github/copilot-sdk";
import type { App } from "obsidian";
import { ChatMode, DEFAULT_MODEL } from "../types/constants";
import type { PluginSettings, MCPServerEntry, CustomAgentEntry } from "../types/settings";
import type { ToolCallInfo } from "../types/chat";

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

  async initialize(): Promise<void> {
    try {
      this.client = new CopilotClient({
        cliPath: this.settings.cliPath || undefined,
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

    // Build MCP server config from settings
    const mcpServers = options.mcpServers || this.buildMCPConfig();

    // Build custom agents config
    const customAgents = options.customAgents || this.buildAgentsConfig();

    // Build session config
    const sessionConfig: any = {
      model,
      streaming: this.settings.streaming,
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
    if (this.settings.skillDirectories.length > 0) {
      sessionConfig.skillDirectories = options.skillDirectories || this.settings.skillDirectories;
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
    if (systemMsg) {
      sessionConfig.systemMessage = {
        mode: "append",
        content: systemMsg,
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

  async sendMessage(prompt: string, attachments?: { path: string; displayName: string }[]): Promise<void> {
    if (!this.session) {
      throw new Error("No active session. Call createSession() first.");
    }

    const messageOptions: any = { prompt };

    if (attachments && attachments.length > 0) {
      messageOptions.attachments = attachments.map((a) => ({
        type: "file" as const,
        path: a.path,
        displayName: a.displayName,
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
      onPermissionRequest: async () => true,
    } as any);

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

  async getAvailableModels(): Promise<string[]> {
    if (!this.client) return [];
    try {
      // listModels may not be available in all SDK versions
      return await (this.client as any).listModels?.() ?? [];
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
