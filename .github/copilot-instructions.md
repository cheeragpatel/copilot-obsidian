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
├── components/
│   ├── CopilotChatPanel.tsx  # Main chat panel (messages, input, controls)
│   ├── MessageBubble.tsx     # Individual message rendering
│   ├── ToolCallBlock.tsx     # Collapsible tool call output
│   ├── InlinePermissionPrompt.tsx  # Inline tool permission UI
│   ├── ChatInput.tsx         # User input with slash commands
│   ├── ChatControls.tsx      # Mode/model pickers, stop button
│   └── MCPPicker.tsx         # MCP server toggle
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

### Design Principles
- **Vault-first tool resolution**: Always prefer `app.vault.*` APIs and vault tools over Node.js `fs` or shell commands for vault content. Shell/fs is only for files outside the vault (e.g., `~/.copilot/`).
- **Interactive inline UX**: Permissions, confirmations, and errors appear inline in the chat thread — never external modals or terminal prompts.
- **Responsive during operations**: UI must remain interactive (stop button, scroll, input) while streaming or executing tools.

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

5. **Permission lifecycle**: Permission requests display as `InlinePermissionPrompt` in the chat thread. Allow → store permission + retry the pending tool call via `retryToolCall()`. Deny → cancel tool, resolve as denied. `onClose()` resolves as deny (Escape key). Permission state tracked in `pendingPermission` Zustand field. The nullable `resolvePromise` pattern prevents double-resolution.

6. **Tool call tracking**: Tool calls have unique `id` fields. `updateToolCall` matches the first *running* tool by name. `completeAllToolCalls` scans ALL messages.

## Deployment

### To local vault (development)
```bash
npm run build
cp main.js styles.css manifest.json ~/Documents/obsidian/cheerag-github-vault/.obsidian/plugins/github-copilot-chat/
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

## UI Component Patterns

### Collapsible tool call output
`ToolCallBlock.tsx` renders tool calls inside `<details>` elements — collapsed by default, expandable on click. Tool name and status show in the summary; full output inside. This keeps the chat readable when agents execute many tools.

### Autoscroll
New content triggers `scrollIntoView({ behavior: 'smooth', block: 'end' })`. If the user has scrolled up (i.e., is not near the bottom), autoscroll pauses to avoid hijacking their position. Re-engage autoscroll when the user scrolls back to the bottom.

### Inline permission prompts
`InlinePermissionPrompt.tsx` renders Allow/Deny buttons directly in the chat thread when a tool requests permission. This replaces modal dialogs that block the UI. On Allow, the permission is stored and the tool call is retried via `retryToolCall()`. On Deny, the tool is cancelled.

### Persistent stop button
The stop/cancel button in `ChatControls.tsx` must remain visible whenever work is in progress. Visibility is driven by Zustand state: show when `isGenerating || isWaitingForPermission` is true. This ensures the user can always cancel, even during tool execution or permission waits.
