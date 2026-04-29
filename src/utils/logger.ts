import CopilotPlugin from "../main";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVEL_RANK: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export class Logger {
  private plugin: CopilotPlugin;
  private prefix = "[copilot-obsidian]";

  constructor(plugin: CopilotPlugin) {
    this.plugin = plugin;
  }

  private shouldLog(level: LogLevel): boolean {
    const currentLevel = this.plugin.settings.logLevel;
    return LOG_LEVEL_RANK[level] >= LOG_LEVEL_RANK[currentLevel];
  }

  private formatMessage(message: string, data?: unknown): string {
    if (data === undefined) {
      return `${this.prefix} ${message}`;
    }
    return `${this.prefix} ${message} ${JSON.stringify(data, null, 2)}`;
  }

  debug(message: string, data?: unknown): void {
    if (this.shouldLog("debug")) {
      console.debug(this.formatMessage(message, data));
    }
  }

  info(message: string, data?: unknown): void {
    if (this.shouldLog("info")) {
      console.log(this.formatMessage(message, data));
    }
  }

  warn(message: string, data?: unknown): void {
    if (this.shouldLog("warn")) {
      console.warn(this.formatMessage(message, data));
    }
  }

  error(message: string, data?: unknown): void {
    if (this.shouldLog("error")) {
      console.error(this.formatMessage(message, data));
    }
  }
}
