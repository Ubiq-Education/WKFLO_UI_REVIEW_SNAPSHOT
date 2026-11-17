import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useChat } from './use-chat';
import { ChatMessagesProvider } from '../provider/chat-messages-provider';
import { ChatService } from '../services/chat-service';
import type {
  ConversationStoppedUpdate,
  MessageUpdate,
  StreamingTokenUpdate,
  TypingIndicatorUpdate,
} from '../services/signalr-service';

// US 7502: the live "Stopped. All agents cancelled." divider - one per Stop, below the partial
// text - from the backend's marker message(s) and/or ConversationStopped.

function createFakeChatService() {
  const handlers: {
    message?: (update: MessageUpdate) => void;
    typing?: (update: TypingIndicatorUpdate) => void;
    token?: (update: StreamingTokenUpdate) => void;
    stopped?: (update: ConversationStoppedUpdate) => void;
  } = {};

  return {
    handlers,
    initialize: vi.fn().mockResolvedValue(undefined),
    getConnectionState: vi.fn().mockReturnValue('Connected'),
    disconnect: vi.fn().mockResolvedValue(undefined),
    onMessageUpdate: vi.fn((h: (u: MessageUpdate) => void) => { handlers.message = h; return () => {}; }),
    onToolExecutionUpdate: vi.fn().mockReturnValue(() => {}),
    onSubAgentActivityUpdate: vi.fn().mockReturnValue(() => {}),
    onStreamingToken: vi.fn((h: (u: StreamingTokenUpdate) => void) => { handlers.token = h; return () => {}; }),
    onStreamingAudio: vi.fn().mockReturnValue(() => {}),
    onTypingIndicator: vi.fn((h: (u: TypingIndicatorUpdate) => void) => { handlers.typing = h; return () => {}; }),
    onConversationStateUpdate: vi.fn().mockReturnValue(() => {}),
    onContactFormRequest: vi.fn().mockReturnValue(() => {}),
    onContactFormCompleted: vi.fn().mockReturnValue(() => {}),
    onToolApprovalRequest: vi.fn().mockReturnValue(() => {}),
    onToolApprovalResolved: vi.fn().mockReturnValue(() => {}),
    onConversationStopped: vi.fn((h: (u: ConversationStoppedUpdate) => void) => { handlers.stopped = h; return () => {}; }),
    clearQueuedStreamingTokens: vi.fn(),
    stopAllAgents: vi.fn().mockResolvedValue({ success: true }),
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

async function setup() {
  const service = createFakeChatService();
  const hook = renderHook(
    () => useChat(service as unknown as ChatService, { chainOfThought: false, chatId: 'session-1' }),
    { wrapper }
  );
  await waitFor(() => expect(service.onConversationStopped).toHaveBeenCalled());
  return { service, ...hook };
}

const token = (text: string, overrides: Partial<StreamingTokenUpdate> = {}): StreamingTokenUpdate => ({
  chatId: 'session-1',
  messageId: 'reply-1',
  type: 'assistant',
  token: text,
  isComplete: false,
  channelMessageType: 1,
  agentId: 1,
  agentName: 'MAISY',
  ...overrides,
});

// The marker as the backend pushes it on ReceiveMessage.
const marker = (stoppedAt: string, agentId = 1, agentName = 'MAISY'): MessageUpdate => ({
  chatId: 'session-1',
  agentId,
  agentName,
  chatbotIconUrl: 'https://example.com/icon.png',
  message: {
    id: `marker-${agentId}`,
    type: 'assistant',
    content: 'Stopped. All agents cancelled.',
    timestamp: stoppedAt,
    channelMessageType: 3,
    metadata: { renderAsSystem: true, isStoppedMarker: true, stoppedAt },
  },
});

const stopped = (stoppedAt: string): ConversationStoppedUpdate => ({ chatId: 'session-1', stoppedAt });

type Messages = ReturnType<typeof useChat>['messages'];
const dividers = (messages: Messages) => messages.filter(m => m.stoppedMarker);

describe('useChat — Stop divider (US 7502)', () => {
  it('shows one divider when two markers and ConversationStopped share a stoppedAt in different formats', async () => {
    const { service, result } = await setup();
    act(() => service.handlers.token!(token('Partial ')));

    act(() => service.handlers.stopped!(stopped('2026-10-19T10:00:00.123Z')));
    act(() => service.handlers.message!(marker('2026-10-19T10:00:00.1234567+00:00', 1, 'MAISY')));
    act(() => service.handlers.message!(marker('2026-10-19T11:00:00.123+01:00', 2, 'Kit')));

    expect(dividers(result.current.messages)).toHaveLength(1);
  });

  it('shows one divider when the markers arrive before ConversationStopped', async () => {
    const { service, result } = await setup();
    act(() => service.handlers.token!(token('Partial ')));

    act(() => service.handlers.message!(marker('2026-10-19T10:00:00.1234567+00:00', 1, 'MAISY')));
    act(() => service.handlers.message!(marker('2026-10-19T10:00:00.1234567+00:00', 2, 'Kit')));
    act(() => service.handlers.stopped!(stopped('2026-10-19T10:00:00.123Z')));

    expect(dividers(result.current.messages)).toHaveLength(1);
  });

  it('shows a divider from ConversationStopped alone (nothing was running)', async () => {
    const { service, result } = await setup();

    act(() => service.handlers.stopped!(stopped('2026-10-19T10:00:00Z')));

    const all = dividers(result.current.messages);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ content: 'Stopped. All agents cancelled.', stoppedMarker: { stoppedAt: '2026-10-19T10:00:00Z' } });
  });

  it('shows one divider per Stop', async () => {
    const { service, result } = await setup();

    // Real times: the second Stop happens after the second message was sent (an earlier one
    // can't have stopped that run, so it would be taken for an old Stop's echo).
    act(() => service.handlers.stopped!(stopped(new Date(Date.now() - 60_000).toISOString())));
    await act(async () => { await result.current.sendMessage('Again', 'session-1'); });
    act(() => service.handlers.stopped!(stopped(new Date(Date.now() + 1_000).toISOString())));

    expect(dividers(result.current.messages)).toHaveLength(2);
  });

  it('places the divider below the partial text, also when the marker comes later', async () => {
    const { service, result } = await setup();
    act(() => service.handlers.token!(token('Partial answer')));

    await act(async () => { await result.current.stopAllAgents(); });
    act(() => service.handlers.stopped!(stopped('2026-10-19T10:00:00Z')));
    act(() => service.handlers.message!(marker('2026-10-19T10:00:00Z')));

    const messages = result.current.messages;
    const partialIndex = messages.findIndex(m => m.id === 'reply-1');
    const dividerIndex = messages.findIndex(m => m.stoppedMarker);
    expect(partialIndex).toBeGreaterThanOrEqual(0);
    expect(dividerIndex).toBe(messages.length - 1);
    expect(dividerIndex).toBeGreaterThan(partialIndex);
  });

  it('does not drop the marker that arrives after Stop (unlike other late events)', async () => {
    const { service, result } = await setup();
    act(() => service.handlers.typing!({ chatId: 'session-1', isTyping: true, agentId: 1, agentName: 'MAISY' }));

    // Stop from this client, before its ConversationStopped echo: only the marker is known.
    await act(async () => { await result.current.stopAllAgents(); });
    act(() => service.handlers.message!(marker('2026-10-19T10:00:00Z')));

    expect(dividers(result.current.messages)).toHaveLength(1);
  });

  it('finalises the partial message: kept as it is, later chunks of the stopped run ignored', async () => {
    const { service, result } = await setup();
    act(() => service.handlers.typing!({ chatId: 'session-1', isTyping: true, agentId: 1, agentName: 'MAISY' }));
    act(() => service.handlers.token!(token('Partial ')));
    act(() => service.handlers.token!(token('answer')));

    act(() => service.handlers.stopped!(stopped('2026-10-19T10:00:00Z')));
    act(() => service.handlers.token!(token(' more', { isComplete: true })));

    const partial = result.current.messages.find(m => m.id === 'reply-1');
    expect(partial).toMatchObject({ type: 'assistant', content: 'Partial answer' });
    expect(service.clearQueuedStreamingTokens).toHaveBeenCalledWith('session-1');
    expect(result.current.isWorking).toBe(false);
    expect(result.current.isAgentTyping).toBe(false);
  });

  it('never keeps the marker as a plain assistant message', async () => {
    const { service, result } = await setup();

    act(() => service.handlers.message!(marker('2026-10-19T10:00:00Z')));

    const markerEntries = result.current.messages.filter(m => m.content === 'Stopped. All agents cancelled.');
    expect(markerEntries).toHaveLength(1);
    expect(markerEntries[0].stoppedMarker).toBeDefined();
  });
});

// US 7502: the Stop response carries stoppedAt, so the divider shows as soon as the Stop succeeds,
// right below the partial text - even when a new message is sent before ConversationStopped.
describe('useChat — Stop divider from the Stop response (US 7502)', () => {
  const STOPPED_AT = '2026-10-19T10:00:00.123Z';
  const stopResponse = (stoppedAt = STOPPED_AT) => ({ success: true, data: { sessionId: 'session-1', stoppedAt } });

  it('shows the divider from the Stop response alone, below the partial text', async () => {
    const { service, result } = await setup();
    service.stopAllAgents.mockResolvedValue(stopResponse());
    act(() => service.handlers.token!(token('Partial answer')));

    await act(async () => { await result.current.stopAllAgents(); });

    const messages = result.current.messages;
    const all = dividers(messages);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({
      id: `stopped-marker-${Date.parse(STOPPED_AT)}`,
      content: 'Stopped. All agents cancelled.',
      stoppedMarker: { stoppedAt: STOPPED_AT },
    });
    expect(messages.findIndex(m => m.stoppedMarker)).toBe(messages.findIndex(m => m.id === 'reply-1') + 1);
  });

  it('puts the divider above a message sent before the Stop response arrives', async () => {
    const { service, result } = await setup();
    let resolveStop!: (value: ReturnType<typeof stopResponse>) => void;
    service.stopAllAgents.mockReturnValue(new Promise(resolve => { resolveStop = resolve; }));
    act(() => service.handlers.token!(token('Partial answer')));

    let stopPromise!: Promise<unknown>;
    act(() => { stopPromise = result.current.stopAllAgents(); });
    // As the chat components do: add the user's message, then send it.
    act(() => result.current.addMessage({ id: 'user-2', type: 'user', content: 'Next question', timestamp: new Date(), channelMessageType: 1 }));
    await act(async () => { await result.current.sendMessage('Next question', 'session-1'); });
    await act(async () => { resolveStop(stopResponse()); await stopPromise; });
    // The echo of this Stop arrives after the new message: it must neither stop the new run nor
    // add a second divider.
    act(() => service.handlers.stopped!(stopped('2026-10-19T10:00:00.1234567+00:00')));

    const messages = result.current.messages;
    const partialIndex = messages.findIndex(m => m.id === 'reply-1');
    const dividerIndex = messages.findIndex(m => m.stoppedMarker);
    const userIndex = messages.findIndex(m => m.id === 'user-2');
    expect(dividers(messages)).toHaveLength(1);
    expect(partialIndex).toBeGreaterThanOrEqual(0);
    expect(userIndex).toBeGreaterThanOrEqual(0);
    expect(dividerIndex).toBe(partialIndex + 1);
    expect(dividerIndex).toBeLessThan(userIndex);
  });

  it('moves the divider back above a message sent after Stop when the marker beat the Stop response', async () => {
    const { service, result } = await setup();
    let resolveStop!: (value: ReturnType<typeof stopResponse>) => void;
    service.stopAllAgents.mockReturnValue(new Promise(resolve => { resolveStop = resolve; }));
    act(() => service.handlers.token!(token('Partial answer')));

    let stopPromise!: Promise<unknown>;
    act(() => { stopPromise = result.current.stopAllAgents(); });
    act(() => result.current.addMessage({ id: 'user-2', type: 'user', content: 'Next question', timestamp: new Date(), channelMessageType: 1 }));
    await act(async () => { await result.current.sendMessage('Next question', 'session-1'); });
    // The marker of the Stop arrives before its response: it lands below the new message...
    act(() => service.handlers.message!(marker('2026-10-19T10:00:00.1234567+00:00')));
    expect(result.current.messages.map(m => m.id).indexOf('user-2'))
      .toBeLessThan(result.current.messages.findIndex(m => m.stoppedMarker));

    // ...and the response puts it back right after the partial text.
    await act(async () => { resolveStop(stopResponse()); await stopPromise; });
    // A later echo of the same Stop does not move it again.
    act(() => service.handlers.stopped!(stopped('2026-10-19T10:00:00.1234567+00:00')));

    const messages = result.current.messages;
    expect(dividers(messages)).toHaveLength(1);
    const partialIndex = messages.findIndex(m => m.id === 'reply-1');
    expect(messages.findIndex(m => m.stoppedMarker)).toBe(partialIndex + 1);
    expect(messages.findIndex(m => m.id === 'user-2')).toBe(partialIndex + 2);
  });

  it('merges a later echo and markers with a differently formatted stoppedAt into the same divider', async () => {
    const { service, result } = await setup();
    service.stopAllAgents.mockResolvedValue(stopResponse());
    act(() => service.handlers.token!(token('Partial answer')));

    await act(async () => { await result.current.stopAllAgents(); });
    act(() => service.handlers.stopped!(stopped('2026-10-19T10:00:00.1234567+00:00')));
    act(() => service.handlers.message!(marker('2026-10-19T11:00:00.123+01:00', 1, 'MAISY')));
    act(() => service.handlers.message!(marker('2026-10-19T10:00:00.1239Z', 2, 'Kit')));

    const messages = result.current.messages;
    expect(dividers(messages)).toHaveLength(1);
    expect(messages.findIndex(m => m.stoppedMarker)).toBe(messages.findIndex(m => m.id === 'reply-1') + 1);
  });

  it('merges into the divider an echo that arrived before the Stop response', async () => {
    const { service, result } = await setup();
    let resolveStop!: (value: ReturnType<typeof stopResponse>) => void;
    service.stopAllAgents.mockReturnValue(new Promise(resolve => { resolveStop = resolve; }));
    act(() => service.handlers.token!(token('Partial answer')));

    let stopPromise!: Promise<unknown>;
    act(() => { stopPromise = result.current.stopAllAgents(); });
    act(() => service.handlers.stopped!(stopped('2026-10-19T10:00:00.1234567+00:00')));
    await act(async () => { resolveStop(stopResponse()); await stopPromise; });

    expect(dividers(result.current.messages)).toHaveLength(1);
  });

  it('adds no divider when the Stop call fails', async () => {
    const { service, result } = await setup();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    service.stopAllAgents.mockResolvedValue({ success: false, error: 'Request failed with status 500' });
    act(() => service.handlers.token!(token('Partial answer')));

    await act(async () => { await result.current.stopAllAgents(); });

    expect(dividers(result.current.messages)).toHaveLength(0);
    consoleError.mockRestore();
  });
});
