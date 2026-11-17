import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AgentChatInterface, AgentConfig } from './agent-chat-interface';
import { ChatMessagesProvider } from '../provider/chat-messages-provider';
import { ChatServiceFactory } from '../services/chat-service.factory';
import type { ConversationStoppedUpdate, TypingIndicatorUpdate } from '../services/signalr-service';
import { PublicApiService } from '../services/public-api-service';

// US 7974: the chat shows each message's time in the tenant's time zone and formats, taken from
// the chat configuration (getAgentSettings) - and nothing for a history entry without a timestamp.

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
  shareId: 'share-timestamps',
  securityConfiguration: { type: 'none' },
  // The host page's zone for the AI's calendar - not what the timestamps use.
  timeZone: 'America/Los_Angeles',
};

const history = [
  { id: 'user-1', type: 'user', content: 'What are the opening hours?', timestamp: '2026-10-21T08:29:50+00:00', channelMessageType: 1 },
  { id: 'assistant-1', messageId: 'a1', type: 'assistant', content: 'We open at nine.', timestamp: '2026-10-21T08:30:00+00:00', channelMessageType: 1 },
  { id: 'assistant-2', messageId: 'a2', type: 'assistant', content: 'An older answer', timestamp: null, channelMessageType: 1 },
];

describe('AgentChatInterface — tenant-local timestamps (US 7974)', () => {
  beforeEach(() => {
    vi.mocked(ChatServiceFactory.createPublicChatService).mockReset();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-05T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('formats history timestamps with the display settings of the chat configuration', async () => {
    const service = createFakeChatService();
    service.getAgentSettings.mockResolvedValue({
      agentChatSettings: { displaySettings: { timeZone: 'Australia/Sydney', timeFormat: '12h', dateFormat: 'dd/MM/yyyy' } },
    });
    service.readMessages.mockResolvedValue({ success: true, data: { data: history } });
    vi.mocked(ChatServiceFactory.createPublicChatService).mockReturnValue(service as any);

    render(
      <ChatMessagesProvider>
        <AgentChatInterface agent={agent} />
      </ChatMessagesProvider>
    );

    const answer = await screen.findByText('We open at nine.');
    const timeOf = (text: string) =>
      screen.getByText(text).closest('.wkflo-chat-bubble-size')?.querySelector('[data-testid="chat-message-timestamp"]')?.textContent ?? null;

    await waitFor(() => expect(timeOf('We open at nine.')).toBe('21/10/2026 7:30 PM'));
    expect(answer).toBeInTheDocument();
    expect(timeOf('What are the opening hours?')).toBe('21/10/2026 7:29 PM');
    // A history entry without a timestamp (null) shows none - not 1970, not "now".
    expect(timeOf('An older answer')).toBeNull();
  });

  it.each([false, true])('loads the chat configuration once (requireRemoteConfig = %s)', async (requireRemoteConfig) => {
    const service = createFakeChatService();
    service.getAgentSettings.mockResolvedValue({
      agentChatSettings: { displaySettings: { timeZone: 'Europe/London', timeFormat: '24h', dateFormat: 'dd MMMM, yyyy' } },
    });
    service.readMessages.mockResolvedValue({ success: true, data: { data: history } });
    vi.mocked(ChatServiceFactory.createPublicChatService).mockReturnValue(service as any);

    render(
      <ChatMessagesProvider>
        <AgentChatInterface agent={agent} requireRemoteConfig={requireRemoteConfig} />
      </ChatMessagesProvider>
    );

    await screen.findByText('We open at nine.');
    const answerTime = () =>
      screen.getByText('We open at nine.').closest('.wkflo-chat-bubble-size')?.querySelector('[data-testid="chat-message-timestamp"]')?.textContent;
    // London is on BST (UTC+1) until 25 October 2026.
    await waitFor(() => expect(answerTime()).toBe('21 October, 2026 09:30'));
    expect(service.getAgentSettings).toHaveBeenCalledTimes(1);
  });

  // The widget / share page path end to end: the real PublicApiService reads the public chat
  // configuration response (as the backend shapes it) and the bubbles use its display settings.
  it.each([false, true])('uses the display settings of the public chat configuration response (requireRemoteConfig = %s)', async (requireRemoteConfig) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      resultType: 0,
      data: {
        headerTitle: 'Help', primaryColor: '#123456', bubbleStyle: 'rounded', shareId: 'share-timestamps',
        apiEndpoint: 'https://api.example.com', isWidget: true, isShareable: true,
        securityConfiguration: '{"type":"none"}',
        isVoiceChatEnabled: false, canSelectFeature: false,
        displaySettings: { timeZone: 'Asia/Tokyo', timeFormat: '12h', dateFormat: 'MMM dd, yyyy' },
      },
    }), { status: 200 }));
    const service = createFakeChatService();
    const api = new PublicApiService('https://api.example.com', 'tenant-guid', 'share-timestamps');
    service.getAgentSettings.mockImplementation(() => api.getAgentSettings());
    service.readMessages.mockResolvedValue({ success: true, data: { data: history } });
    vi.mocked(ChatServiceFactory.createPublicChatService).mockReturnValue(service as any);

    render(
      <ChatMessagesProvider>
        <AgentChatInterface agent={agent} requireRemoteConfig={requireRemoteConfig} />
      </ChatMessagesProvider>
    );

    await screen.findByText('We open at nine.');
    const answerTime = () =>
      screen.getByText('We open at nine.').closest('.wkflo-chat-bubble-size')?.querySelector('[data-testid="chat-message-timestamp"]')?.textContent;
    // Tokyo is UTC+9: 08:30 UTC is 5:30 PM.
    await waitFor(() => expect(answerTime()).toBe('Oct 21, 2026 5:30 PM'));
    vi.mocked(globalThis.fetch).mockRestore();
  });
});
