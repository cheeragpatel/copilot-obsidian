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

---

## Quick Install

> You need a [GitHub Copilot](https://github.com/features/copilot) subscription and the Copilot CLI. See [Prerequisites](#prerequisites) below.

### Option 1: Community Plugins (once the plugin is listed)

Once the plugin is listed in Obsidian's community plugin browser, you will be able to install it this way:

1. Open Obsidian → **Settings** → **Community plugins** → **Browse**
2. Search for **"GitHub Copilot"**
3. Click **Install**, then **Enable**

Until then, use **Option 2** or **Option 3** below.

### Option 2: Manual download from GitHub Releases

1. Go to the [latest release](https://github.com/cheeragpatel/copilot-obsidian/releases/latest)
2. Download these three files: **main.js**, **manifest.json**, **styles.css**
3. In your vault folder, create a new folder:
   ```
   <your-vault>/.obsidian/plugins/github-copilot-chat/
   ```
4. Move the three downloaded files into that folder
5. Open Obsidian → **Settings** → **Community plugins** → turn off **Restricted mode** → enable **GitHub Copilot**

### Option 3: BRAT (auto-updates for beta releases)

If you use the [BRAT plugin](https://github.com/TfTHacker/obsidian42-brat) for managing beta plugins:

1. Open Obsidian → **Settings** → **BRAT** → **Add Beta Plugin**
2. Enter: `cheeragpatel/copilot-obsidian`
3. Click **Add Plugin** — BRAT will install it and keep it updated

### Option 4: Shell installer (macOS / Linux)

```bash
curl -fsSL https://raw.githubusercontent.com/cheeragpatel/copilot-obsidian/main/install.sh | bash
```

### Option 5: Build from source

For developers who want to modify the plugin:

```bash
git clone https://github.com/cheeragpatel/copilot-obsidian.git
cd copilot-obsidian
npm install
npm run build
```

Then copy the built files into your vault:

```bash
mkdir -p <VAULT>/.obsidian/plugins/github-copilot-chat
cp main.js manifest.json styles.css <VAULT>/.obsidian/plugins/github-copilot-chat/
```

---

## Prerequisites

You need two things before using this plugin:

### 1. GitHub Copilot subscription

You need an active [GitHub Copilot](https://github.com/features/copilot) subscription (Individual, Business, or Enterprise).

### 2. GitHub Copilot CLI

Install the Copilot CLI using npm (requires [Node.js](https://nodejs.org/) v18+):

```bash
npm install -g @github/copilot
```

Then sign in:

```bash
copilot auth login
```

Verify it's working:

```bash
copilot --version
```

> **Don't have Node.js?** Download it from [nodejs.org](https://nodejs.org/) — pick the LTS version. On macOS you can also use `brew install node`.

---

## Getting Started

1. Open Obsidian
2. Use the command palette (`Cmd+P` on Mac, `Ctrl+P` on Windows/Linux)
3. Type **"Open Copilot Chat"** and press Enter
4. The Copilot sidebar appears — start chatting!

You can also click the **Copilot icon** in the left ribbon to open the sidebar.

### Try these to start

- Just ask a question: *"What are the key themes in my notes about project X?"*
- Use a slash command: `/summarize` (summarizes the note you have open)
- Switch to **Agent** mode to let Copilot read and edit your vault

---

## Configuration

Open **Settings → GitHub Copilot** to configure:

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

## Custom Agents

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

---

## Troubleshooting

**"Copilot CLI not found"**
The plugin auto-detects common install paths (`/opt/homebrew/bin`, `/usr/local/bin`, etc.). If it can't find the CLI, set the full path in Settings → CLI Path. Find it with `which copilot`.

**"env: node: No such file or directory"**
Obsidian (Electron) doesn't inherit your shell PATH. The plugin adds common bin directories automatically, but if Node is in an unusual location, ensure `/path/to/node/bin` is in your system PATH or set the CLI path to the full `copilot` binary path.

**Sidebar not appearing**
Use the command palette (`Cmd/Ctrl + P`) → "Open Copilot Chat". If it still doesn't appear, try disabling and re-enabling the plugin.

**Permission prompts keep appearing**
Choose "Allow This Session" or "Always Allow" to skip repeated prompts for the same action. You can clear permanent permissions from the Obsidian developer console: `localStorage.removeItem('copilot-permanent-permissions')`.

---

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

# Run tests with coverage
npm run test:coverage
```

### Symlink for development

```bash
ln -s "$(pwd)" <VAULT>/.obsidian/plugins/github-copilot-chat
npm run dev
```

Then reload Obsidian (`Cmd/Ctrl + R`) after each change.

### Creating a release

```bash
# Bump version in package.json, then:
npm run version
git push && git push --tags
```

The GitHub Actions workflow builds and publishes the release automatically.

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

## Privacy

This plugin connects to GitHub Copilot, a cloud-based AI service. Here is what you should know about how your data is handled:

- **What is sent**: When you send a message or use agent mode, the text of your message (and any attached note content) is sent to GitHub's Copilot API for processing. No data is sent unless you explicitly interact with the chat.
- **Authentication**: You must sign in with your own GitHub account via the Copilot CLI (`copilot auth login`). The plugin does not store or manage your GitHub credentials directly.
- **No background data collection**: The plugin does not collect analytics, telemetry, or any data beyond what is needed to fulfill your chat requests.
- **External process**: The plugin launches the Copilot CLI as a local child process to communicate with GitHub's API. This is why the plugin is **desktop-only** — it requires Node.js and the Copilot CLI binary.
- **Data retention**: Data sent to GitHub Copilot is subject to [GitHub's privacy statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement) and your organization's Copilot policy settings.
- **Opt-in only**: A paid [GitHub Copilot](https://github.com/features/copilot) subscription is required. The plugin does nothing without it.

## License

MIT
