import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useChat } from './use-chat';
import { ChatMessagesProvider } from '../provider/chat-messages-provider';
import { ChatService } from '../services/chat-service';
import type {
  ConversationStateUpdate,
  ConversationStoppedUpdate,
  MessageUpdate,
  SubAgentActivityUpdate,
  ToolExecutionUpdate,
  TypingIndicatorUpdate,
} from '../services/signalr-service';

// US 7959: the live failed-turn marker (ReceiveMessage, Metadata channel, metadata.isError +
// errorCode) - friendly text, the failing agent's bubble stops, a terminal failure ends the run.

const TURN_FAILED_TEXT = 'Something went wrong while answering. Please try again.';
const TIMEOUT_TEXT = 'The assistant took too long to reply. Please try again.';
const TOOL_WARNING_TEXT = "A tool this assistant uses isn't available right now.";
const SUBAGENT_FAILED_TEXT = "The assistants couldn't complete your request. Please try again.";

function createFakeChatService() {
  const handlers: {
    typing?: (update: TypingIndicatorUpdate) => void;
    subAgent?: (update: SubAgentActivityUpdate) => void;
    state?: (update: ConversationStateUpdate) => void;
    stopped?: (update: ConversationStoppedUpdate) => void;
    message?: (update: MessageUpdate) => void;
    tool?: (update: ToolExecutionUpdate) => void;
  } = {};

  return {
    handlers,
    initialize: vi.fn().mockResolvedValue(undefined),
    getConnectionState: vi.fn().mockReturnValue('Connected'),
    disconnect: vi.fn().mockResolvedValue(undefined),
    onMessageUpdate: vi.fn((h: (u: MessageUpdate) => void) => { handlers.message = h; return () => {}; }),
    onToolExecutionUpdate: vi.fn((h: (u: ToolExecutionUpdate) => void) => { handlers.tool = h; return () => {}; }),
    onSubAgentActivityUpdate: vi.fn((h: (u: SubAgentActivityUpdate) => void) => { handlers.subAgent = h; return () => {}; }),
    onStreamingToken: vi.fn().mockReturnValue(() => {}),
    onStreamingAudio: vi.fn().mockReturnValue(() => {}),
    onTypingIndicator: vi.fn((h: (u: TypingIndicatorUpdate) => void) => { handlers.typing = h; return () => {}; }),
    onConversationStateUpdate: vi.fn((h: (u: ConversationStateUpdate) => void) => { handlers.state = h; return () => {}; }),
    onContactFormRequest: vi.fn().mockReturnValue(() => {}),
    onContactFormCompleted: vi.fn().mockReturnValue(() => {}),
    onToolApprovalRequest: vi.fn().mockReturnValue(() => {}),
    onToolApprovalResolved: vi.fn().mockReturnValue(() => {}),
    onConversationStopped: vi.fn((h: (u: ConversationStoppedUpdate) => void) => { handlers.stopped = h; return () => {}; }),
    clearQueuedStreamingTokens: vi.fn(),
    stopAllAgents: vi.fn().mockResolvedValue({ success: true, data: { sessionId: 'session-1', stoppedAt: '2026-10-21T10:00:00Z' } }),
    onConnectionStatusChange: vi.fn().mockReturnValue(() => {}),
    joinChat: vi.fn().mockResolvedValue(undefined),
    leaveChat: vi.fn().mockResolvedValue(undefined),
    sendTypingIndicator: vi.fn().mockResolvedValue(undefined),
    getAuthHeaders: vi.fn().mockResolvedValue({}),
    sendMessage: vi.fn().mockResolvedValue({ success: true }),
    sendVoiceMessage: vi.fn().mockResolvedValue({ success: true }),
  };
}

function wrapper({ children }: { children: React.ReactNode }) {
  return <ChatMessagesProvider>{children}</ChatMessagesProvider>;
}

async function setup(mergeSubAgentCards = false) {
  const service = createFakeChatService();
  const hook = renderHook(
    () => useChat(service as unknown as ChatService, { chainOfThought: false, chatId: 'session-1', mergeSubAgentCards }),
    { wrapper }
  );
  await waitFor(() => expect(service.onConversationStopped).toHaveBeenCalled());
  return { service, ...hook };
}

const typing = (overrides: Partial<TypingIndicatorUpdate> = {}): TypingIndicatorUpdate => ({
  chatId: 'session-1',
  isTyping: true,
  agentId: 1,
  agentName: 'Main agent',
  ...overrides,
});

const subAgent = (overrides: Partial<SubAgentActivityUpdate> = {}): SubAgentActivityUpdate => ({
  chatId: 'session-1',
  agentId: 2,
  agentName: 'Helper',
  action: 'Drafting',
  status: 'started',
  ...overrides,
});

// The marker as FailedTurnMarker sends it.
const marker = (
  metadata: Record<string, unknown> = {},
  overrides: Partial<MessageUpdate> = {},
  id = 'error-turn-1-agent-1',
): MessageUpdate => ({
  chatId: 'session-1',
  agentId: 1,
  agentName: 'Main agent',
  chatbotIconUrl: 'https://cdn.example/main.png',
  message: {
    id,
    type: 'assistant',
    content: 'Sorry, something went wrong while answering. Please try again.',
    timestamp: '2026-10-21T10:00:00Z',
    channelMessageType: 3,
    metadata: {
      renderAsSystem: true,
      isError: true,
      errorCode: 'WKFLOAI1102',
      severity: 'error',
      isTerminal: true,
      turnId: 'turn-1',
      failedAt: '2026-10-21T10:00:00.1234567Z',
      agentId: 1,
      agentName: 'Main agent',
      ...metadata,
    },
  },
  ...overrides,
});

const errorEntries = <T extends { chatError?: unknown }>(messages: T[]) => messages.filter(m => m.chatError);

describe('useChat - chat runtime errors (US 7959)', () => {
  it('shows the friendly text of the code with the failing agent, without rating data', async () => {
    const { service, result } = await setup();

    act(() => service.handlers.message!(marker()));

    const [entry] = errorEntries(result.current.messages);
    expect(entry).toMatchObject({
      id: 'error-turn-1-agent-1',
      type: 'assistant',
      content: TIMEOUT_TEXT,
      agentId: 1,
      agentName: 'Main agent',
      chatbotIconUrl: 'https://cdn.example/main.png',
      chatError: { code: 'WKFLOAI1102', severity: 'error', isTerminal: true, turnId: 'turn-1' },
    });
    expect(entry.messageId).toBeUndefined();
    expect(entry.metadata).toBeUndefined();
  });

  it('never shows backend text, for a known or an unknown code', async () => {
    const { service, result } = await setup();

    act(() => service.handlers.message!(marker({ errorCode: 'WKFLOAI1199', error: 'NullReferenceException at Foo()' }, {}, 'error-unknown')));

    const [entry] = errorEntries(result.current.messages);
    expect(entry.content).toBe(TURN_FAILED_TEXT);
    expect(JSON.stringify(result.current.messages)).not.toContain('NullReferenceException');
    expect(JSON.stringify(result.current.messages)).not.toContain('Sorry, something went wrong');
  });

  it('uses the detail code text behind ChatAgentUnavailable', async () => {
    const { service, result } = await setup();

    act(() => service.handlers.message!(marker({ errorCode: 'WKFLOAI1111', detailCode: 'WKFLOAI0305' })));

    expect(errorEntries(result.current.messages)[0].content).toBe("This assistant can't chat right now. Please try again later.");
  });

  it('takes the agent from the metadata when the envelope has none', async () => {
    const { service, result } = await setup();

    act(() => service.handlers.message!(marker(
      { agentId: 7, agentName: 'Writer', chatbotIconUrl: 'https://cdn.example/writer.png' },
      { agentId: undefined, agentName: undefined, chatbotIconUrl: undefined },
    )));

    expect(errorEntries(result.current.messages)[0]).toMatchObject({
      agentId: 7,
      agentName: 'Writer',
      chatbotIconUrl: 'https://cdn.example/writer.png',
    });
  });

  describe('terminal error', () => {
    it('stops every bubble, fails running sub-agent cards and ends the run', async () => {
      const { service, result } = await setup();

      await act(async () => { await result.current.sendMessage('Hello', 'session-1'); });
      act(() => service.handlers.typing!(typing()));
      act(() => service.handlers.subAgent!(subAgent()));
      act(() => service.handlers.typing!(typing({ agentId: 2, agentName: 'Helper' })));
      expect(result.current.typingAgents).toHaveLength(2);
      expect(result.current.isWorking).toBe(true);

      act(() => service.handlers.message!(marker()));

      expect(result.current.typingAgents).toHaveLength(0);
      expect(result.current.isWorking).toBe(false);
      expect(result.current.activeAgent).toBeNull();
      expect(result.current.sessionAgents).toHaveLength(0);
      const card = result.current.messages.find(m => m.subAgentActivity);
      expect(card?.subAgentActivity?.status).toBe('failed');
    });

    it('ends the waiting for the first event when nothing was typing yet', async () => {
      const { service, result } = await setup();

      await act(async () => { await result.current.sendMessage('Hello', 'session-1'); });
      expect(result.current.isWorking).toBe(true);

      act(() => service.handlers.message!(marker()));

      expect(result.current.isWorking).toBe(false);
    });

    it('keeps the partial text already shown', async () => {
      const { service, result } = await setup();
      act(() => result.current.addMessage({
        id: 'reply-1', type: 'assistant', content: 'Half an answer', timestamp: new Date(), channelMessageType: 1,
      }));

      act(() => service.handlers.message!(marker()));

      expect(result.current.messages.map(m => m.content)).toEqual(['Half an answer', TIMEOUT_TEXT]);
    });
  });

  describe('non-terminal error', () => {
    it('stops only the failing agent: its bubble, its running card and its avatar', async () => {
      const { service, result } = await setup();

      await act(async () => { await result.current.sendMessage('Hello', 'session-1'); });
      act(() => service.handlers.typing!(typing()));
      act(() => service.handlers.subAgent!(subAgent()));
      act(() => service.handlers.typing!(typing({ agentId: 2, agentName: 'Helper' })));

      act(() => service.handlers.message!(marker(
        { errorCode: 'WKFLOAI1116', isTerminal: false, agentId: 2, agentName: 'Helper' },
        { agentId: 2, agentName: 'Helper' },
        'error-turn-1-agent-2',
      )));

      expect(result.current.typingAgents.map(a => a.agentId)).toEqual([1]);
      expect(result.current.isWorking).toBe(true);
      expect(result.current.sessionAgents.map(a => a.agentId)).toEqual([1]);
      expect(result.current.messages.find(m => m.subAgentActivity)?.subAgentActivity?.status).toBe('failed');
      expect(errorEntries(result.current.messages)[0].content).toBe(SUBAGENT_FAILED_TEXT);
    });

    it('starts a new card when the same action runs again after an agent error (US 8159)', async () => {
      const { service, result } = await setup(true);

      await act(async () => { await result.current.sendMessage('Hello', 'session-1'); });
      act(() => service.handlers.typing!(typing()));
      act(() => service.handlers.subAgent!(subAgent()));
      act(() => service.handlers.message!(marker(
        { errorCode: 'WKFLOAI1116', isTerminal: false, agentId: 2, agentName: 'Helper' },
        { agentId: 2, agentName: 'Helper' },
        'error-turn-1-agent-2',
      )));
      act(() => service.handlers.subAgent!(subAgent()));

      const cards = result.current.messages.filter(m => m.subAgentActivity);
      expect(cards).toHaveLength(2);
      expect(cards[0].subAgentActivity?.status).toBe('failed');
      expect(cards[1].subAgentActivity?.status).toBe('started');
    });

    it("leaves another agent's running card alone", async () => {
      const { service, result } = await setup();

      act(() => service.handlers.subAgent!(subAgent()));
      act(() => service.handlers.message!(marker({ isTerminal: false })));

      expect(result.current.messages.find(m => m.subAgentActivity)?.subAgentActivity?.status).toBe('started');
      expect(result.current.isWorking).toBe(true);
    });
  });

  describe('warning', () => {
    it("stops only that agent's bubble and the run goes on", async () => {
      const { service, result } = await setup();

      await act(async () => { await result.current.sendMessage('Hello', 'session-1'); });
      act(() => service.handlers.typing!(typing()));
      act(() => service.handlers.subAgent!(subAgent()));
      act(() => service.handlers.typing!(typing({ agentId: 2, agentName: 'Helper' })));

      act(() => service.handlers.message!(marker(
        { errorCode: 'WKFLOAI1112', severity: 'warning', isTerminal: false },
        {},
        'warning-turn-1-agent-1-1112',
      )));

      expect(result.current.typingAgents.map(a => a.agentId)).toEqual([2]);
      expect(result.current.isWorking).toBe(true);
      expect(result.current.sessionAgents.map(a => a.agentId)).toEqual([1, 2]);
      expect(result.current.messages.find(m => m.subAgentActivity)?.subAgentActivity?.status).toBe('started');
      const [entry] = errorEntries(result.current.messages);
      expect(entry.content).toBe(TOOL_WARNING_TEXT);
      expect(entry.chatError).toMatchObject({ severity: 'warning', isTerminal: false });
    });

    it('is never terminal, even if flagged so', async () => {
      const { service, result } = await setup();
      act(() => service.handlers.typing!(typing({ agentId: 2, agentName: 'Helper' })));

      act(() => service.handlers.message!(marker({ errorCode: 'WKFLOAI1113', severity: 'warning', isTerminal: true })));

      expect(result.current.typingAgents.map(a => a.agentId)).toEqual([2]);
    });

    it('shows a warning and a later error of the same turn as two entries', async () => {
      const { service, result } = await setup();

      act(() => service.handlers.message!(marker({ errorCode: 'WKFLOAI1112', severity: 'warning', isTerminal: false }, {}, 'warning-1')));
      act(() => service.handlers.message!(marker({}, {}, 'error-1')));

      expect(errorEntries(result.current.messages).map(m => m.content)).toEqual([TOOL_WARNING_TEXT, TIMEOUT_TEXT]);
    });
  });

  it('shows one entry per marker id', async () => {
    const { service, result } = await setup();

    act(() => service.handlers.message!(marker()));
    act(() => service.handlers.message!(marker()));

    expect(errorEntries(result.current.messages)).toHaveLength(1);
  });

  it('a resent marker does not end a run that started since', async () => {
    const { service, result } = await setup();
    act(() => service.handlers.message!(marker()));

    await act(async () => { await result.current.sendMessage('Again', 'session-1'); });
    act(() => service.handlers.typing!(typing()));
    act(() => service.handlers.message!(marker()));

    expect(result.current.isWorking).toBe(true);
    expect(result.current.typingAgents).toHaveLength(1);
  });

  it('ignores a marker that arrives after Stop', async () => {
    const { service, result } = await setup();
    await act(async () => { await result.current.sendMessage('Hello', 'session-1'); });
    act(() => service.handlers.typing!(typing()));
    await act(async () => { await result.current.stopAllAgents(); });

    act(() => service.handlers.message!(marker()));

    expect(errorEntries(result.current.messages)).toHaveLength(0);
  });

  it('ignores a marker of another chat', async () => {
    const { service, result } = await setup();
    act(() => service.handlers.typing!(typing()));

    act(() => service.handlers.message!(marker({}, { chatId: 'session-2' })));

    expect(errorEntries(result.current.messages)).toHaveLength(0);
    expect(result.current.typingAgents).toHaveLength(1);
  });

  it('leaves other metadata messages as they were', async () => {
    const { service, result } = await setup();

    act(() => service.handlers.message!(marker({ isError: undefined, errorCode: undefined, url: 'https://example.com' }, {}, 'meta-1')));

    expect(errorEntries(result.current.messages)).toHaveLength(0);
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].metadata?.url).toBe('https://example.com');
  });

  it('describes a failed tool by its error code, never by its error text', async () => {
    const { service, result } = await setup();

    act(() => service.handlers.tool!({
      chatId: 'session-1',
      toolName: 'Docs server',
      status: 'failed',
      error: 'HttpRequestException: 500 at docs.internal',
      errorCode: 'WKFLOAI1113',
    }));

    const toolEntry = result.current.messages.find(m => m.type === 'tool');
    expect(toolEntry?.content).toBe(`❌ Failed to execute Docs server ${TOOL_WARNING_TEXT}`);
    expect(JSON.stringify(result.current.messages)).not.toContain('HttpRequestException');
  });
});
