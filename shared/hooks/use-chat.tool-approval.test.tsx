import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useChat } from './use-chat';
import { ChatMessagesProvider } from '../provider/chat-messages-provider';
import { ChatService } from '../services/chat-service';
import type {
  MessageUpdate,
  ToolApprovalRequestUpdate,
  ToolApprovalResolvedUpdate,
  TypingIndicatorUpdate,
} from '../services/signalr-service';

// US 7575 "Ask for permission": the chat shows an approval card, blocks input while it waits,
// and resolves it from the user's answer, the server's ToolApprovalResolved event, or expiry.

function createFakeChatService() {
  const handlers: {
    message?: (update: MessageUpdate) => void;
    typing?: (update: TypingIndicatorUpdate) => void;
    approvalRequest?: (update: ToolApprovalRequestUpdate) => void;
    approvalResolved?: (update: ToolApprovalResolvedUpdate) => void;
  } = {};

  return {
    handlers,
    initialize: vi.fn().mockResolvedValue(undefined),
    getConnectionState: vi.fn().mockReturnValue('Connected'),
    disconnect: vi.fn().mockResolvedValue(undefined),
    onMessageUpdate: vi.fn((h: (u: MessageUpdate) => void) => { handlers.message = h; return () => {}; }),
    onToolExecutionUpdate: vi.fn().mockReturnValue(() => {}),
    onSubAgentActivityUpdate: vi.fn().mockReturnValue(() => {}),
    onStreamingToken: vi.fn().mockReturnValue(() => {}),
    onStreamingAudio: vi.fn().mockReturnValue(() => {}),
    onTypingIndicator: vi.fn((h: (u: TypingIndicatorUpdate) => void) => { handlers.typing = h; return () => {}; }),
    onConversationStateUpdate: vi.fn().mockReturnValue(() => {}),
    onContactFormRequest: vi.fn().mockReturnValue(() => {}),
    onContactFormCompleted: vi.fn().mockReturnValue(() => {}),
    onToolApprovalRequest: vi.fn((h: (u: ToolApprovalRequestUpdate) => void) => { handlers.approvalRequest = h; return () => {}; }),
    onToolApprovalResolved: vi.fn((h: (u: ToolApprovalResolvedUpdate) => void) => { handlers.approvalResolved = h; return () => {}; }),
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

function buildRequest(overrides: Partial<ToolApprovalRequestUpdate> = {}): ToolApprovalRequestUpdate {
  return {
    chatId: 'session-1',
    sessionId: 'session-1',
    approvalId: 'approval-1',
    agentId: 7,
    agentName: 'Helper',
    toolName: 'Docs server',
    functionName: 'create_doc',
    functionDescription: 'Creates a document',
    argumentsJson: '{"title":"Hello"}',
    expiresAtUtc: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

async function setup() {
  const service = createFakeChatService();
  const hook = renderHook(
    () => useChat(service as unknown as ChatService, { chainOfThought: false, chatId: 'session-1' }),
    { wrapper }
  );
  await waitFor(() => expect(service.onToolApprovalRequest).toHaveBeenCalled());
  return { service, ...hook };
}

const approvals = (messages: { toolApproval?: unknown }[]) => messages.filter(m => !!m.toolApproval);

describe('useChat — tool approval (US 7575)', () => {
  it('adds a pending approval card, blocks input and stops the typing indicator', async () => {
    const { service, result } = await setup();

    act(() => service.handlers.typing!({ chatId: 'session-1', isTyping: true, agentId: 7, agentName: 'Helper' }));
    expect(result.current.isAgentTyping).toBe(true);

    act(() => service.handlers.approvalRequest!(buildRequest()));

    const cards = approvals(result.current.messages);
    expect(cards).toHaveLength(1);
    expect(result.current.messages[0].toolApproval).toMatchObject({ approvalId: 'approval-1', status: 'Pending', functionName: 'create_doc' });
    expect(result.current.hasPendingToolApproval).toBe(true);
    expect(result.current.isAgentTyping).toBe(false);
  });

  it('ignores requests for another session', async () => {
    const { service, result } = await setup();

    act(() => service.handlers.approvalRequest!(buildRequest({ chatId: 'other-session' })));

    expect(approvals(result.current.messages)).toHaveLength(0);
  });

  it('records an Allow once answer and unblocks input', async () => {
    const { service, result } = await setup();
    act(() => service.handlers.approvalRequest!(buildRequest()));

    let outcome: { success: boolean } | undefined;
    await act(async () => {
      outcome = await result.current.respondToToolApproval(result.current.messages[0].toolApproval!, 'AllowOnce');
    });

    expect(outcome).toEqual({ success: true });
    expect(service.respondToToolApproval).toHaveBeenCalledWith('session-1', 'approval-1', 'AllowOnce');
    expect(result.current.messages[0].toolApproval).toMatchObject({ status: 'Approved', decision: 'AllowOnce' });
    expect(result.current.hasPendingToolApproval).toBe(false);
  });

  it('marks the card expired when the server answers 410', async () => {
    const { service, result } = await setup();
    service.respondToToolApproval.mockResolvedValueOnce({ success: false, statusCode: 410 });
    act(() => service.handlers.approvalRequest!(buildRequest()));

    let outcome: { success: boolean; error?: string } | undefined;
    await act(async () => {
      outcome = await result.current.respondToToolApproval(result.current.messages[0].toolApproval!, 'Deny');
    });

    expect(outcome?.success).toBe(false);
    expect(result.current.messages[0].toolApproval?.status).toBe('Expired');
    expect(result.current.hasPendingToolApproval).toBe(false);
  });

  it('stops offering answers when the server says it was already answered (409)', async () => {
    const { service, result } = await setup();
    service.respondToToolApproval.mockResolvedValueOnce({ success: false, statusCode: 409 });
    act(() => service.handlers.approvalRequest!(buildRequest()));

    await act(async () => {
      await result.current.respondToToolApproval(result.current.messages[0].toolApproval!, 'AllowOnce');
    });

    expect(result.current.messages[0].toolApproval?.alreadyAnswered).toBe(true);
    expect(result.current.hasPendingToolApproval).toBe(false);
  });

  it('applies ToolApprovalResolved from the server', async () => {
    const { service, result } = await setup();
    act(() => service.handlers.approvalRequest!(buildRequest()));

    act(() => service.handlers.approvalResolved!({ chatId: 'session-1', approvalId: 'approval-1', decision: 'AllowForConversation' }));

    expect(result.current.messages[0].toolApproval).toMatchObject({ status: 'Approved', decision: 'AllowForConversation' });
    expect(result.current.hasPendingToolApproval).toBe(false);
  });

  it('expires a request nobody answered once expiresAtUtc passes', async () => {
    const { service, result } = await setup();
    act(() => service.handlers.approvalRequest!(buildRequest({ expiresAtUtc: new Date(Date.now() + 150).toISOString() })));
    expect(result.current.hasPendingToolApproval).toBe(true);

    await waitFor(() => expect(result.current.messages[0].toolApproval?.status).toBe('Expired'), { timeout: 2000 });
    expect(result.current.hasPendingToolApproval).toBe(false);
  });

  it('falls back to a 10-minute expiry when the request has none, so input cannot stay blocked forever', async () => {
    const { service, result } = await setup();
    const before = Date.now();

    act(() => service.handlers.approvalRequest!(buildRequest({ expiresAtUtc: '' })));

    const expiresAt = Date.parse(result.current.messages[0].toolApproval!.expiresAtUtc);
    expect(expiresAt).toBeGreaterThanOrEqual(before + 10 * 60 * 1000);
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + 10 * 60 * 1000);
    expect(result.current.hasPendingToolApproval).toBe(true);
  });

  it('merges the persisted Forms-channel copy with the live request instead of showing two cards', async () => {
    const { service, result } = await setup();
    act(() => service.handlers.approvalRequest!(buildRequest()));

    act(() => service.handlers.message!({
      chatId: 'session-1',
      message: {
        id: 'server-message-id',
        type: 'system',
        content: '',
        timestamp: new Date().toISOString(),
        channelMessageType: 4,
        metadata: { formType: 'ToolApproval', data: JSON.stringify({ ...buildRequest(), status: 'Pending' }) },
      },
    }));

    expect(approvals(result.current.messages)).toHaveLength(1);
  });

  it('appends the card after the agent message instead of splicing it above', async () => {
    const { service, result } = await setup();
    act(() => result.current.addMessage({
      id: 'assistant-1',
      type: 'assistant',
      content: 'Let me create that.',
      timestamp: new Date(),
      channelMessageType: 1,
    }));

    act(() => service.handlers.approvalRequest!(buildRequest()));

    expect(result.current.messages.map(m => m.id)).toEqual(['assistant-1', 'tool-approval-approval-1']);
  });
});
