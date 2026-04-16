# Copilot Instructions — GitHub Copilot for Obsidian

## Project Overview

This is an Obsidian.md plugin that integrates GitHub Copilot via the official `@github/copilot-sdk`. It provides a sidebar chat panel with Ask/Agent modes, slash commands, custom agents, MCP servers, file attachments, and streaming responses.

- **Platform**: Obsidian desktop only (Electron + Node.js)
- **Language**: TypeScript, React 18, Zustand
- **Bundler**: esbuild (CJS output, `platform: neutral`)
- **Tests**: Vitest + jsdom + @testing-library/react
- **Entry point**: `src/main.ts` → builds to `main.js`

## Architecture

```
src/
├── main.ts                  # Plugin entry (extends Obsidian Plugin)
├── services/
│   ├── CopilotService.ts    # SDK wrapper (session, messaging, events)
│   └── ConfigDiscovery.ts   # Agent/MCP discovery from filesystem
├── store/
│   └── chatStore.ts         # Zustand state (messages, mode, model, MCPs)
├── components/              # React UI (chat panel, inputs, pickers)
├── views/
│   ├── CopilotChatView.tsx  # Obsidian ItemView → React mount
│   └── PermissionModal.ts   # Tool permission prompts
├── tools/
│   └── vaultTools.ts        # Agent-mode vault tools (read, search, edit)
├── commands/
│   └── SlashCommandRegistry.ts  # /summarize, /explain, /tags, etc.
├── settings/
│   └── SettingsTab.ts       # Plugin settings (Obsidian native UI)
└── types/                   # Shared types, constants, settings
```

## Build & Test Commands

```bash
npm run build          # tsc --noEmit + esbuild production
npm run dev            # esbuild watch mode
npm test               # vitest run (all tests)
npm run test:watch     # vitest watch mode
npm run test:coverage  # vitest with v8 coverage
```

## Key Constraints

### Obsidian Plugin Rules
- Output must be a single `main.js` (CJS format, ES2018 target)
- `obsidian`, `electron`, `@codemirror/*`, `@lezer/*` are external (not bundled)
- Use `platform: "neutral"` in esbuild — NOT "node" or "browser"
- `manifest.json`, `styles.css`, `main.js` are the release artifacts
- Settings persist via `plugin.loadData()` / `plugin.saveSettings()`

### Copilot SDK Usage
- The SDK spawns a Copilot CLI child process (JSON-RPC over stdio)
- Sessions are stateful — model/mode changes require `createSession()` again
- Streaming via `session.on(event => ...)` with event types like `assistant.message_delta`
- Tools defined via `defineTool()` with JSON Schema parameters
- MCP servers passed in session config as `mcpServers: { name: { type, url } }`

### React in Obsidian
- React root mounted in `ItemView.onOpen()`, unmounted in `onClose()`
- Plugin context passed via `React.createContext` (provides `app`, `settings`, `copilotService`)
- CSS uses Obsidian's CSS variables (`--text-normal`, `--background-primary`, `--interactive-accent`, etc.)
- No external CSS frameworks — all styles in `styles.css`

### File System Access
- Vault files: use `app.vault.read()`, `app.vault.create()`, `app.vault.modify()`
- External files (e.g., `~/.copilot/`): use Node.js `fs` directly
- `app.metadataCache` for fast vault search (prefer over linear file scan)

## Testing Conventions

- Tests live next to source: `Component.tsx` → `Component.test.tsx`
- Mocks in `src/__mocks__/`: `obsidian.ts`, `copilot-sdk.ts`, `setup.ts`
- Obsidian APIs are fully mocked (App, Vault, Workspace, Modal, etc.)
- Use `@testing-library/react` for component tests
- Vitest globals enabled — no need to import `describe`, `it`, `expect`

### Mock patterns
```typescript
// Access the mock Obsidian app
import { App } from "obsidian";
const app = new App() as any;

// Mock vault files
vi.mocked(app.vault.getMarkdownFiles).mockReturnValue([...]);
vi.mocked(app.vault.cachedRead).mockResolvedValue("content");
```

## Git Workflow

### Use Worktrees for Agentic Operations

When using `/fleet` or parallel sub-agents that edit files simultaneously, **always use git worktrees** to avoid file conflicts:

```bash
# Create worktrees for parallel work
git worktree add ../copilot-obsidian-feat-a -b feat-a
git worktree add ../copilot-obsidian-feat-b -b feat-b

# Each agent works in its own worktree directory
# After completion, merge back:
git checkout main
git merge feat-a
git merge feat-b

# Clean up
git worktree remove ../copilot-obsidian-feat-a
git worktree remove ../copilot-obsidian-feat-b
```

**Why worktrees matter for /fleet:**
- Multiple agents editing the same files in the same directory causes race conditions
- Worktrees give each agent an isolated working copy on a separate branch
- Merges can be resolved cleanly after all agents complete
- This is especially important for shared files like `styles.css`, `chatStore.ts`, and `CopilotChatPanel.tsx`

### Commit Conventions
- `feat:` for new features
- `fix:` for bug fixes
- `test:` for test-only changes
- Always include `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`

## Common Pitfalls

1. **esbuild platform**: Must be `"neutral"` with `mainFields: ["browser", "module", "main"]`. Using `"node"` breaks Obsidian, `"browser"` breaks the SDK.

2. **Package lock cross-platform**: `npm ci` fails in CI because macOS lockfile lacks Linux esbuild binaries. Use `npm install` in GitHub Actions.

3. **Vitest paths**: Use `import.meta.url`-based resolution in `vitest.config.ts` — hardcoded absolute paths break in CI.

4. **Electron PATH**: The Copilot CLI binary and `node` must be findable. `CopilotService` has `ensurePath()` and `resolveCliPath()` for this.

5. **Permission modal**: Uses a nullable `resolvePromise` pattern to prevent double-resolution. `onClose()` always resolves as "deny" so Escape key works.

6. **Tool call tracking**: Tool calls have unique `id` fields. `updateToolCall` matches the first *running* tool by name. `completeAllToolCalls` scans ALL messages.

## Deployment

### To local vault (development)
```bash
npm run build
cp main.js styles.css manifest.json /path/to/vault/.obsidian/plugins/github-copilot-chat/
```

### GitHub Release
Tag a version to trigger the release workflow:
```bash
git tag v0.1.1
git push --tags
```
The `.github/workflows/release.yml` builds and attaches `main.js`, `manifest.json`, `styles.css` to the release.

### BRAT Install
Users can install via [BRAT](https://github.com/TfTHacker/obsidian42-brat) with: `cheeragpatel/copilot-obsidian`

## Adding New Features

### New vault tool (Agent mode)
Add to `src/tools/vaultTools.ts` using `defineTool()`:
```typescript
const myTool = defineTool("tool_name", {
  description: "What this tool does",
  parameters: { type: "object", properties: { ... }, required: [...] },
  handler: async (args) => { /* use app.vault */ },
});
```

### New slash command
Add to `BUILT_IN_COMMANDS` array in `src/commands/SlashCommandRegistry.ts`.

### New React component
Create in `src/components/`, add test file, import in parent component. Use `useChatStore()` for state, `useContext(PluginContext)` for Obsidian APIs.

### New MCP server support
MCP servers auto-discover from `~/.copilot/mcp.json`, vault `.copilot/mcp.json`, and plugin settings. Users toggle them via the ⚡ MCP picker in the chat controls.
