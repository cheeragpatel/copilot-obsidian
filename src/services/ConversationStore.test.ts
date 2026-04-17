import type { ChatMessage } from "../types/chat";
import { ConversationStore, STORAGE_KEY, type StoredConversation } from "./ConversationStore";

function createMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "message-1",
    role: "user",
    content: "Hello Copilot",
    timestamp: 1,
    isStreaming: false,
    ...overrides,
  };
}

function createConversation(overrides: Partial<StoredConversation> = {}): StoredConversation {
  return {
    sessionId: "session-1",
    title: "Hello Copilot",
    model: "gpt-4.1",
    mode: "ask",
    messages: [createMessage()],
    lastUpdated: 100,
    createdAt: 50,
    ...overrides,
  };
}

describe("ConversationStore", () => {
  let data: Record<string, unknown>;
  let store: ConversationStore;

  beforeEach(() => {
    data = {};
    store = new ConversationStore({
      loadData: async () => data,
      saveData: async (nextData: Record<string, unknown>) => {
        data = nextData;
      },
    });
  });

  it("saves and lists persisted conversations", async () => {
    await store.save(createConversation());

    await expect(store.getConversationMetas()).resolves.toEqual([
      {
        sessionId: "session-1",
        title: "Hello Copilot",
        model: "gpt-4.1",
        lastUpdated: 100,
        messageCount: 1,
      },
    ]);
    expect(data[STORAGE_KEY]).toEqual([createConversation()]);
  });

  it("preserves createdAt when updating an existing conversation", async () => {
    await store.save(createConversation({ createdAt: 10, lastUpdated: 20 }));
    await store.save(
      createConversation({
        title: "Updated title",
        lastUpdated: 30,
        createdAt: 999,
        messages: [createMessage({ content: "Updated" })],
      }),
    );

    const conversations = await store.loadAll();
    expect(conversations).toEqual([
      createConversation({
        title: "Updated title",
        lastUpdated: 30,
        createdAt: 10,
        messages: [createMessage({ content: "Updated" })],
      }),
    ]);
  });

  it("returns cloned messages for restored conversations", async () => {
    await store.save(
      createConversation({
        messages: [
          createMessage({
            attachments: [{ path: "Notes/test.md", name: "test.md", type: "text/markdown" }],
            toolCalls: [{ id: "tool-1", name: "read", status: "complete", result: "done" }],
          }),
        ],
      }),
    );

    const messages = await store.getMessages("session-1");
    messages[0].content = "Mutated";

    await expect(store.getMessages("session-1")).resolves.toEqual([
      createMessage({
        attachments: [{ path: "Notes/test.md", name: "test.md", type: "text/markdown" }],
        toolCalls: [{ id: "tool-1", name: "read", status: "complete", result: "done" }],
      }),
    ]);
  });

  it("deletes persisted conversations", async () => {
    await store.save(createConversation());
    await store.delete("session-1");

    await expect(store.loadAll()).resolves.toEqual([]);
    expect(data[STORAGE_KEY]).toEqual([]);
  });

  it("concurrent saves do not lose data", async () => {
    const conv1 = createConversation({ sessionId: "s1", title: "First", lastUpdated: 100 });
    const conv2 = createConversation({ sessionId: "s2", title: "Second", lastUpdated: 200 });
    const conv3 = createConversation({ sessionId: "s3", title: "Third", lastUpdated: 300 });

    await Promise.all([
      store.save(conv1),
      store.save(conv2),
      store.save(conv3),
    ]);

    const all = await store.loadAll();
    const ids = all.map((c) => c.sessionId).sort();
    expect(ids).toEqual(["s1", "s2", "s3"]);
  });

  describe("concurrency", () => {
    it("concurrent saves do not lose data with sequential ordering", async () => {
      const conv1 = createConversation({ sessionId: "session-1", title: "First" });
      const conv2 = createConversation({ sessionId: "session-2", title: "Second" });

      await Promise.all([store.save(conv1), store.save(conv2)]);

      const all = await store.loadAll();
      const ids = all.map((c) => c.sessionId).sort();
      expect(ids).toEqual(["session-1", "session-2"]);
    });

    it("save handles corrupted storage gracefully via isStoredConversation guard", async () => {
      data[STORAGE_KEY] = [null, undefined, { sessionId: "valid", title: "ok", messages: [] }, "junk"];

      await expect(
        store.save(createConversation({ sessionId: "new-session", title: "New" })),
      ).resolves.toBeUndefined();

      const all = await store.loadAll();
      const ids = all.map((c) => c.sessionId).sort();
      expect(ids).toEqual(["new-session", "valid"]);
    });

    it("save() rejects when saveData throws so callers can react", async () => {
      const error = new Error("disk full");
      const failing = new ConversationStore({
        loadData: async () => ({}),
        saveData: async () => { throw error; },
      });

      await expect(failing.save(createConversation())).rejects.toBe(error);

      // Subsequent writes should still proceed (queue not poisoned)
      const ok = new ConversationStore({
        loadData: async () => ({}),
        saveData: async () => {},
      });
      await expect(ok.save(createConversation())).resolves.toBeUndefined();
    });

    it("delete() and save() are ordered through the same write queue", async () => {
      const order: string[] = [];
      const seqStore = new ConversationStore({
        loadData: async () => ({ ...data }),
        saveData: async (next) => {
          order.push("save");
          data = next;
        },
      });
      // pre-seed so delete has something to remove
      data[STORAGE_KEY] = [createConversation({ sessionId: "s1" })];

      await Promise.all([
        seqStore.save(createConversation({ sessionId: "s2", title: "T2" })),
        seqStore.delete("s1"),
        seqStore.save(createConversation({ sessionId: "s3", title: "T3" })),
      ]);

      expect(order.length).toBe(3);
      const all = await seqStore.loadAll();
      const ids = all.map((c) => c.sessionId).sort();
      expect(ids).toEqual(["s2", "s3"]);
    });

    it("loadAll skips malformed entries", async () => {
      data[STORAGE_KEY] = [
        null,
        { not: "a conversation" },
        { sessionId: "good", title: "Good", messages: [], model: "m", mode: "ask", lastUpdated: 1, createdAt: 1 },
      ];

      const all = await store.loadAll();
      expect(all.map((c) => c.sessionId)).toEqual(["good"]);
    });
  });
});
