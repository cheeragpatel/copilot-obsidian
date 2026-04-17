import type { ChatMessage, ConversationMeta } from "../types/chat";

export interface StoredConversation {
  sessionId: string;
  title: string;
  model: string;
  mode: string;
  messages: ChatMessage[];
  lastUpdated: number;
  createdAt: number;
}

export const STORAGE_KEY = "copilot-conversations";
const MAX_CONVERSATIONS = 50;

interface PluginDataStore {
  loadData(): Promise<Record<string, unknown> | null>;
  saveData(data: Record<string, unknown>): Promise<void>;
}

function cloneMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((message) => ({
    ...message,
    attachments: message.attachments?.map((attachment) => ({ ...attachment })),
    toolCalls: message.toolCalls?.map((toolCall) => ({ ...toolCall })),
  }));
}

function cloneConversation(conversation: StoredConversation): StoredConversation {
  return {
    ...conversation,
    messages: cloneMessages(conversation.messages),
  };
}

export function isStoredConversation(value: unknown): value is StoredConversation {
  if (!value || typeof value !== "object") return false;
  const c = value as Partial<StoredConversation>;
  return (
    typeof c.sessionId === "string" &&
    typeof c.title === "string" &&
    Array.isArray(c.messages)
  );
}

export interface ConversationStoreLike {
  loadAll(): Promise<StoredConversation[]>;
  save(conversation: StoredConversation): Promise<void>;
  delete(sessionId: string): Promise<void>;
  getConversationMetas(): Promise<ConversationMeta[]>;
  getMessages(sessionId: string): Promise<ChatMessage[]>;
}

export class ConversationStore implements ConversationStoreLike {
  private plugin: PluginDataStore;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(plugin: PluginDataStore) {
    this.plugin = plugin;
  }

  private async readData(): Promise<Record<string, unknown>> {
    return (await this.plugin.loadData()) || {};
  }

  async loadAll(): Promise<StoredConversation[]> {
    const data = await this.readData();
    const stored = data[STORAGE_KEY];
    if (!Array.isArray(stored)) {
      return [];
    }

    const valid: StoredConversation[] = [];
    for (const entry of stored) {
      if (isStoredConversation(entry)) {
        valid.push(cloneConversation(entry));
      }
    }
    return valid;
  }

  save(conversation: StoredConversation): Promise<void> {
    const op = this.writeQueue.then(() => this._save(conversation));
    this.writeQueue = op.catch(() => {});
    return op;
  }

  delete(sessionId: string): Promise<void> {
    const op = this.writeQueue.then(() => this._delete(sessionId));
    this.writeQueue = op.catch(() => {});
    return op;
  }

  private async _save(conversation: StoredConversation): Promise<void> {
    const data = await this.readData();
    const stored = data[STORAGE_KEY];
    const conversations: StoredConversation[] = Array.isArray(stored)
      ? stored.filter(isStoredConversation).map(cloneConversation)
      : [];

    const index = conversations.findIndex((item) => item.sessionId === conversation.sessionId);
    const existing = index >= 0 ? conversations[index] : null;
    const nextConversation: StoredConversation = {
      ...conversation,
      createdAt: existing?.createdAt ?? conversation.createdAt,
      messages: cloneMessages(conversation.messages),
    };

    if (index >= 0) {
      conversations[index] = nextConversation;
    } else {
      conversations.unshift(nextConversation);
    }

    conversations.sort((left, right) => right.lastUpdated - left.lastUpdated);
    data[STORAGE_KEY] = conversations.slice(0, MAX_CONVERSATIONS);
    await this.plugin.saveData(data);
  }

  private async _delete(sessionId: string): Promise<void> {
    const data = await this.readData();
    const stored = data[STORAGE_KEY];
    const conversations: StoredConversation[] = Array.isArray(stored)
      ? stored.filter(isStoredConversation)
      : [];
    data[STORAGE_KEY] = conversations.filter((conversation) => conversation.sessionId !== sessionId);
    await this.plugin.saveData(data);
  }

  async getConversationMetas(): Promise<ConversationMeta[]> {
    const conversations = await this.loadAll();
    return conversations
      .sort((left, right) => right.lastUpdated - left.lastUpdated)
      .map((conversation) => ({
        sessionId: conversation.sessionId,
        title: conversation.title,
        model: conversation.model,
        lastUpdated: conversation.lastUpdated,
        messageCount: conversation.messages.length,
      }));
  }

  async getMessages(sessionId: string): Promise<ChatMessage[]> {
    const conversations = await this.loadAll();
    const conversation = conversations.find((item) => item.sessionId === sessionId);
    return conversation ? cloneMessages(conversation.messages) : [];
  }
}
