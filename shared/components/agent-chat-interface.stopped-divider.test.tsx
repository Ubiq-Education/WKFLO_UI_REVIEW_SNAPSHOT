import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act, within } from '@testing-library/react';
import { AgentChatInterface, AgentConfig } from './agent-chat-interface';
import { ChatMessagesProvider } from '../provider/chat-messages-provider';
import { ChatServiceFactory } from '../services/chat-service.factory';
import type { ConversationStoppedUpdate, TypingIndicatorUpdate } from '../services/signalr-service';

// US 7502: reopening a stopped chat shows the Stop divider from history, below the partial text, and
// never the marker as an agent bubble. The text comes from the UI, not the stored marker: the full
// text in the Chat UI, just "Stopped." in the Chat Widget - live and from history.

vi.mock('../services/chat-service.factory', () => ({
  ChatServiceFactory: { createPublicChatService: vi.fn() },
}));

function createFakeChatService() {
  const handlers: {
    typing?: (update: TypingIndicatorUpdate) => void;
    stopped?: (update: ConversationStoppedUpdate) => void;
  } = {};
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
    onConversationStopped: vi.fn((h: (u: ConversationStoppedUpdate) => void) => { handlers.stopped = h; return () => {}; }),
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
  shareId: 'share-stopped-divider',
  securityConfiguration: { type: 'none' },
  welcomeMessage: 'Hello there',
  };

const history = [
  {
    id: 'user-1',
    type: 'user',
    content: 'Write me a long story',
    timestamp: '2026-10-19T09:59:50+00:00',
    channelMessageType: 1,
  },
  {
    id: 'assistant-1',
    messageId: 'a1',
    type: 'assistant',
    content: 'Once upon a time',
    timestamp: '2026-10-19T09:59:58+00:00',
    channelMessageType: 1,
    agentId: 1,
    agentName: 'MAISY',
  },
  {
    id: 'assistant-0f0e',
    messageId: '0f0e',
    type: 'assistant',
    content: 'Stopped. All agents cancelled.',
    timestamp: '2026-10-19T10:00:00.1234567+00:00',
    channelMessageType: 3,
    agentId: 1,
    agentName: 'MAISY',
    chatbotIconUrl: 'https://example.com/maisy.png',
    metadata: { renderAsSystem: 'True', isStoppedMarker: true, stoppedAt: '2026-10-19T10:00:00.1234567+00:00' },
  },
];

describe('AgentChatInterface — Stop divider from history (US 7502)', () => {
  beforeEach(() => {
    vi.mocked(ChatServiceFactory.createPublicChatService).mockReset();
  });

  it('shows the divider below the partial text when the chat is reopened', async () => {
    const service = createFakeChatService();
    service.readMessages.mockResolvedValue({ success: true, data: { data: history } });
    vi.mocked(ChatServiceFactory.createPublicChatService).mockReturnValue(service as any);

    render(
      <ChatMessagesProvider>
        <AgentChatInterface agent={agent} />
      </ChatMessagesProvider>
    );

    const divider = await screen.findByText('Stopped. All agents cancelled.');
    expect(divider.closest('[role="separator"], [aria-hidden="true"]')).toBeNull();
    const partial = screen.getByText('Once upon a time');
    expect(partial.compareDocumentPosition(divider) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByText('Stopped. All agents cancelled.')).toHaveLength(1);
    // The marker carries MAISY's icon; a bubble would show it as the avatar.
    expect(document.querySelector('img[src="https://example.com/maisy.png"]')).toBeNull();
  });
});

describe('AgentChatInterface — Stop divider text per chat type (US 7502)', () => {
  beforeEach(() => {
    vi.mocked(ChatServiceFactory.createPublicChatService).mockReset();
  });

  function renderChat(isWidget: boolean, withHistory: boolean) {
    const service = createFakeChatService();
    if (withHistory) {
      service.readMessages.mockResolvedValue({ success: true, data: { data: history } });
    }
    vi.mocked(ChatServiceFactory.createPublicChatService).mockReturnValue(service as any);
    render(
      <ChatMessagesProvider>
        <AgentChatInterface agent={agent} isWidget={isWidget} />
      </ChatMessagesProvider>
    );
    return service;
  }

  it('shows just "Stopped." for a history marker in the Chat Widget, though it stores the full text', async () => {
    renderChat(true, true);

    const divider = await screen.findByTestId('stopped-divider');
    expect(within(divider).getByText('Stopped.')).toBeInTheDocument(); // US 7974: the label, beside its timestamp
    expect(screen.queryByText('Stopped. All agents cancelled.')).not.toBeInTheDocument();
    const partial = screen.getByText('Once upon a time');
    expect(partial.compareDocumentPosition(divider) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByTestId('stopped-divider')).toHaveLength(1);
  });

  it('shows just "Stopped." for a live Stop in the Chat Widget', async () => {
    const service = renderChat(true, false);
    await waitFor(() => expect(service.handlers.stopped).toBeDefined());
    await waitFor(() => expect(service.joinChat).toHaveBeenCalled());
    const chatId: string = service.joinChat.mock.calls[0]?.[0] ?? '';

    act(() => service.handlers.stopped!({ chatId, stoppedAt: '2026-10-19T10:00:00Z' }));

    const divider = await screen.findByTestId('stopped-divider');
    expect(within(divider).getByText('Stopped.')).toBeInTheDocument(); // US 7974: the label, beside its timestamp
    expect(screen.queryByText('Stopped. All agents cancelled.')).not.toBeInTheDocument();
  });

  it('shows the full text, live and from history, in the Chat UI', async () => {
    const service = renderChat(false, true);
    const fromHistory = await screen.findByTestId('stopped-divider');
    expect(within(fromHistory).getByText('Stopped. All agents cancelled.')).toBeInTheDocument(); // US 7974: the label, beside its timestamp

    await waitFor(() => expect(service.handlers.stopped).toBeDefined());
    await waitFor(() => expect(service.joinChat).toHaveBeenCalled());
    const chatId: string = service.joinChat.mock.calls[0]?.[0] ?? '';
    act(() => service.handlers.stopped!({ chatId, stoppedAt: '2026-10-19T10:05:00Z' }));

    await waitFor(() => expect(screen.getAllByTestId('stopped-divider')).toHaveLength(2));
    for (const divider of screen.getAllByTestId('stopped-divider')) {
      expect(within(divider).getByText('Stopped. All agents cancelled.')).toBeInTheDocument(); // US 7974: the label, beside its timestamp
    }
  });
});
