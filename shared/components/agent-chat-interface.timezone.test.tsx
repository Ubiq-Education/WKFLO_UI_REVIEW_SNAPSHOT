import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { AgentChatInterface, AgentConfig } from './agent-chat-interface';
import { ChatMessagesProvider } from '../provider/chat-messages-provider';
import { ChatServiceFactory } from '../services/chat-service.factory';

// Verifies the data-timezone="..." script attribute (parsed in chat-widget/src/widget.tsx into
// AgentConfig.timeZone) reaches ChatServiceFactory.createPublicChatService — the same
// propagation pattern already used for isTestChat — so PublicApiService can send the
// amais-wkflo-time-zone header. This must be the school's timezone supplied by the host page,
// never the visitor's own browser timezone. See US 6764.
vi.mock('../services/chat-service.factory', () => ({
  ChatServiceFactory: { createPublicChatService: vi.fn() },
}));

function createFakeChatService() {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    getConnectionState: vi.fn().mockReturnValue('Disconnected'),
    disconnect: vi.fn().mockResolvedValue(undefined),
    onMessageUpdate: vi.fn().mockReturnValue(() => {}),
    onToolExecutionUpdate: vi.fn().mockReturnValue(() => {}),
    onSubAgentActivityUpdate: vi.fn().mockReturnValue(() => {}),
    onStreamingToken: vi.fn().mockReturnValue(() => {}),
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
    respondToToolApproval: vi.fn().mockResolvedValue({ success: true }),
    onConnectionStatusChange: vi.fn().mockReturnValue(() => {}),
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

const baseAgent: AgentConfig = {
  tenantGuid: 'tenant-guid',
  agentName: 'Test Agent',
  primaryColor: '#000000',
  bubbleStyle: 'rounded',
  showDescription: false,
  chainOfThought: false,
  apiEndpoint: 'https://api.example.com',
  isVoiceChatEnabled: false,
  shareId: 'share-timezone',
  securityConfiguration: { type: 'none' },
};

function renderInterface(agent: AgentConfig) {
  return render(
    <ChatMessagesProvider>
      <AgentChatInterface agent={agent} />
    </ChatMessagesProvider>
  );
}

describe('AgentChatInterface — timeZone propagation (host-supplied school timezone)', () => {
  beforeEach(() => {
    vi.mocked(ChatServiceFactory.createPublicChatService).mockClear();
  });

  it('forwards timeZone into ChatServiceFactory.createPublicChatService when provided', async () => {
    vi.mocked(ChatServiceFactory.createPublicChatService).mockReturnValue(createFakeChatService() as any);

    renderInterface({ ...baseAgent, timeZone: 'America/New_York' });

    await waitFor(() => expect(ChatServiceFactory.createPublicChatService).toHaveBeenCalled());
    const config = vi.mocked(ChatServiceFactory.createPublicChatService).mock.calls[0][0];
    expect(config.timeZone).toBe('America/New_York');
  });

  it('does not set timeZone when absent from the embed (no data-timezone attribute)', async () => {
    vi.mocked(ChatServiceFactory.createPublicChatService).mockReturnValue(createFakeChatService() as any);

    renderInterface(baseAgent);

    await waitFor(() => expect(ChatServiceFactory.createPublicChatService).toHaveBeenCalled());
    const config = vi.mocked(ChatServiceFactory.createPublicChatService).mock.calls[0][0];
    expect(config.timeZone).toBeFalsy();
  });

  it('does not set a truthy timeZone when the embed provides an empty string', async () => {
    vi.mocked(ChatServiceFactory.createPublicChatService).mockReturnValue(createFakeChatService() as any);

    renderInterface({ ...baseAgent, timeZone: '' });

    await waitFor(() => expect(ChatServiceFactory.createPublicChatService).toHaveBeenCalled());
    const config = vi.mocked(ChatServiceFactory.createPublicChatService).mock.calls[0][0];
    expect(config.timeZone).toBeFalsy();
  });
});
