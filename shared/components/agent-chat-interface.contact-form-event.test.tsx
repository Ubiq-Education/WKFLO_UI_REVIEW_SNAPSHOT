import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AgentChatInterface, AgentConfig } from './agent-chat-interface';
import { ChatMessagesProvider } from '../provider/chat-messages-provider';
import { ChatServiceFactory } from '../services/chat-service.factory';
import type { ContactFormUpdate } from '../services/signalr-service';
import { CONTACT_FORM_SUBMITTED_EVENT } from '../services/widget-events';

// US 8021: a successful contact form submit fires `wkflo:contact-form-submitted` on window so the
// host page (the CMS) can email its admins. A failed submit fires nothing.

vi.mock('../services/chat-service.factory', () => ({
  ChatServiceFactory: { createPublicChatService: vi.fn() },
}));

function createFakeChatService() {
  const handlers: { contactForm?: (update: ContactFormUpdate) => void } = {};
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
    onContactFormRequest: vi.fn((h: (u: ContactFormUpdate) => void) => { handlers.contactForm = h; return () => {}; }),
    onContactFormCompleted: vi.fn().mockReturnValue(() => {}),
    onToolApprovalRequest: vi.fn().mockReturnValue(() => {}),
    onToolApprovalResolved: vi.fn().mockReturnValue(() => {}),
    onConversationStopped: vi.fn().mockReturnValue(() => {}),
    clearQueuedStreamingTokens: vi.fn(),
    stopAllAgents: vi.fn().mockResolvedValue({ success: true }),
    respondToToolApproval: vi.fn().mockResolvedValue({ success: true }),
    onConnectionStatusChange: vi.fn((handler: (isConnected: boolean) => void) => {
      handler(true);
      return () => {};
    }),
    readMessages: vi.fn().mockResolvedValue({ success: true, data: { data: [] } }),
    submitContactForm: vi.fn().mockResolvedValue({ success: true }),
    checkContactFormExists: vi.fn().mockResolvedValue({ exists: false }),
    rateMessage: vi.fn().mockResolvedValue({}),
    getAgentSettings: vi.fn().mockResolvedValue({ agentChatSettings: {} }),
    getSpinUpAgents: vi.fn().mockResolvedValue({ success: true, data: { data: [] } }),
    login: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
    isAuthenticated: vi.fn().mockReturnValue(false),
    getCurrentUser: vi.fn().mockReturnValue(null),
    getAuthHeaders: vi.fn().mockResolvedValue({}),
    joinChat: vi.fn().mockResolvedValue(undefined),
    leaveChat: vi.fn().mockResolvedValue(undefined),
    sendTypingIndicator: vi.fn().mockResolvedValue(undefined),
    sendMessage: vi.fn().mockResolvedValue({ success: true }),
    sendVoiceMessage: vi.fn().mockResolvedValue({ success: true }),
  };
}

const agent: AgentConfig = {
  tenantGuid: 'tenant-guid',
  agentName: 'Test Agent',
  primaryColor: '#000000',
  bubbleStyle: 'rounded',
  showDescription: false,
  chainOfThought: false,
  apiEndpoint: 'https://api.example.com',
  isVoiceChatEnabled: false,
  shareId: 'share-contact-form-event',
  securityConfiguration: { type: 'none' },
  welcomeMessage: 'Hello there',
};

async function renderWithContactForm(service: ReturnType<typeof createFakeChatService>) {
  vi.mocked(ChatServiceFactory.createPublicChatService).mockReturnValue(service as any);
  render(
    <ChatMessagesProvider>
      <AgentChatInterface agent={agent} isWidget />
    </ChatMessagesProvider>
  );

  await waitFor(() => expect(service.handlers.contactForm).toBeDefined());
  await waitFor(() => expect(service.joinChat).toHaveBeenCalled());
  const sessionId: string = service.joinChat.mock.calls[0]?.[0] ?? '';

  act(() => service.handlers.contactForm!({
    chatId: sessionId,
    message: 'What are your office hours?',
    mandatory: false,
    firstNameRequired: true,
    lastNameRequired: true,
    emailRequired: true,
    submitButtonText: 'Send details',
    successMessageEnabled: false,
    successMessageText: '',
  }));

  await screen.findByRole('button', { name: 'Send details' });
  return sessionId;
}

async function fillAndSubmit() {
  const user = userEvent.setup();
  const inputs = document.querySelectorAll<HTMLInputElement>('.wkflo-contact-form-input');
  await user.type(inputs[0], 'Jane');
  await user.type(inputs[1], 'Doe');
  await user.type(inputs[2], 'jane.doe@example.test');
  await user.click(screen.getByRole('button', { name: 'Send details' }));
}

describe('AgentChatInterface — wkflo:contact-form-submitted (US 8021)', () => {
  const listener = vi.fn();

  beforeEach(() => {
    vi.mocked(ChatServiceFactory.createPublicChatService).mockReset();
    listener.mockReset();
    window.addEventListener(CONTACT_FORM_SUBMITTED_EVENT, listener);
  });

  afterEach(() => {
    window.removeEventListener(CONTACT_FORM_SUBMITTED_EVENT, listener);
  });

  it('fires once with the submitted values after a successful submit', async () => {
    const service = createFakeChatService();
    const sessionId = await renderWithContactForm(service);

    await fillAndSubmit();

    await waitFor(() => expect(service.submitContactForm).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(listener).toHaveBeenCalledTimes(1));
    expect((listener.mock.calls[0][0] as CustomEvent).detail).toEqual({
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane.doe@example.test',
      sessionId,
      shareId: 'share-contact-form-event',
    });
  });

  it('does not fire when the submit fails', async () => {
    const service = createFakeChatService();
    service.submitContactForm.mockResolvedValue({ success: false, error: 'Server said no' });
    await renderWithContactForm(service);

    await fillAndSubmit();

    await screen.findByText('Server said no');
    expect(service.submitContactForm).toHaveBeenCalledTimes(1);
    expect(listener).not.toHaveBeenCalled();
  });
});
