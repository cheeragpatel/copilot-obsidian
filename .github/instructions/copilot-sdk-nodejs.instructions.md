---
applyTo: "**.ts, **.js, package.json"
description: "This file provides guidance on building Node.js/TypeScript applications using GitHub Copilot SDK."
name: "GitHub Copilot SDK Node.js Instructions"
---

## Core Principles

- The SDK is in technical preview and may have breaking changes
- Requires Node.js 18.0 or later
- Requires GitHub Copilot CLI installed and in PATH
- Built with TypeScript for type safety
- Uses async/await patterns throughout
- Provides full TypeScript type definitions

## Installation

Always install via npm/pnpm/yarn:

```bash
npm install @github/copilot-sdk
```

## Client Initialization

### Basic Client Setup

```typescript
import { CopilotClient } from "@github/copilot-sdk";

const client = new CopilotClient();
await client.start();
// Use client...
await client.stop();
```

### Client Configuration Options

When creating a CopilotClient, use `CopilotClientOptions`:

- `cliPath` - Path to CLI executable (default: "copilot" from PATH)
- `cliArgs` - Extra arguments prepended before SDK-managed flags (string[])
- `cliUrl` - URL of existing CLI server (e.g., "localhost:8080"). When provided, client won't spawn a process
- `port` - Server port (default: 0 for random)
- `useStdio` - Use stdio transport instead of TCP (default: true)
- `logLevel` - Log level (default: "debug")
- `autoStart` - Auto-start server (default: true)
- `autoRestart` - Auto-restart on crash (default: true)
- `cwd` - Working directory for the CLI process (default: process.cwd())
- `env` - Environment variables for the CLI process (default: process.env)

## Session Management

### Creating Sessions

```typescript
const session = await client.createSession({
    model: "gpt-5",
    streaming: true,
    tools: [...],
    systemMessage: { ... },
});
```

### Session Config Options

- `sessionId` - Custom session ID (string)
- `model` - Model name ("gpt-5", "claude-sonnet-4.5", etc.)
- `tools` - Custom tools exposed to the CLI (Tool[])
- `systemMessage` - System message customization (SystemMessageConfig)
- `availableTools` - Allowlist of tool names (string[])
- `excludedTools` - Blocklist of tool names (string[])
- `provider` - Custom API provider configuration (BYOK) (ProviderConfig)
- `streaming` - Enable streaming response chunks (boolean)
- `mcpServers` - MCP server configurations (MCPServerConfig[])
- `customAgents` - Custom agent configurations (CustomAgentConfig[])
- `onPermissionRequest` - Permission request handler (PermissionHandler)

## Event Handling

ALWAYS use async/await or Promises for waiting on session events:

```typescript
await new Promise<void>((resolve) => {
  session.on((event) => {
    if (event.type === "assistant.message") {
      console.log(event.data.content);
    } else if (event.type === "session.idle") {
      resolve();
    }
  });
  session.send({ prompt: "..." });
});
```

### Event Types

- `user.message` - User message sent
- `assistant.message` - Complete assistant response
- `assistant.message.delta` - Streaming text chunk
- `tool.executionStart` - Tool execution started
- `tool.executionComplete` - Tool execution completed
- `session.start` - Session started
- `session.idle` - Processing complete
- `session.error` - Runtime error

## Custom Tools

Use `defineTool` for type-safe tool definitions:

```typescript
import { defineTool } from "@github/copilot-sdk";

defineTool({
  name: "tool_name",
  description: "What this tool does",
  parameters: {
    type: "object",
    properties: { id: { type: "string", description: "ID" } },
    required: ["id"],
  },
  handler: async (args) => {
    return { result: "value" };
  },
});
```

## Resource Cleanup

ALWAYS use try-finally for cleanup:

```typescript
const client = new CopilotClient();
try {
  await client.start();
  const session = await client.createSession();
  try {
    // Use session...
  } finally {
    await session.destroy();
  }
} finally {
  await client.stop();
}
```

## Best Practices

1. **Always use try-finally** for resource cleanup
2. **Use Promises** to wait for session.idle event
3. **Handle session.error** events for robust error handling
4. **Use type guards or switch statements** for event handling
5. **Enable streaming** for better UX in interactive scenarios
6. **Use defineTool** for type-safe tool definitions
7. **Use systemMessage with mode: "append"** to preserve safety guardrails
8. **Handle both delta and final events** when streaming is enabled
9. **Leverage TypeScript types** for compile-time safety
