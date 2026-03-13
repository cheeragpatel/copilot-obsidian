# GitHub Copilot for Obsidian

An Obsidian.md plugin that brings GitHub Copilot into your vault. Chat with Copilot in a sidebar panel, use agent mode with vault-aware tools, invoke slash commands, and connect custom agents and MCP servers.

Built on the official [`@github/copilot-sdk`](https://github.com/github/copilot-sdk).

## Features

- **Ask mode** — Chat with Copilot about your notes, get writing help, brainstorm ideas
- **Agent mode** — Copilot can read, search, and navigate your vault using built-in tools
- **Slash commands** — `/explain`, `/summarize`, `/fix`, `/outline`, `/tags`, `/links`, `/new`, `/vault`, `/daily`
- **@agent mentions** — Type `@agent-name` in chat to route messages to a custom agent
- **Model selection** — Dynamically fetched from your Copilot subscription (Claude, GPT, Gemini, etc.)
- **Custom agents** — Auto-discovered from `~/.copilot/agents/`, `.copilot/agents/`, `.github/agents/`, and installed plugins
- **MCP servers** — Inherited from `.copilot/mcp.json` and `.github/copilot/mcp.json`
- **Skills** — Loaded from `.github/skills/` and `.copilot/skills/`
- **Instructions** — Loaded from `.github/copilot-instructions.md` and `.copilot/instructions/*.md`
- **Permission prompts** — Allow Once, Allow This Session, or Always Allow for tool/file/shell access
- **Streaming** — Real-time response streaming with thinking indicators
- **Markdown rendering** — Full markdown with syntax-highlighted code blocks

## Prerequisites

1. **Obsidian** v1.5.12 or later (desktop only)
2. **Node.js** v18 or later
3. **GitHub Copilot CLI** installed and authenticated

### Install the Copilot CLI

```bash
npm install -g @github/copilot
```

Verify it works:

```bash
copilot --version
```

If you haven't authenticated yet:

```bash
copilot auth login
```

## Installation

### Option A: Install from source (recommended)

1. **Clone this repo** into a local directory:

   ```bash
   git clone https://github.com/cheeragpatel/copilot-obsidian.git
   cd copilot-obsidian
   ```

2. **Install dependencies and build:**

   ```bash
   npm install
   npm run build
   ```

   This produces `main.js` in the project root.

3. **Copy the plugin into your vault:**

   ```bash
   # Replace <VAULT> with your vault path
   mkdir -p <VAULT>/.obsidian/plugins/github-copilot-for-obsidian
   cp main.js manifest.json styles.css <VAULT>/.obsidian/plugins/github-copilot-for-obsidian/
   ```

   For example:

   ```bash
   mkdir -p ~/Documents/Obsidian/MyVault/.obsidian/plugins/github-copilot-for-obsidian
   cp main.js manifest.json styles.css ~/Documents/Obsidian/MyVault/.obsidian/plugins/github-copilot-for-obsidian/
   ```

4. **Enable the plugin in Obsidian:**

   - Open Obsidian → Settings → Community plugins
   - Turn off "Restricted mode" if prompted
   - Find "GitHub Copilot for Obsidian" in the list and toggle it on

5. **Open the Copilot sidebar:**

   - Use the command palette (`Cmd/Ctrl + P`) and search for "Open Copilot Chat"
   - Or click the Copilot icon in the left ribbon

### Option B: Symlink for development

If you want live rebuilds during development:

```bash
# Clone and install
git clone https://github.com/cheeragpatel/copilot-obsidian.git
cd copilot-obsidian
npm install

# Symlink into your vault
ln -s "$(pwd)" <VAULT>/.obsidian/plugins/github-copilot-for-obsidian

# Start dev mode (auto-rebuilds on file changes)
npm run dev
```

Then enable the plugin in Obsidian settings. After each rebuild, reload Obsidian (`Cmd/Ctrl + R`) or disable/re-enable the plugin.

## Configuration

Open **Settings → GitHub Copilot for Obsidian** to configure:

| Setting | Description | Default |
|---------|-------------|---------|
| CLI Path | Path to the `copilot` binary (auto-detected) | `copilot` |
| Default Model | Model to use for new conversations | `claude-sonnet-4.6` |
| Default Mode | Start in Ask or Agent mode | Ask |
| Streaming | Enable real-time response streaming | On |
| Open on Startup | Automatically open the sidebar when Obsidian starts | Off |
| Inherit Config | Load skills, MCPs, agents, and instructions from `.copilot/` and `.github/` | On |
| System Message | Custom instructions appended to every conversation | Empty |
| Skill Directories | Paths to scan for skills | `.github/skills`, `.copilot/skills` |
| MCP Servers | Configure MCP server connections | None |
| Custom Agents | Manually define agents (in addition to auto-discovered ones) | None |

## Adding Custom Agents

Agents are auto-discovered from these locations:

- **`~/.copilot/agents/*.agent.md`** — Your global personal agents
- **`<vault>/.copilot/agents/*.md`** — Vault-local agents
- **`<vault>/.github/agents/*.md`** — Repo-style agents
- **`~/.copilot/installed-plugins/*/agents/*.md`** — Marketplace agents

Agent files use YAML frontmatter:

```markdown
---
name: "note-reviewer"
description: "Reviews notes for clarity and structure"
---

You are an expert note reviewer. Analyze the provided note for:
- Clarity and readability
- Logical structure and flow
- Missing information or gaps
- Suggestions for improvement
```

You can also add agents inline from the agent picker dropdown in the chat panel.

## Slash Commands

Type `/` in the chat input to see available commands:

| Command | Description |
|---------|-------------|
| `/explain` | Explain the active note |
| `/summarize` | Summarize the active note |
| `/fix` | Fix grammar and spelling |
| `/outline` | Generate an outline |
| `/tags` | Suggest tags for the note |
| `/links` | Find related notes to link |
| `/new` | Create a new note from a prompt |
| `/vault` | Get vault statistics |
| `/daily` | Summarize today's daily note |

## Development

```bash
# Install dependencies
npm install

# Build for production
npm run build

# Start dev mode (watch + rebuild)
npm run dev

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## Architecture

```
Obsidian (Electron)
  └─ Plugin (main.ts)
       ├─ CopilotService → @github/copilot-sdk → Copilot CLI → GitHub
       ├─ ConfigDiscovery → scans .copilot/ and .github/ for config
       ├─ React sidebar (CopilotChatView)
       │    ├─ ChatHeader
       │    ├─ MessageList → MessageBubble (markdown + syntax highlight)
       │    ├─ EmptyState (context-aware suggestions)
       │    └─ ChatInput (mode/model/agent pickers, autocomplete, send/stop/retry)
       ├─ SlashCommandRegistry (9 built-in commands)
       ├─ PermissionModal (Allow Once / Session / Always)
       └─ SettingsTab
```

## Troubleshooting

**"Copilot CLI not found"**
The plugin auto-detects common install paths (`/opt/homebrew/bin`, `/usr/local/bin`, etc.). If it can't find the CLI, set the full path in Settings → CLI Path. Find it with `which copilot`.

**"env: node: No such file or directory"**
Obsidian (Electron) doesn't inherit your shell PATH. The plugin adds common bin directories automatically, but if Node is in an unusual location, ensure `/path/to/node/bin` is in your system PATH or set the CLI path to the full `copilot` binary path.

**Sidebar not appearing**
Use the command palette (`Cmd/Ctrl + P`) → "Open Copilot Chat". If it still doesn't appear, try disabling and re-enabling the plugin.

**Permission prompts keep appearing**
Choose "Allow This Session" or "Always Allow" to skip repeated prompts for the same action. You can clear permanent permissions from browser dev tools: `localStorage.removeItem('copilot-permanent-permissions')`.

## License

MIT
