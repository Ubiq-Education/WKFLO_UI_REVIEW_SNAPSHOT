import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useChat } from './use-chat';
import { ChatMessagesProvider } from '../provider/chat-messages-provider';
import { ChatService } from '../services/chat-service';
import type {
  MessageUpdate,
  StreamingTokenUpdate,
  SubAgentActivityUpdate,
  ToolExecutionUpdate,
} from '../services/signalr-service';

// US 7974: live bubbles carry the server's timestamp (so they show the same time live and after a
// reload), and fall back to the client's clock only when an older backend sends none.

const CLIENT_NOW = new Date('2026-10-21T12:00:00Z');
const SERVER_TIME = '2026-10-21T08:30:00+00:00';

function createFakeChatService() {
  const handlers: {
    message?: (update: MessageUpdate) => void;
    tool?: (update: ToolExecutionUpdate) => void;
    subAgent?: (update: SubAgentActivityUpdate) => void;
    token?: (update: StreamingTokenUpdate) => void;
  } = {};

  return {
    handlers,
    initialize: vi.fn().mockResolvedValue(undefined),
    getConnectionState: vi.fn().mockReturnValue('Connected'),
    disconnect: vi.fn().mockResolvedValue(undefined),
    onMessageUpdate: vi.fn((h: (u: MessageUpdate) => void) => { handlers.message = h; return () => {}; }),
    onToolExecutionUpdate: vi.fn((h: (u: ToolExecutionUpdate) => void) => { handlers.tool = h; return () => {}; }),
    onSubAgentActivityUpdate: vi.fn((h: (u: SubAgentActivityUpdate) => void) => { handlers.subAgent = h; return () => {}; }),
    onStreamingToken: vi.fn((h: (u: StreamingTokenUpdate) => void) => { handlers.token = h; return () => {}; }),
    onStreamingAudio: vi.fn().mockReturnValue(() => {}),
    onTypingIndicator: vi.fn().mockReturnValue(() => {}),
    onConversationStateUpdate: vi.fn().mockReturnValue(() => {}),
    onContactFormRequest: vi.fn().mockReturnValue(() => {}),
    onContactFormCompleted: vi.fn().mockReturnValue(() => {}),
    onToolApprovalRequest: vi.fn().mockReturnValue(() => {}),
    onToolApprovalResolved: vi.fn().mockReturnValue(() => {}),
    onConversationStopped: vi.fn().mockReturnValue(() => {}),
    clearQueuedStreamingTokens: vi.fn(),
    stopAllAgents: vi.fn().mockResolvedValue({ success: true }),
    onConnectionStatusChange: vi.fn().mockReturnValue(() => {}),
    joinChat: vi.fn().mockResolvedValue(undefined),
    leaveChat: vi.fn().mockResolvedValue(undefined),
    sendTypingIndicator: vi.fn().mockResolvedValue(undefined),
    submitContactForm: vi.fn().mockResolvedValue({ success: true }),
    checkContactFormExists: vi.fn().mockResolvedValue({ success: true, data: false }),
    respondToToolApproval: vi.fn().mockResolvedValue({ success: true }),
    rateMessage: vi.fn().mockResolvedValue({}),
    getAuthHeaders: vi.fn().mockResolvedValue({}),
    sendMessage: vi.fn().mockResolvedValue({ success: true }),
    sendVoiceMessage: vi.fn().mockResolvedValue({ success: true }),
  };
}

function wrapper({ children }: { children: React.ReactNode }) {
  return <ChatMessagesProvider>{children}</ChatMessagesProvider>;
}

async function setup() {
  const service = createFakeChatService();
  const hook = renderHook(
    () => useChat(service as unknown as ChatService, { chainOfThought: false, chatId: 'session-1' }),
    { wrapper }
  );
  await waitFor(() => expect(service.onStreamingToken).toHaveBeenCalled());
  // Only Date is faked, so React and waitFor keep their real timers.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(CLIENT_NOW);
  return { service, ...hook };
}

const token = (overrides: Partial<StreamingTokenUpdate> = {}): StreamingTokenUpdate => ({
  chatId: 'session-1',
  messageId: 'reply-1',
  type: 'assistant',
  token: 'Hello ',
  isComplete: false,
  channelMessageType: 1,
  ...overrides,
});

const toolUpdate = (overrides: Partial<ToolExecutionUpdate> = {}): ToolExecutionUpdate => ({
  chatId: 'session-1',
  toolName: 'Search',
  status: 'completed',
  ...overrides,
});

const subAgentUpdate = (overrides: Partial<SubAgentActivityUpdate> = {}): SubAgentActivityUpdate => ({
  chatId: 'session-1',
  agentId: 7,
  agentName: 'Research Agent',
  action: 'Looking up data',
  status: 'started',
  ...overrides,
});

const metadataUpdate = (timestamp?: string | null): MessageUpdate => ({
  chatId: 'session-1',
  message: { id: 'm-1', type: 'system', content: 'Looked something up', timestamp, channelMessageType: 3, metadata: {} },
});

describe('useChat — server timestamps for live updates (US 7974)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('stamps a streamed bubble with the server time and keeps its first timestamp', async () => {
    const { service, result } = await setup();

    act(() => service.handlers.token!(token({ timestamp: SERVER_TIME })));
    // Later updates of the same message: same server value, or none at all - the bubble keeps the first.
    act(() => service.handlers.token!(token({ token: 'there', timestamp: '2026-10-21T09:00:00Z' })));
    act(() => service.handlers.token!(token({ token: '!', isComplete: true })));

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].content).toBe('Hello there!');
    expect(result.current.messages[0].timestamp?.toISOString()).toBe('2026-10-21T08:30:00.000Z');
  });

  it('stamps tool, sub-agent and metadata updates with the server time', async () => {
    const { service, result } = await setup();

    act(() => service.handlers.tool!(toolUpdate({ timestamp: SERVER_TIME })));
    act(() => service.handlers.subAgent!(subAgentUpdate({ timestamp: SERVER_TIME })));
    act(() => service.handlers.message!(metadataUpdate(SERVER_TIME)));

    expect(result.current.messages).toHaveLength(3);
    for (const message of result.current.messages) {
      expect(message.timestamp?.toISOString()).toBe('2026-10-21T08:30:00.000Z');
    }
  });

  it.each([
    ['absent', undefined],
    ['null', null],
    ['unparseable', 'not a date'],
    ['the .NET default', '0001-01-01T00:00:00+00:00'],
  ])('falls back to the client clock when the server timestamp is %s', async (_label, timestamp) => {
    const { service, result } = await setup();

    act(() => service.handlers.token!(token({ timestamp: timestamp ?? undefined })));
    act(() => service.handlers.tool!(toolUpdate({ timestamp: timestamp ?? undefined })));
    act(() => service.handlers.subAgent!(subAgentUpdate({ timestamp: timestamp ?? undefined })));
    act(() => service.handlers.message!(metadataUpdate(timestamp)));

    expect(result.current.messages).toHaveLength(4);
    for (const message of result.current.messages) {
      expect(message.timestamp?.toISOString()).toBe(CLIENT_NOW.toISOString());
    }
  });
});
