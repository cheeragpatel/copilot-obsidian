/**
 * Map raw SDK/CLI errors to user-friendly messages.
 * Shared by hooks + panel so error surfacing is consistent.
 */
export function friendlyError(message: string): string {
  if (message.includes("ENOENT") || message.includes("not found"))
    return "Copilot CLI not found. Install it with: npm install -g @github/copilot";
  if (message.includes("code 127"))
    return "Node.js not found. Make sure Node.js is installed and in your PATH.";
  if (message.includes("createSession"))
    return "Connection lost. Click '+' to start a new conversation.";
  if (message.includes("ECONNREFUSED"))
    return "Cannot connect to Copilot server. Check your network connection.";
  if (message.includes("auth"))
    return "Not authenticated. Run 'copilot auth login' in your terminal.";
  return message;
}
