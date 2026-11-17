import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useChat } from './use-chat';
import { ChatMessagesProvider } from '../provider/chat-messages-provider';
import { ChatService } from '../services/chat-service';
import { GENERIC_CHAT_SEND_ERROR } from '../utils/chat-send-errors';
import type {
  ContactFormUpdate,
  ConversationStateUpdate,
  MessageUpdate,
  ToolExecutionUpdate,
  ConversationStoppedUpdate,
  StreamingAudioUpdate,
  StreamingTokenUpdate,
  SubAgentActivityUpdate,
  ToolApprovalRequestUpdate,
  TypingIndicatorUpdate,
} from '../services/signalr-service';

// US 7500/7501: useChat's isWorking flag (drives the Send/Stop swap) and stopAllAgents (Stop
// cancels every agent; the UI goes idle at once and ignores late events of the stopped run).

function createFakeChatService() {
  const handlers: {
    typing?: (update: TypingIndicatorUpdate) => void;
    subAgent?: (update: SubAgentActivityUpdate) => void;
    token?: (update: StreamingTokenUpdate) => void;
    state?: (update: ConversationStateUpdate) => void;
    contactForm?: (update: ContactFormUpdate) => void;
    approvalRequest?: (update: ToolApprovalRequestUpdate) => void;
    stopped?: (update: ConversationStoppedUpdate) => void;
    audio?: (update: StreamingAudioUpdate) => void;
    message?: (update: MessageUpdate) => void;
    tool?: (update: ToolExecutionUpdate) => void;
    connection?: (connected: boolean) => void;
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
    onStreamingAudio: vi.fn((h: (u: StreamingAudioUpdate) => void) => { handlers.audio = h; return () => {}; }),
    onTypingIndicator: vi.fn((h: (u: TypingIndicatorUpdate) => void) => { handlers.typing = h; return () => {}; }),
    onConversationStateUpdate: vi.fn((h: (u: ConversationStateUpdate) => void) => { handlers.state = h; return () => {}; }),
    onContactFormRequest: vi.fn((h: (u: ContactFormUpdate) => void) => { handlers.contactForm = h; return () => {}; }),
    onContactFormCompleted: vi.fn().mockReturnValue(() => {}),
    onToolApprovalRequest: vi.fn((h: (u: ToolApprovalRequestUpdate) => void) => { handlers.approvalRequest = h; return () => {}; }),
    onToolApprovalResolved: vi.fn().mockReturnValue(() => {}),
    onConversationStopped: vi.fn((h: (u: ConversationStoppedUpdate) => void) => { handlers.stopped = h; return () => {}; }),
    clearQueuedStreamingTokens: vi.fn(),
    stopAllAgents: vi.fn().mockResolvedValue({ success: true, data: { sessionId: 'session-1', stoppedAt: '2026-10-19T10:00:00Z' } }),
    onConnectionStatusChange: vi.fn((h: (connected: boolean) => void) => { handlers.connection = h; return () => {}; }),
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

const token = (text: string, overrides: Partial<StreamingTokenUpdate> = {}): StreamingTokenUpdate => ({
  chatId: 'session-1',
  messageId: 'reply-1',
  type: 'assistant',
  token: text,
  isComplete: false,
  channelMessageType: 1,
  agentId: 1,
  agentName: 'Main agent',
  ...overrides,
});

const contactForm = (overrides: Partial<ContactFormUpdate> = {}): ContactFormUpdate => ({
  chatId: 'session-1',
  message: 'Please register',
  mandatory: true,
  firstNameRequired: true,
  lastNameRequired: false,
  emailRequired: true,
  submitButtonText: 'Send',
  successMessageEnabled: false,
  successMessageText: '',
  ...overrides,
});

describe('useChat — isWorking (US 7500/7501)', () => {
  it('is off before anything is sent', async () => {
    const { result } = await setup();
    expect(result.current.isWorking).toBe(false);
  });

  it('turns on as soon as a message is sent, before any typing event', async () => {
    const { service, result } = await setup();
    let resolveSend!: (value: { success: boolean }) => void;
    service.sendMessage.mockReturnValueOnce(new Promise(resolve => { resolveSend = resolve; }));

    let sending!: Promise<unknown>;
    act(() => { sending = result.current.sendMessage('Hello', 'session-1'); });
    expect(result.current.isWorking).toBe(true);

    await act(async () => { resolveSend({ success: true }); await sending; });
    // The request finished but no agent has said anything yet: still working, no gap.
    expect(result.current.isWorking).toBe(true);

    act(() => service.handlers.typing!(typing()));
    expect(result.current.isWorking).toBe(true);

    act(() => service.handlers.typing!(typing({ isTyping: false })));
    expect(result.current.isWorking).toBe(false);
  });

  it('stays on through a hand-off until the last agent finishes', async () => {
    const { service, result } = await setup();

    await act(async () => { await result.current.sendMessage('Hello', 'session-1'); });
    act(() => service.handlers.typing!(typing()));
    act(() => service.handlers.subAgent!(subAgent()));
    act(() => service.handlers.typing!(typing({ isTyping: false })));
    expect(result.current.isWorking).toBe(true);

    act(() => service.handlers.typing!(typing({ agentId: 2, agentName: 'Helper' })));
    act(() => service.handlers.typing!(typing({ agentId: 2, agentName: 'Helper', isTyping: false })));
    expect(result.current.isWorking).toBe(true);

    act(() => service.handlers.subAgent!(subAgent({ status: 'completed' })));
    expect(result.current.isWorking).toBe(false);
  });

  it('turns off when a tool approval waits for the user', async () => {
    const { service, result } = await setup();

    await act(async () => { await result.current.sendMessage('Hello', 'session-1'); });
    act(() => service.handlers.typing!(typing()));
    act(() => service.handlers.approvalRequest!({
      chatId: 'session-1',
      sessionId: 'session-1',
      approvalId: 'approval-1',
      toolName: 'Docs server',
      functionName: 'create_doc',
      expiresAtUtc: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    }));

    expect(result.current.isWorking).toBe(false);
  });

  it('turns off when the send fails', async () => {
    const { service, result } = await setup();
    service.sendMessage.mockResolvedValueOnce({ success: false, error: 'Nope' });

    await act(async () => { await result.current.sendMessage('Hello', 'session-1'); });

    expect(result.current.isWorking).toBe(false);
  });

  it('turns off when the conversation goes idle without any typing event', async () => {
    const { service, result } = await setup();

    await act(async () => { await result.current.sendMessage('Hello', 'session-1'); });
    act(() => service.handlers.state!({ chatId: 'session-1', state: 'idle' }));

    expect(result.current.isWorking).toBe(false);
  });

  it('treats a cancelled sub-agent as not working', async () => {
    const { service, result } = await setup();

    act(() => service.handlers.subAgent!(subAgent()));
    act(() => service.handlers.subAgent!(subAgent({ status: 'cancelled' })));

    expect(result.current.isWorking).toBe(false);
  });
});

describe('useChat — stopAllAgents (US 7501)', () => {
  async function setupWorking() {
    const context = await setup();
    const { service, result } = context;
    await act(async () => { await result.current.sendMessage('Hello', 'session-1'); });
    act(() => service.handlers.typing!(typing()));
    act(() => service.handlers.token!(token('Partial ')));
    act(() => service.handlers.subAgent!(subAgent()));
    return context;
  }

  it('goes back to idle at once, without waiting for the server', async () => {
    const { service, result } = await setupWorking();
    service.stopAllAgents.mockReturnValueOnce(new Promise(() => {})); // never answers

    act(() => { void result.current.stopAllAgents(); });

    expect(result.current.isWorking).toBe(false);
    expect(service.stopAllAgents).toHaveBeenCalledWith('session-1');
  });

  it('drops the queued chunks but keeps the text already shown', async () => {
    const { service, result } = await setupWorking();

    await act(async () => { await result.current.stopAllAgents(); });

    expect(service.clearQueuedStreamingTokens).toHaveBeenCalledWith('session-1');
    expect(result.current.messages.find(m => m.id === 'reply-1')?.content).toBe('Partial ');
  });

  it('clears the Agents bar: no active agent and no agents left (Task 7947)', async () => {
    const { result } = await setupWorking();
    expect(result.current.activeAgent?.agentName).toBe('Helper');

    await act(async () => { await result.current.stopAllAgents(); });

    expect(result.current.activeAgent).toBeNull();
    expect(result.current.typingAgents).toEqual([]);
    expect(result.current.sessionAgents).toEqual([]);
  });

  it('marks the running sub-agent card as cancelled and leaves finished ones alone', async () => {
    const { service, result } = await setup();
    act(() => service.handlers.subAgent!(subAgent({ agentId: 3, agentName: 'Writer' })));
    act(() => service.handlers.subAgent!(subAgent({ agentId: 3, agentName: 'Writer', status: 'completed' })));
    act(() => service.handlers.subAgent!(subAgent()));

    await act(async () => { await result.current.stopAllAgents(); });

    const statuses = result.current.messages
      .filter(m => m.subAgentActivity)
      .map(m => `${m.subAgentActivity!.agentName}:${m.subAgentActivity!.status}`);
    expect(statuses).toEqual(['Writer:started', 'Writer:completed', 'Helper:cancelled']);
  });

  it('merges a run into one card where the Agents bar is shown (US 8159)', async () => {
    const { service, result } = await setup(true);
    act(() => service.handlers.subAgent!(subAgent({ agentId: 3, agentName: 'Writer' })));
    act(() => service.handlers.subAgent!(subAgent({ agentId: 3, agentName: 'Writer', status: 'completed' })));
    act(() => service.handlers.subAgent!(subAgent()));

    await act(async () => { await result.current.stopAllAgents(); });

    const statuses = result.current.messages
      .filter(m => m.subAgentActivity)
      .map(m => `${m.subAgentActivity!.agentName}:${m.subAgentActivity!.status}`);
    expect(statuses).toEqual(['Writer:completed', 'Helper:cancelled']);
  });

  it('ignores late events of the stopped run', async () => {
    const { service, result } = await setupWorking();

    await act(async () => { await result.current.stopAllAgents(); });
    act(() => service.handlers.stopped!({ chatId: 'session-1', stoppedAt: '2026-10-19T10:00:00Z' }));
    act(() => service.handlers.typing!(typing()));
    act(() => service.handlers.token!(token('more text')));
    act(() => service.handlers.subAgent!(subAgent({ agentId: 4, agentName: 'Late' })));

    expect(result.current.isWorking).toBe(false);
    expect(result.current.activeAgent).toBeNull();
    expect(result.current.messages.find(m => m.id === 'reply-1')?.content).toBe('Partial ');
    expect(result.current.messages.some(m => m.subAgentActivity?.agentName === 'Late')).toBe(false);
  });

  it('drops contact forms queued during the run and ignores late ones', async () => {
    const { service, result } = await setupWorking();
    act(() => service.handlers.contactForm!(contactForm()));
    expect(result.current.hasMandatoryPendingContactForm).toBe(true);

    await act(async () => { await result.current.stopAllAgents(); });
    act(() => service.handlers.contactForm!(contactForm()));

    expect(result.current.hasMandatoryPendingContactForm).toBe(false);
    expect(result.current.messages.some(m => m.contactForm)).toBe(false);
  });

  it('keeps the connection: never disconnects or leaves the chat', async () => {
    const { service, result } = await setupWorking();

    await act(async () => { await result.current.stopAllAgents(); });

    expect(service.disconnect).not.toHaveBeenCalled();
    expect(service.leaveChat).not.toHaveBeenCalled();
    expect(result.current.connectionState).toBe('Connected');
  });

  it('listens again from the next message on, and its own late echo does not stop it', async () => {
    const { service, result } = await setupWorking();
    let resolveStop!: (value: { success: boolean }) => void;
    service.stopAllAgents.mockReturnValueOnce(new Promise(resolve => { resolveStop = resolve; }));

    let stopping!: Promise<unknown>;
    act(() => { stopping = result.current.stopAllAgents(); });
    await act(async () => { await result.current.sendMessage('Next question', 'session-1'); });
    act(() => service.handlers.typing!(typing()));
    expect(result.current.isWorking).toBe(true);

    // The echo of the first Stop arrives after the new message went out.
    act(() => service.handlers.stopped!({ chatId: 'session-1', stoppedAt: '2026-10-19T10:00:00Z' }));
    await act(async () => { resolveStop({ success: true }); await stopping; });

    expect(result.current.isWorking).toBe(true);
    expect(result.current.activeAgent?.agentName).toBe('Main agent');
  });

  it('applies a Stop made from another client showing the same chat', async () => {
    const { service, result } = await setupWorking();

    act(() => service.handlers.stopped!({ chatId: 'session-1', stoppedAt: '2026-10-19T10:00:00Z' }));

    expect(result.current.isWorking).toBe(false);
    expect(result.current.activeAgent).toBeNull();
    expect(service.stopAllAgents).not.toHaveBeenCalled();
  });

  it('ignores a ConversationStopped for another chat', async () => {
    const { service, result } = await setupWorking();

    act(() => service.handlers.stopped!({ chatId: 'other-session', stoppedAt: '2026-10-19T10:00:00Z' }));

    expect(result.current.isWorking).toBe(true);
  });

  it('shows the run again when the server could not stop it', async () => {
    const { service, result } = await setupWorking();
    service.stopAllAgents.mockResolvedValueOnce({ success: false, statusCode: 400, error: 'Bad session' });

    let outcome: { success: boolean; error?: string } | undefined;
    await act(async () => { outcome = await result.current.stopAllAgents(); });
    expect(outcome?.success).toBe(false);

    act(() => service.handlers.typing!(typing()));
    expect(result.current.isWorking).toBe(true);
  });
});

describe('useChat — Stop edge cases (US 7501)', () => {
  const stoppedEcho = (): ConversationStoppedUpdate => ({ chatId: 'session-1', stoppedAt: '2026-10-19T10:00:00Z' });

  async function sendStopSend() {
    const context = await setup();
    const { service, result } = context;
    await act(async () => { await result.current.sendMessage('Hello', 'session-1'); });
    act(() => service.handlers.typing!(typing()));
    await act(async () => { await result.current.stopAllAgents(); });
    await act(async () => { await result.current.sendMessage('Next question', 'session-1'); });
    return context;
  }

  it('stays working through the real late events of the stopped run until the new run types', async () => {
    const { service, result } = await sendStopSend();
    expect(result.current.isWorking).toBe(true);
    const typingOff = () => act(() => service.handlers.typing!(typing({ isTyping: false })));
    const idle = () => act(() => service.handlers.state!({ chatId: 'session-1', state: 'idle' }));

    // The backend's order after a quick Stop -> Send: the Stop endpoint's typing-off, idle and
    // ConversationStopped, then the cancelled turn's own typing-off and idle again.
    typingOff();
    expect(result.current.isWorking).toBe(true);
    idle();
    expect(result.current.isWorking).toBe(true);
    act(() => service.handlers.stopped!(stoppedEcho()));
    expect(result.current.isWorking).toBe(true);
    typingOff();
    expect(result.current.isWorking).toBe(true);
    idle();
    expect(result.current.isWorking).toBe(true);

    // The new run starts typing: working, as before.
    act(() => service.handlers.typing!(typing()));
    expect(result.current.isWorking).toBe(true);
    expect(result.current.activeAgent?.agentName).toBe('Main agent');

    // From then on its own end ends it.
    typingOff();
    idle();
    expect(result.current.isWorking).toBe(false);
  });

  it('also stays working when a running sub-agent is the first sign of work of the new run', async () => {
    const { service, result } = await sendStopSend();
    act(() => service.handlers.state!({ chatId: 'session-1', state: 'idle' }));

    act(() => service.handlers.subAgent!(subAgent()));
    act(() => service.handlers.subAgent!(subAgent({ status: 'completed' })));
    act(() => service.handlers.state!({ chatId: 'session-1', state: 'idle' }));

    expect(result.current.isWorking).toBe(false);
  });

  it('ends the next run at once when it fails before any work, before the Stop echo', async () => {
    const { service, result } = await sendStopSend();
    act(() => service.handlers.typing!(typing({ isTyping: false })));
    act(() => service.handlers.state!({ chatId: 'session-1', state: 'idle' }));
    expect(result.current.isWorking).toBe(true);

    act(() => service.handlers.state!({ chatId: 'session-1', state: 'error' }));

    expect(result.current.isWorking).toBe(false);
  });

  it('ends the next run at once when it fails before any work, after the Stop echo and late events', async () => {
    const { service, result } = await sendStopSend();
    act(() => service.handlers.state!({ chatId: 'session-1', state: 'idle' }));
    act(() => service.handlers.stopped!(stoppedEcho()));
    act(() => service.handlers.typing!(typing({ isTyping: false })));
    act(() => service.handlers.state!({ chatId: 'session-1', state: 'idle' }));
    expect(result.current.isWorking).toBe(true);

    act(() => service.handlers.state!({ chatId: 'session-1', state: 'error' }));

    expect(result.current.isWorking).toBe(false);
  });

  it('ends the next run on error even when the stopped run had already ended before the send', async () => {
    const context = await setup();
    const { service, result } = context;
    await act(async () => { await result.current.sendMessage('Hello', 'session-1'); });
    act(() => service.handlers.typing!(typing()));
    await act(async () => { await result.current.stopAllAgents(); });
    act(() => service.handlers.state!({ chatId: 'session-1', state: 'idle' }));
    await act(async () => { await result.current.sendMessage('Next question', 'session-1'); });

    act(() => service.handlers.state!({ chatId: 'session-1', state: 'error' }));

    expect(result.current.isWorking).toBe(false);
  });

  it('does not end the waiting state on a typing-off, even with no Stop involved', async () => {
    const { service, result } = await setup();
    await act(async () => { await result.current.sendMessage('Hello', 'session-1'); });

    act(() => service.handlers.typing!(typing({ isTyping: false })));

    expect(result.current.isWorking).toBe(true);
  });

  it('still ends the waiting state on idle when no Stop is involved', async () => {
    const { service, result } = await setup();
    await act(async () => { await result.current.sendMessage('Hello', 'session-1'); });

    act(() => service.handlers.state!({ chatId: 'session-1', state: 'idle' }));

    expect(result.current.isWorking).toBe(false);
  });

  describe('telling its own Stop echo from a real Stop, by stoppedAt', () => {
    const laterStop = (): ConversationStoppedUpdate => ({ chatId: 'session-1', stoppedAt: new Date(Date.now() + 1000).toISOString() });

    it('ignores its own echo but applies a later Stop (e.g. from another tab) right after Stop -> Send', async () => {
      const { service, result } = await sendStopSend();
      act(() => service.handlers.typing!(typing()));

      // The echo of this client's Stop (same stoppedAt as the Stop response): ignored.
      act(() => service.handlers.stopped!(stoppedEcho()));
      expect(result.current.isWorking).toBe(true);

      // Another client stops the new run a moment later, well inside the old 15 s window: applied.
      act(() => service.handlers.stopped!(laterStop()));
      expect(result.current.isWorking).toBe(false);
      expect(result.current.activeAgent).toBeNull();
    });

    it('applies a later Stop even before its own echo has arrived', async () => {
      const { service, result } = await sendStopSend();
      act(() => service.handlers.typing!(typing()));

      act(() => service.handlers.stopped!(laterStop()));

      expect(result.current.isWorking).toBe(false);
    });

    it('takes the stoppedAt of a first echo that beats the Stop response', async () => {
      const context = await setup();
      const { service, result } = context;
      await act(async () => { await result.current.sendMessage('Hello', 'session-1'); });
      act(() => service.handlers.typing!(typing()));
      let resolveStop!: (value: { success: boolean }) => void;
      service.stopAllAgents.mockReturnValueOnce(new Promise(resolve => { resolveStop = resolve; }));
      let stopping!: Promise<unknown>;
      act(() => { stopping = result.current.stopAllAgents(); });

      // The echo arrives before the response (which here carries no stoppedAt).
      act(() => service.handlers.stopped!(stoppedEcho()));
      await act(async () => { await result.current.sendMessage('Next question', 'session-1'); });
      await act(async () => { resolveStop({ success: true }); await stopping; });
      act(() => service.handlers.typing!(typing()));

      // A repeat of that echo is still ignored; a later Stop applies.
      act(() => service.handlers.stopped!(stoppedEcho()));
      expect(result.current.isWorking).toBe(true);
      act(() => service.handlers.stopped!(laterStop()));
      expect(result.current.isWorking).toBe(false);
    });

    it('ignores another Stop of the old run that happened before the new message was sent', async () => {
      const { service, result } = await sendStopSend();
      act(() => service.handlers.typing!(typing()));

      // Later than this client's Stop (10:00:00Z) but long before the new send.
      act(() => service.handlers.stopped!({ chatId: 'session-1', stoppedAt: '2026-10-19T10:00:05Z' }));

      expect(result.current.isWorking).toBe(true);
    });

    it('applies a Stop from another client when this client never stopped', async () => {
      const { service, result } = await setup();
      await act(async () => { await result.current.sendMessage('Hello', 'session-1'); });
      act(() => service.handlers.typing!(typing()));

      act(() => service.handlers.stopped!({ chatId: 'session-1', stoppedAt: '2020-01-01T00:00:00Z' }));

      expect(result.current.isWorking).toBe(false);
    });
  });

  // Fallback for a ConversationStopped without a readable stoppedAt: within the echo window after
  // this client's Stop it is taken for the echo; the window ends on a real reconnect or after 15 s.
  describe('an echo without a readable stoppedAt', () => {
    const echoWithoutTime = (): ConversationStoppedUpdate => ({ chatId: 'session-1', stoppedAt: '' });

    it('is taken for the echo inside the window', async () => {
      const { service, result } = await sendStopSend();
      act(() => service.handlers.typing!(typing()));

      act(() => service.handlers.stopped!(echoWithoutTime()));

      expect(result.current.isWorking).toBe(true);
    });

    it('is a real Stop after a reconnect', async () => {
      const { service, result } = await sendStopSend();
      act(() => service.handlers.typing!(typing()));

      act(() => service.handlers.connection!(false));
      act(() => service.handlers.connection!(true));
      act(() => service.handlers.stopped!(echoWithoutTime()));

      expect(result.current.isWorking).toBe(false);
      expect(result.current.activeAgent).toBeNull();
    });

    it('is still taken for the echo when the connection subscription is set up again while connected', async () => {
      const service = createFakeChatService();
      const { result, rerender } = renderHook(
        ({ onConnectionChange }: { onConnectionChange: (connected: boolean) => void }) =>
          useChat(service as unknown as ChatService, { chainOfThought: false, chatId: 'session-1', onConnectionChange }),
        { wrapper, initialProps: { onConnectionChange: () => {} } }
      );
      await waitFor(() => expect(service.onConnectionStatusChange).toHaveBeenCalled());
      // Like SignalRService, every subscription is called at once with the current state.
      service.onConnectionStatusChange.mockImplementation((h: (connected: boolean) => void) => {
        service.handlers.connection = h;
        h(true);
        return () => {};
      });
      act(() => service.handlers.connection!(true));
      await act(async () => { await result.current.sendMessage('Hello', 'session-1'); });
      act(() => service.handlers.typing!(typing()));
      await act(async () => { await result.current.stopAllAgents(); });
      await act(async () => { await result.current.sendMessage('Next question', 'session-1'); });
      act(() => service.handlers.typing!(typing()));
      const subscriptions = service.onConnectionStatusChange.mock.calls.length;

      // A new callback re-runs the subscription effect while connected.
      rerender({ onConnectionChange: () => {} });
      expect(service.onConnectionStatusChange.mock.calls.length).toBeGreaterThan(subscriptions);

      act(() => service.handlers.stopped!(echoWithoutTime()));
      expect(result.current.isWorking).toBe(true);
      expect(result.current.activeAgent?.agentName).toBe('Main agent');
    });

    it('is a real Stop after the window', async () => {
      const { service, result } = await sendStopSend();
      act(() => service.handlers.typing!(typing()));
      const dateNow = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 15001);

      act(() => service.handlers.stopped!(echoWithoutTime()));

      dateNow.mockRestore();
      expect(result.current.isWorking).toBe(false);
    });
  });
});

describe('useChat — voice message after Stop (US 7501)', () => {
  class FakeRecognition {
    static instances: FakeRecognition[] = [];
    continuous = false;
    interimResults = false;
    lang = '';
    maxAlternatives = 1;
    onresult: ((event: unknown) => void) | null = null;
    onerror: ((event: unknown) => void) | null = null;
    onend: (() => void) | null = null;
    onstart: (() => void) | null = null;
    start = vi.fn();
    stop = vi.fn();
    abort = vi.fn();
    constructor() { FakeRecognition.instances.push(this); }
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    FakeRecognition.instances = [];
  });

  function speak(transcript: string) {
    const recognition = FakeRecognition.instances[FakeRecognition.instances.length - 1];
    const finalResult = Object.assign([{ transcript }], { isFinal: true });
    act(() => recognition.onresult!({ results: [finalResult] }));
  }

  async function setupVoice() {
    vi.stubGlobal('SpeechRecognition', FakeRecognition);
    const context = await setup();
    await waitFor(() => expect(FakeRecognition.instances.length).toBeGreaterThan(0));
    return context;
  }

  it('is working right after it is sent, and its reply is shown even right after Stop', async () => {
    const { service, result } = await setupVoice();
    await act(async () => { await result.current.sendMessage('Hello', 'session-1'); });
    act(() => service.handlers.typing!(typing()));
    await act(async () => { await result.current.stopAllAgents(); });
    expect(result.current.isWorking).toBe(false);

    speak('What about tomorrow');
    await waitFor(() => expect(service.sendVoiceMessage).toHaveBeenCalledWith(expect.objectContaining({ text: 'What about tomorrow' })));
    expect(result.current.isWorking).toBe(true);

    act(() => service.handlers.stopped!({ chatId: 'session-1', stoppedAt: '2026-10-19T10:00:00Z' }));
    act(() => service.handlers.typing!(typing()));
    act(() => service.handlers.token!(token('Sunny ', { messageId: 'reply-2' })));

    expect(result.current.isWorking).toBe(true);
    expect(result.current.activeAgent?.agentName).toBe('Main agent');
    await waitFor(() => expect(result.current.messages.some(m => m.id === 'reply-2')).toBe(true));
  });

  it('keeps a phrase spoken while agents work as the draft instead of sending it, then sends again once the work ends', async () => {
    vi.stubGlobal('SpeechRecognition', FakeRecognition);
    const service = createFakeChatService();
    const onVoiceTranscriptWhileWorking = vi.fn();
    const { result } = renderHook(
      () => useChat(service as unknown as ChatService, { chainOfThought: false, chatId: 'session-1', onVoiceTranscriptWhileWorking }),
      { wrapper }
    );
    await waitFor(() => expect(service.onConversationStopped).toHaveBeenCalled());
    await waitFor(() => expect(FakeRecognition.instances.length).toBeGreaterThan(0));
    const messagesBefore = () => result.current.messages.filter(m => m.type === 'user').length;

    // Work starts while voice input is on.
    await act(async () => { await result.current.sendMessage('Hello', 'session-1'); });
    act(() => service.handlers.typing!(typing()));
    expect(result.current.isWorking).toBe(true);
    const userMessages = messagesBefore();
    const recognition = FakeRecognition.instances[FakeRecognition.instances.length - 1];

    speak('Also check Friday');

    expect(onVoiceTranscriptWhileWorking).toHaveBeenCalledWith('Also check Friday');
    expect(service.sendVoiceMessage).not.toHaveBeenCalled();
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(messagesBefore()).toBe(userMessages);
    // Voice input stays on.
    expect(recognition.stop).not.toHaveBeenCalled();

    // The work ends: the next phrase is sent as usual.
    act(() => service.handlers.typing!(typing({ isTyping: false })));
    expect(result.current.isWorking).toBe(false);
    speak('What about tomorrow');

    await waitFor(() => expect(service.sendVoiceMessage).toHaveBeenCalledWith(expect.objectContaining({ text: 'What about tomorrow' })));
    expect(onVoiceTranscriptWhileWorking).toHaveBeenCalledTimes(1);
  });

  it('sends a phrase again right after Stop', async () => {
    vi.stubGlobal('SpeechRecognition', FakeRecognition);
    const service = createFakeChatService();
    const onVoiceTranscriptWhileWorking = vi.fn();
    const { result } = renderHook(
      () => useChat(service as unknown as ChatService, { chainOfThought: false, chatId: 'session-1', onVoiceTranscriptWhileWorking }),
      { wrapper }
    );
    await waitFor(() => expect(FakeRecognition.instances.length).toBeGreaterThan(0));
    await act(async () => { await result.current.sendMessage('Hello', 'session-1'); });
    act(() => service.handlers.typing!(typing()));

    await act(async () => { await result.current.stopAllAgents(); });
    speak('Something else');

    await waitFor(() => expect(service.sendVoiceMessage).toHaveBeenCalledWith(expect.objectContaining({ text: 'Something else' })));
    expect(onVoiceTranscriptWhileWorking).not.toHaveBeenCalled();
  });

  it('ends the working state when the voice message fails to send', async () => {
    const { service, result } = await setupVoice();
    service.sendVoiceMessage.mockResolvedValueOnce({ success: false, error: 'Nope' });

    speak('What about tomorrow');

    await waitFor(() => expect(service.sendVoiceMessage).toHaveBeenCalled());
    await waitFor(() => expect(result.current.isWorking).toBe(false));
  });

  it('ends the working state when the voice message throws', async () => {
    const { service, result } = await setupVoice();
    service.sendVoiceMessage.mockRejectedValueOnce(new Error('Offline'));

    speak('What about tomorrow');

    await waitFor(() => expect(service.sendVoiceMessage).toHaveBeenCalled());
    await waitFor(() => expect(result.current.isWorking).toBe(false));
  });
});

describe('useChat — Stop halts text-to-speech (US 7501)', () => {
  class FakeAudio {
    static instances: FakeAudio[] = [];
    volume = 1;
    onplay: (() => void) | null = null;
    onended: (() => void) | null = null;
    onerror: ((error: unknown) => void) | null = null;
    play = vi.fn().mockResolvedValue(undefined);
    pause = vi.fn();
    constructor(public src: string) { FakeAudio.instances.push(this); }
  }

  function stubAudio() {
    vi.stubGlobal('Audio', FakeAudio);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:audio');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    FakeAudio.instances = [];
  });

  const audio = (text: string): StreamingAudioUpdate => ({ chatId: 'session-1', base64Audio: 'AAAA', text, isFinal: false });

  it('stops the reply being spoken, drops the queued audio and ignores late audio of the stopped run', async () => {
    stubAudio();
    const { service, result } = await setup();
    await act(async () => { await result.current.sendMessage('Hello', 'session-1'); });
    act(() => service.handlers.typing!(typing()));

    act(() => service.handlers.audio!(audio('First sentence.')));
    act(() => service.handlers.audio!(audio('Second sentence.')));
    expect(FakeAudio.instances).toHaveLength(1);
    expect(FakeAudio.instances[0].play).toHaveBeenCalled();
    expect(result.current.isAISpeaking).toBe(true);

    await act(async () => { await result.current.stopAllAgents(); });

    expect(FakeAudio.instances[0].pause).toHaveBeenCalled();
    expect(result.current.isAISpeaking).toBe(false);
    expect(result.current.isPlayingStream).toBe(false);
    expect(result.current.streamingActive).toBe(false);

    // A late chunk of the stopped run starts nothing; the queued second sentence is gone too.
    act(() => service.handlers.audio!(audio('Late sentence.')));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 700)); });
    expect(FakeAudio.instances).toHaveLength(1);
    expect(result.current.isAISpeaking).toBe(false);
  });

  it('plays the audio of the next run again', async () => {
    stubAudio();
    const { service, result } = await setup();
    await act(async () => { await result.current.sendMessage('Hello', 'session-1'); });
    await act(async () => { await result.current.stopAllAgents(); });

    await act(async () => { await result.current.sendMessage('Next question', 'session-1'); });
    act(() => service.handlers.audio!(audio('New sentence.')));

    expect(FakeAudio.instances).toHaveLength(1);
    expect(FakeAudio.instances[0].play).toHaveBeenCalled();
  });
});

// US 7501 (PR review): the stopped run's late messages, tool updates and approval requests are
// dropped like its other events; the next run's are shown.
describe('useChat — late message, tool and approval events of the stopped run (US 7501)', () => {
  const metadataUpdate = (id: string): MessageUpdate => ({
    chatId: 'session-1',
    message: {
      id,
      type: 'system',
      content: `Metadata ${id}`,
      timestamp: '2026-10-19T10:00:01Z',
      channelMessageType: 3,
      metadata: { note: 'late' },
    },
  } as MessageUpdate);
  const toolUpdate = (toolName: string): ToolExecutionUpdate => ({ chatId: 'session-1', toolName, status: 'completed' } as ToolExecutionUpdate);
  const approvalRequest = (approvalId: string): ToolApprovalRequestUpdate => ({
    chatId: 'session-1',
    sessionId: 'session-1',
    approvalId,
    toolName: 'Docs server',
    functionName: 'create_doc',
    expiresAtUtc: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  });

  function emitAll(service: ReturnType<typeof createFakeChatService>, suffix: string) {
    act(() => service.handlers.message!(metadataUpdate(`meta-${suffix}`)));
    act(() => service.handlers.tool!(toolUpdate(`tool-${suffix}`)));
    act(() => service.handlers.approvalRequest!(approvalRequest(`approval-${suffix}`)));
  }

  // The hook gives metadata entries an id of its own, so they are found by their content.
  const hasMessage = (messages: Array<{ content?: string }>, id: string) => messages.some(m => m.content === `Metadata ${id}`);
  const hasTool = (messages: Array<{ content?: string; toolName?: string; type: string }>, name: string) =>
    messages.some(m => m.type === 'tool' && JSON.stringify(m).includes(name));
  const hasApproval = (messages: Array<{ toolApproval?: { approvalId: string } }>, id: string) =>
    messages.some(m => m.toolApproval?.approvalId === id);

  it('shows them when no Stop happened', async () => {
    const { service, result } = await setup();
    await act(async () => { await result.current.sendMessage('Hello', 'session-1'); });

    emitAll(service, 'live');

    await waitFor(() => expect(hasMessage(result.current.messages, 'meta-live')).toBe(true));
    expect(hasTool(result.current.messages, 'tool-live')).toBe(true);
    expect(hasApproval(result.current.messages, 'approval-live')).toBe(true);
    expect(result.current.hasPendingToolApproval).toBe(true);
  });

  it('drops them after Stop', async () => {
    const { service, result } = await setup();
    await act(async () => { await result.current.sendMessage('Hello', 'session-1'); });
    act(() => service.handlers.typing!(typing()));
    await act(async () => { await result.current.stopAllAgents(); });

    emitAll(service, 'late');

    await new Promise(resolve => setTimeout(resolve, 50));
    expect(hasMessage(result.current.messages, 'meta-late')).toBe(false);
    expect(hasTool(result.current.messages, 'tool-late')).toBe(false);
    expect(hasApproval(result.current.messages, 'approval-late')).toBe(false);
    expect(result.current.hasPendingToolApproval).toBe(false);
  });

  it('shows those of the next run after Stop -> Send', async () => {
    const { service, result } = await setup();
    await act(async () => { await result.current.sendMessage('Hello', 'session-1'); });
    act(() => service.handlers.typing!(typing()));
    await act(async () => { await result.current.stopAllAgents(); });
    await act(async () => { await result.current.sendMessage('Next question', 'session-1'); });

    emitAll(service, 'next');

    await waitFor(() => expect(hasMessage(result.current.messages, 'meta-next')).toBe(true));
    expect(hasTool(result.current.messages, 'tool-next')).toBe(true);
    expect(hasApproval(result.current.messages, 'approval-next')).toBe(true);
  });
});

// US 7948: sendMessage resolves with the outcome so the chat can show the friendly error.
describe('useChat — sendMessage result (US 7948)', () => {
  it('resolves with success when the send is accepted', async () => {
    const { result } = await setup();

    let outcome: Awaited<ReturnType<typeof result.current.sendMessage>> | undefined;
    await act(async () => { outcome = await result.current.sendMessage('Hello', 'session-1'); });

    expect(outcome).toEqual({ success: true });
  });

  it('resolves with the service error text when the send fails', async () => {
    const { service, result } = await setup();
    service.sendMessage.mockResolvedValueOnce({ success: false, error: 'Please use a smaller image.' });

    let outcome: Awaited<ReturnType<typeof result.current.sendMessage>> | undefined;
    await act(async () => { outcome = await result.current.sendMessage('Hello', 'session-1'); });

    expect(outcome).toEqual({ success: false, error: 'Please use a smaller image.' });
    expect(result.current.error).toBe('Please use a smaller image.');
  });

  it('resolves with the generic text when the service throws', async () => {
    const { service, result } = await setup();
    service.sendMessage.mockRejectedValueOnce(new Error('socket closed'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    let outcome: Awaited<ReturnType<typeof result.current.sendMessage>> | undefined;
    await act(async () => { outcome = await result.current.sendMessage('Hello', 'session-1'); });

    expect(outcome).toEqual({ success: false, error: GENERIC_CHAT_SEND_ERROR });
    vi.restoreAllMocks();
  });
});
