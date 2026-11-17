import React from 'react';
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { AgentChatInterface, AgentConfig } from './agent-chat-interface';
import { ChatMessagesProvider } from '../provider/chat-messages-provider';
import { ChatServiceFactory } from '../services/chat-service.factory';

// Verifies the data-is-test-chat="true" script attribute (parsed in chat-widget/src/widget.tsx
// into AgentConfig.isTestChat) reaches ChatServiceFactory.createPublicChatService — the same
// propagation pattern already used for isWidget/previewMode — so PublicApiService can send the
// amais-wkflo-is-test-chat header. See US 6933.
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
  shareId: 'share-is-test-chat',
  securityConfiguration: { type: 'none' },
};

function renderInterface(agent: AgentConfig) {
  return render(
    <ChatMessagesProvider>
      <AgentChatInterface agent={agent} />
    </ChatMessagesProvider>
  );
}

describe('AgentChatInterface — isTestChat propagation (CMS Test Agent tab embed)', () => {
  beforeEach(() => {
    vi.mocked(ChatServiceFactory.createPublicChatService).mockClear();
  });

  it('forwards isTestChat: true into ChatServiceFactory.createPublicChatService when the flag is set', async () => {
    vi.mocked(ChatServiceFactory.createPublicChatService).mockReturnValue(createFakeChatService() as any);

    renderInterface({ ...baseAgent, isTestChat: true });

    await waitFor(() => expect(ChatServiceFactory.createPublicChatService).toHaveBeenCalled());
    const config = vi.mocked(ChatServiceFactory.createPublicChatService).mock.calls[0][0];
    expect(config.isTestChat).toBe(true);
  });

  it('does not set isTestChat when the flag is absent (production embeds)', async () => {
    vi.mocked(ChatServiceFactory.createPublicChatService).mockReturnValue(createFakeChatService() as any);

    renderInterface(baseAgent);

    await waitFor(() => expect(ChatServiceFactory.createPublicChatService).toHaveBeenCalled());
    const config = vi.mocked(ChatServiceFactory.createPublicChatService).mock.calls[0][0];
    expect(config.isTestChat).toBeFalsy();
  });
});

// Bug 7958: the Test Agent page used to resume whatever session id was persisted in localStorage
// (possibly one already deleted server-side), so its messages never reached Chat Logs until the
// user pressed reset. Test chats must start a fresh session on every page load; public embeds
// keep resuming their persisted session.
describe('AgentChatInterface — session per page load (Bug 7958)', () => {
  const persistedSessionId = '11111111-2222-4333-8444-555555555555';
  const publicSessionKey = 'wkflo-chat-session-tenant-guid-share-is-test-chat-anonymous';
  const originalLocalStorage = Object.getOwnPropertyDescriptor(window, 'localStorage');

  afterAll(() => {
    if (originalLocalStorage) Object.defineProperty(window, 'localStorage', originalLocalStorage);
  });

  beforeEach(() => {
    vi.mocked(ChatServiceFactory.createPublicChatService).mockClear();

    // client/src/test-setup.ts breaks jsdom's origin-bound localStorage — stub an in-memory one.
    const store = new Map<string, string>([[publicSessionKey, persistedSessionId]]);
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
        removeItem: (key: string) => store.delete(key),
        clear: () => store.clear(),
        key: (index: number) => Array.from(store.keys())[index] ?? null,
        get length() { return store.size; },
      },
      configurable: true,
    });
  });

  it('resumes the persisted session for public embeds', async () => {
    const chatService = createFakeChatService();
    vi.mocked(ChatServiceFactory.createPublicChatService).mockReturnValue(chatService as any);

    renderInterface(baseAgent);

    await waitFor(() => expect(chatService.readMessages).toHaveBeenCalled());
    expect(chatService.readMessages).toHaveBeenCalledWith(persistedSessionId);
  });

  it('starts a fresh session for test chats instead of resuming the persisted one', async () => {
    const chatService = createFakeChatService();
    vi.mocked(ChatServiceFactory.createPublicChatService).mockReturnValue(chatService as any);

    renderInterface({ ...baseAgent, isTestChat: true });

    await waitFor(() => expect(chatService.readMessages).toHaveBeenCalled());
    const sessionIds = chatService.readMessages.mock.calls.map(call => call[0]);
    expect(sessionIds).not.toContain(persistedSessionId);
    expect(new Set(sessionIds).size).toBe(1);
    expect(window.localStorage.getItem(`${publicSessionKey}-test`)).toBeNull();
  });
});
