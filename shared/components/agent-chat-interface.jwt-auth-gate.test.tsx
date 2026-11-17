import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AgentChatInterface, AgentConfig } from './agent-chat-interface';
import { ChatMessagesProvider } from '../provider/chat-messages-provider';
import { ChatServiceFactory } from '../services/chat-service.factory';
import { DelegatedTokenService } from '../services/delegated-token-service';

// Mocked so these tests can control exactly when getSpinUpAgents/getAgentSettings resolve,
// without spinning up a real SignalR connection or hitting the network.
vi.mock('../services/chat-service.factory', () => ({
  ChatServiceFactory: { createPublicChatService: vi.fn() },
}));

// Minimal stand-in for ChatService covering every method agent-chat-interface/use-chat call
// during mount.
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

// A JWT well-formed enough for agent-chat-interface's own decodeJWT (header.payload.signature,
// payload a plain base64-encoded JSON object) — the signature segment is never verified client-side.
function makeFakeJwt(claims: Record<string, unknown>): string {
  return `header.${btoa(JSON.stringify(claims))}.signature`;
}

const jwtAgent: AgentConfig = {
  tenantGuid: 'tenant-guid',
  agentName: 'Test Agent',
  primaryColor: '#000000',
  bubbleStyle: 'rounded',
  showDescription: false,
  chainOfThought: false,
  apiEndpoint: 'https://api.example.com',
  isVoiceChatEnabled: false,
  shareId: 'share-jwt',
  securityConfiguration: { type: 'jwt-token-callback', jwt: { domains: ['example.com'] } },
};

function renderInterface() {
  return render(
    <ChatMessagesProvider>
      <AgentChatInterface agent={jwtAgent} />
    </ChatMessagesProvider>
  );
}

describe('AgentChatInterface jwt-token-callback auth gate', () => {
  let originalParent: Window;
  let fakeParent: { postMessage: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    DelegatedTokenService.resetInstance();
    originalParent = window.parent;
    fakeParent = { postMessage: vi.fn() };
    Object.defineProperty(window, 'parent', { value: fakeParent, configurable: true });
  });

  afterEach(() => {
    Object.defineProperty(window, 'parent', { value: originalParent, configurable: true });
    DelegatedTokenService.resetInstance();
  });

  it('does not call getSpinUpAgents until the jwt-callback token resolves, then calls it once it does', async () => {
    const fakeChatService = createFakeChatService();
    vi.mocked(ChatServiceFactory.createPublicChatService).mockReturnValue(fakeChatService as any);

    renderInterface();

    await screen.findByPlaceholderText(/^Ask Test Agent/);
    // Let any pending microtasks settle without the token ever resolving — this simulates the
    // hard-reload race where DelegatedTokenService's single postMessage request is lost and its
    // promise just hangs.
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(fakeParent.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'REQUEST_DELEGATED_TOKEN' }),
      '*'
    );
    expect(fakeChatService.getSpinUpAgents).not.toHaveBeenCalled();

    // Now the host answers.
    window.dispatchEvent(new MessageEvent('message', {
      origin: 'https://example.com',
      data: { type: 'DELEGATED_TOKEN', token: makeFakeJwt({ sub: 'user-1', site_id: 'site-1' }) },
    }));

    await waitFor(() => {
      expect(fakeChatService.getSpinUpAgents).toHaveBeenCalled();
    });
  });

  it('never calls getSpinUpAgents if the token request is permanently lost (regression guard for the pre-fix hang)', async () => {
    const fakeChatService = createFakeChatService();
    vi.mocked(ChatServiceFactory.createPublicChatService).mockReturnValue(fakeChatService as any);

    renderInterface();

    await screen.findByPlaceholderText(/^Ask Test Agent/);
    // Give effects several ticks to (incorrectly, pre-fix) fire anyway.
    for (let i = 0; i < 5; i++) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    expect(fakeChatService.getSpinUpAgents).not.toHaveBeenCalled();
  });
});
