import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AgentChatInterface, AgentConfig } from './agent-chat-interface';
import { ChatMessagesProvider } from '../provider/chat-messages-provider';
import { ChatServiceFactory } from '../services/chat-service.factory';
import type { TypingIndicatorUpdate } from '../services/signalr-service';

// US 7500/7501: while agents work, nothing new is sent - not with Enter, and not with a predefined
// prompt chip either - and Stop is the composer's action.

vi.mock('../services/chat-service.factory', () => ({
  ChatServiceFactory: { createPublicChatService: vi.fn() },
}));

function createFakeChatService() {
  const handlers: { typing?: (update: TypingIndicatorUpdate) => void } = {};
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
    onTypingIndicator: vi.fn((h: (u: TypingIndicatorUpdate) => void) => { handlers.typing = h; return () => {}; }),
    onConversationStateUpdate: vi.fn().mockReturnValue(() => {}),
    onContactFormRequest: vi.fn().mockReturnValue(() => {}),
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
  shareId: 'share-stop',
  securityConfiguration: { type: 'none' },
  welcomeMessage: 'Hello there',
  predefinedPrompts: [{ title: 'Opening hours', prompt: 'When are you open?' }],
};

async function setup() {
  const service = createFakeChatService();
  vi.mocked(ChatServiceFactory.createPublicChatService).mockReturnValue(service as any);
  render(
    <ChatMessagesProvider>
      <AgentChatInterface agent={agent} />
    </ChatMessagesProvider>
  );
  await waitFor(() => expect(service.handlers.typing).toBeDefined());
  const chip = await screen.findByRole('button', { name: 'Opening hours' });
  return { service, chip };
}

const typing = (isTyping: boolean): TypingIndicatorUpdate => ({
  chatId: '',
  isTyping,
  agentId: 1,
  agentName: 'Test Agent',
});

describe('AgentChatInterface — sending while agents work (US 7500)', () => {
  beforeEach(() => {
    vi.mocked(ChatServiceFactory.createPublicChatService).mockReset();
  });

  // The hook only takes typing events for its own session id, so send them with the id the
  // service's joinChat was called with.
  function sessionIdOf(service: ReturnType<typeof createFakeChatService>): string {
    return service.joinChat.mock.calls[0]?.[0] ?? '';
  }

  it('does not send a predefined prompt while an agent is working', async () => {
    const { service, chip } = await setup();
    await waitFor(() => expect(service.joinChat).toHaveBeenCalled());
    act(() => service.handlers.typing!({ ...typing(true), chatId: sessionIdOf(service) }));
    expect(await screen.findByRole('button', { name: 'Stop all agents' })).toBeInTheDocument();

    await userEvent.setup().click(chip);

    expect(service.sendMessage).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox')).toHaveValue('');
  });

  it('sends the predefined prompt once the work is done', async () => {
    const { service, chip } = await setup();
    await waitFor(() => expect(service.joinChat).toHaveBeenCalled());
    act(() => service.handlers.typing!({ ...typing(true), chatId: sessionIdOf(service) }));
    act(() => service.handlers.typing!({ ...typing(false), chatId: sessionIdOf(service) }));

    await userEvent.setup().click(chip);

    await waitFor(() => expect(service.sendMessage).toHaveBeenCalledTimes(1));
    expect(service.sendMessage.mock.calls[0][0].input.text).toBe('When are you open?');
  });

  it('stops every agent from the Stop button', async () => {
    const { service } = await setup();
    await waitFor(() => expect(service.joinChat).toHaveBeenCalled());
    act(() => service.handlers.typing!({ ...typing(true), chatId: sessionIdOf(service) }));

    await userEvent.setup().click(await screen.findByRole('button', { name: 'Stop all agents' }));

    expect(service.stopAllAgents).toHaveBeenCalledWith(sessionIdOf(service));
    expect(screen.queryByRole('button', { name: 'Stop all agents' })).not.toBeInTheDocument();
  });
});

// US 7948: a rejected send is explained in the chat instead of failing silently.
describe('AgentChatInterface — send errors (US 7948)', () => {
  beforeEach(() => {
    vi.mocked(ChatServiceFactory.createPublicChatService).mockReset();
  });

  it('shows the friendly error as an assistant message when the send fails', async () => {
    const { service, chip } = await setup();
    service.sendMessage.mockResolvedValueOnce({ success: false, error: 'One of your images is larger than 5.0 MB.' });

    await userEvent.setup().click(chip);

    expect(await screen.findByText('One of your images is larger than 5.0 MB.')).toBeInTheDocument();
  });

  it('adds no error message when the send succeeds', async () => {
    const { service, chip } = await setup();

    await userEvent.setup().click(chip);

    await waitFor(() => expect(service.sendMessage).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/couldn't be sent/)).not.toBeInTheDocument();
  });
});
