import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AgentChatInterface, AgentConfig } from './agent-chat-interface';
import { ChatMessagesProvider } from '../provider/chat-messages-provider';
import { ChatServiceFactory } from '../services/chat-service.factory';
import type { TypingIndicatorUpdate } from '../services/signalr-service';

// US 7501: while agents work, a phrase recognised by voice input that was already on is not sent.
// It is kept as the message draft, like typed text, and sending works again once the work ends.

vi.mock('../services/chat-service.factory', () => ({
  ChatServiceFactory: { createPublicChatService: vi.fn() },
}));

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
  isVoiceChatEnabled: true,
  shareId: 'share-voice-while-working',
  securityConfiguration: { type: 'none' },
};

function speak(transcript: string) {
  const recognition = FakeRecognition.instances[FakeRecognition.instances.length - 1];
  const finalResult = Object.assign([{ transcript }], { isFinal: true });
  act(() => recognition.onresult!({ results: [finalResult] }));
}

async function setup() {
  const service = createFakeChatService();
  vi.mocked(ChatServiceFactory.createPublicChatService).mockReturnValue(service as any);
  render(
    <ChatMessagesProvider>
      <AgentChatInterface agent={agent} />
    </ChatMessagesProvider>
  );
  await waitFor(() => expect(service.joinChat).toHaveBeenCalled());
  await waitFor(() => expect(service.handlers.typing).toBeDefined());
  await waitFor(() => expect(FakeRecognition.instances.length).toBeGreaterThan(0));
  const chatId: string = service.joinChat.mock.calls[0]?.[0] ?? '';
  return { service, chatId };
}

describe('AgentChatInterface voice input while agents work (US 7501)', () => {
  beforeEach(() => {
    vi.mocked(ChatServiceFactory.createPublicChatService).mockReset();
    vi.stubGlobal('SpeechRecognition', FakeRecognition);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    FakeRecognition.instances = [];
  });

  it('keeps the phrase as the draft instead of sending it, then sends again once the work ends', async () => {
    const { service, chatId } = await setup();
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;

    act(() => service.handlers.typing!({ chatId, isTyping: true, agentId: 1, agentName: 'Test Agent' }));
    expect(await screen.findByRole('button', { name: 'Stop all agents' })).toBeInTheDocument();

    speak('Also check Friday');

    expect(textarea.value).toBe('Also check Friday');
    expect(service.sendVoiceMessage).not.toHaveBeenCalled();

    // Appended to what is already typed, like more typed text.
    speak('and Saturday');
    expect(textarea.value).toBe('Also check Friday and Saturday');
    expect(service.sendVoiceMessage).not.toHaveBeenCalled();

    // The work ends: a new phrase is sent as usual, and the draft stays.
    act(() => service.handlers.typing!({ chatId, isTyping: false, agentId: 1, agentName: 'Test Agent' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Stop all agents' })).not.toBeInTheDocument());
    speak('What about tomorrow');

    await waitFor(() => expect(service.sendVoiceMessage).toHaveBeenCalledWith(expect.objectContaining({ text: 'What about tomorrow' })));
    expect(textarea.value).toBe('Also check Friday and Saturday');
  });

  it('appends to text the user already typed', async () => {
    const user = userEvent.setup();
    const { service, chatId } = await setup();
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    await user.type(textarea, 'Note: ');

    act(() => service.handlers.typing!({ chatId, isTyping: true, agentId: 1, agentName: 'Test Agent' }));
    speak('call the office');

    expect(textarea.value).toBe('Note: call the office');
    expect(service.sendVoiceMessage).not.toHaveBeenCalled();
  });
});
