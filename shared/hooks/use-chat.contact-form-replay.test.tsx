import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useChat } from './use-chat';
import { ChatMessagesProvider } from '../provider/chat-messages-provider';
import { ChatService, ContactFormCompletedUpdate } from '../services/chat-service';

// A ContactForm "replay" — use-chat.ts's unsubContactFormCompleted handler re-sending the
// visitor's original question once the registration form is submitted — must be flagged as
// `isContactFormReplay: true` so the backend can treat it as one visitor interaction instead
// of a second, independent chat turn (which previously caused duplicate topic classification
// and a duplicate Chat Logs entry). Every ordinary send must leave the flag unset.

function createFakeChatService() {
  const handlers: { contactFormCompleted?: (update: ContactFormCompletedUpdate) => void } = {};

  return {
    handlers,
    initialize: vi.fn().mockResolvedValue(undefined),
    getConnectionState: vi.fn().mockReturnValue('Connected'),
    disconnect: vi.fn().mockResolvedValue(undefined),
    onMessageUpdate: vi.fn().mockReturnValue(() => {}),
    onToolExecutionUpdate: vi.fn().mockReturnValue(() => {}),
    onSubAgentActivityUpdate: vi.fn().mockReturnValue(() => {}),
    onStreamingToken: vi.fn().mockReturnValue(() => {}),
    onStreamingAudio: vi.fn().mockReturnValue(() => {}),
    onTypingIndicator: vi.fn().mockReturnValue(() => {}),
    onConversationStateUpdate: vi.fn().mockReturnValue(() => {}),
    onContactFormRequest: vi.fn().mockReturnValue(() => {}),
    onContactFormCompleted: vi.fn((handler: (update: ContactFormCompletedUpdate) => void) => {
      handlers.contactFormCompleted = handler;
      return () => {};
    }),
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
    rateMessage: vi.fn().mockResolvedValue({}),
    getAuthHeaders: vi.fn().mockResolvedValue({}),
    sendMessage: vi.fn().mockResolvedValue({ success: true }),
    sendVoiceMessage: vi.fn().mockResolvedValue({ success: true }),
  };
}

function wrapper({ children }: { children: React.ReactNode }) {
  return <ChatMessagesProvider>{children}</ChatMessagesProvider>;
}

describe('useChat — ContactFormCompleted replay', () => {
  it('sends isContactFormReplay: true only on the replay call, never on an ordinary send', async () => {
    const fakeChatService = createFakeChatService();
    const { result } = renderHook(
      () => useChat(fakeChatService as unknown as ChatService, { chainOfThought: false, chatId: 'session-1' }),
      { wrapper }
    );

    await waitFor(() => expect(fakeChatService.onContactFormCompleted).toHaveBeenCalled());

    // An ordinary, ContactForm-unrelated send must not carry the flag.
    await act(async () => {
      await result.current.sendMessage('A normal question', 'session-1');
    });

    // Simulate the trigger question having been captured and the form successfully submitted —
    // this is what arms pendingOriginalMessageRef for the upcoming replay.
    await act(async () => {
      await result.current.submitContactForm(
        'session-1',
        { id: 'contact-form-1' } as any,
        {
          subjectId: 'subject-1',
          firstName: 'Jane',
          lastName: 'Doe',
          email: 'jane.doe@example.test',
          originalMessage: 'What are your office hours?',
        }
      );
    });

    // Backend push: registration completed — the handler must replay the captured question,
    // ignoring the (unreliable) update.originalMessage field entirely.
    await act(async () => {
      fakeChatService.handlers.contactFormCompleted?.({
        chatId: 'session-1',
        originalMessage: 'unreliable-backend-value-should-be-ignored',
      });
    });

    await waitFor(() => {
      expect(fakeChatService.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'session-1',
          input: { text: 'What are your office hours?' },
          isContactFormReplay: true,
        })
      );
    });

    // Exactly one call carried the flag, and it's the replay call — every other recorded call
    // (the earlier ordinary send) must have it unset.
    const flaggedCalls = fakeChatService.sendMessage.mock.calls.filter(
      ([request]: any[]) => request.isContactFormReplay === true
    );
    expect(flaggedCalls).toHaveLength(1);
    expect(flaggedCalls[0][0].input.text).toBe('What are your office hours?');

    const unflaggedCalls = fakeChatService.sendMessage.mock.calls.filter(
      ([request]: any[]) => request.input.text === 'A normal question'
    );
    expect(unflaggedCalls.length).toBeGreaterThan(0);
    unflaggedCalls.forEach(([request]: any[]) => {
      expect(request.isContactFormReplay).toBeFalsy();
    });
  });

  it('does not replay when no original message was captured (pendingOriginalMessageRef empty)', async () => {
    const fakeChatService = createFakeChatService();
    const { result } = renderHook(
      () => useChat(fakeChatService as unknown as ChatService, { chainOfThought: false, chatId: 'session-2' }),
      { wrapper }
    );

    await waitFor(() => expect(fakeChatService.onContactFormCompleted).toHaveBeenCalled());

    // No submitContactForm call happened first, so pendingOriginalMessageRef is still empty —
    // the handler must bail out without sending anything.
    await act(async () => {
      fakeChatService.handlers.contactFormCompleted?.({ chatId: 'session-2', originalMessage: 'irrelevant' });
    });

    expect(fakeChatService.sendMessage).not.toHaveBeenCalled();
  });
});
