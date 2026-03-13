import { vi } from "vitest";

export const mockSession = {
  sessionId: "test-session-123",
  on: vi.fn().mockReturnValue(vi.fn()),
  send: vi.fn().mockResolvedValue(undefined),
  sendAndWait: vi.fn().mockResolvedValue({ data: { content: "test response" } }),
  abort: vi.fn().mockResolvedValue(undefined),
  destroy: vi.fn().mockResolvedValue(undefined),
  getMessages: vi.fn().mockResolvedValue([]),
};

export const mockClient = {
  start: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue(undefined),
  createSession: vi.fn().mockResolvedValue(mockSession),
  resumeSession: vi.fn().mockResolvedValue(mockSession),
  listSessions: vi.fn().mockResolvedValue([]),
  deleteSession: vi.fn().mockResolvedValue(undefined),
  getState: vi.fn().mockReturnValue("connected"),
  ping: vi.fn().mockResolvedValue({ timestamp: Date.now() }),
};

export class CopilotClient {
  constructor(options?: any) {
    Object.assign(this, mockClient);
  }
  start = mockClient.start;
  stop = mockClient.stop;
  createSession = mockClient.createSession;
  resumeSession = mockClient.resumeSession;
  listSessions = mockClient.listSessions;
  deleteSession = mockClient.deleteSession;
  getState = mockClient.getState;
  ping = mockClient.ping;
}

export function defineTool(name: string, config: any) {
  return { name, ...config };
}

export type SessionEvent = {
  type: string;
  data: any;
};
