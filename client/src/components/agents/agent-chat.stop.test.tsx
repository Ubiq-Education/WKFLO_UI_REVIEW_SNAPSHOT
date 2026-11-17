import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AgentChat from './agent-chat';
import { ChatMessagesProvider } from '@shared/provider/chat-messages-provider';
import { ChatServiceFactory } from '@/services/chat-service.factory';
import type { TypingIndicatorUpdate } from '@shared/services/signalr-service';

// US 7500/7501 (Task #7922): the main app's agent test chat shows the shared Agents bar above
// the input, Send becomes Stop while agents work, and Stop clears the bar's active agent.

vi.mock('@/services/chat-service.factory', () => ({
  ChatServiceFactory: { createTenantChatService: vi.fn() },
}));

vi.mock('@azure/msal-react', () => ({
  useMsal: () => ({ accounts: [{ name: 'Test User' }], instance: {}, inProgress: 'none' }),
}));

vi.mock('@/hooks/use-auth', () => ({ default: () => 'test-token' }));

vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }));

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
    getAuthHeaders: vi.fn().mockResolvedValue({}),
    joinChat: vi.fn().mockResolvedValue(undefined),
    leaveChat: vi.fn().mockResolvedValue(undefined),
    sendTypingIndicator: vi.fn().mockResolvedValue(undefined),
    sendMessage: vi.fn().mockResolvedValue({ success: true }),
    sendVoiceMessage: vi.fn().mockResolvedValue({ success: true }),
  };
}

const SESSION_ID = 'session-7922';

async function setup() {
  const service = createFakeChatService();
  vi.mocked(ChatServiceFactory.createTenantChatService).mockReturnValue(service as any);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ChatMessagesProvider>
        <AgentChat
          agent={{ id: 1, name: 'Maisy', enableSTM: false }}
          session={{ sessionId: SESSION_ID, chatName: 'Test chat' }}
        />
      </ChatMessagesProvider>
    </QueryClientProvider>
  );
  await waitFor(() => expect(service.handlers.typing).toBeDefined());
  return service;
}

const typing = (isTyping: boolean, agentId: number, agentName: string): TypingIndicatorUpdate => ({
  chatId: SESSION_ID,
  isTyping,
  agentId,
  agentName,
});

describe('AgentChat - Agents bar and Stop (Task #7922)', () => {
  beforeEach(() => {
    vi.mocked(ChatServiceFactory.createTenantChatService).mockReset();
  });

  it('shows no Agents bar and no Stop before any agent has taken part', async () => {
    await setup();

    expect(screen.queryByTestId('agents-bar')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Stop all agents' })).not.toBeInTheDocument();
  });

  it('renders the Agents bar with the name of the working agent, and shows Stop', async () => {
    const service = await setup();

    act(() => service.handlers.typing!(typing(true, 1, 'Maisy')));
    act(() => service.handlers.typing!(typing(true, 2, 'Kit')));

    expect(await screen.findByTestId('agents-bar')).toBeInTheDocument();
    expect(screen.getAllByTestId('agents-bar-avatar')).toHaveLength(2);
    expect(screen.getByTestId('agents-bar-status')).toHaveTextContent(/^Kit Thinking…$/);
    expect(screen.getByRole('button', { name: 'Stop all agents' })).toBeInTheDocument();
  });

  it('shows only the name of the host agent', async () => {
    const service = await setup();

    act(() => service.handlers.typing!(typing(true, 1, 'Maisy')));

    expect(await screen.findByTestId('agents-bar-status')).toHaveTextContent(/^Maisy Thinking…$/);
  });

  it('calls the stop endpoint, clears the active agent and returns to Send', async () => {
    const service = await setup();
    act(() => service.handlers.typing!(typing(true, 1, 'Maisy')));
    act(() => service.handlers.typing!(typing(true, 2, 'Kit')));

    await userEvent.setup().click(await screen.findByRole('button', { name: 'Stop all agents' }));

    expect(service.stopAllAgents).toHaveBeenCalledWith(SESSION_ID);
    expect(screen.queryByRole('button', { name: 'Stop all agents' })).not.toBeInTheDocument();
    // Task 7947: every agent is done, so the bar empties and hides.
    expect(screen.queryAllByTestId('agents-bar-avatar')).toHaveLength(0);
    expect(screen.queryByTestId('agents-bar')).not.toBeInTheDocument();
    expect(screen.queryByTestId('agents-bar-status')).not.toBeInTheDocument();
    // The connection stays as it was.
    expect(screen.getByTitle('Real-time connection: Connected')).toBeInTheDocument();
  });

  it('does not send on Enter while agents work', async () => {
    const service = await setup();
    act(() => service.handlers.typing!(typing(true, 1, 'Maisy')));
    await screen.findByRole('button', { name: 'Stop all agents' });

    const user = userEvent.setup();
    const textbox = screen.getByRole('textbox');
    await user.type(textbox, 'another question{Enter}');

    expect(textbox).toHaveValue('another question');
    expect(service.sendMessage).not.toHaveBeenCalled();
  });

  it('sends on Enter again once the agents are done', async () => {
    const service = await setup();
    act(() => service.handlers.typing!(typing(true, 1, 'Maisy')));
    act(() => service.handlers.typing!(typing(false, 1, 'Maisy')));

    await userEvent.setup().type(screen.getByRole('textbox'), 'another question{Enter}');

    await waitFor(() => expect(service.sendMessage).toHaveBeenCalledTimes(1));
    expect(service.sendMessage.mock.calls[0][0].input.text).toBe('another question');
  });
});

// US 7501: while agents work, a phrase recognised by voice input that was already on is not sent;
// it is kept as the message draft, and sending works again once the work ends.
describe('AgentChat - voice input while agents work (Task #7922)', () => {
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

  function speak(transcript: string) {
    const recognition = FakeRecognition.instances[FakeRecognition.instances.length - 1];
    const finalResult = Object.assign([{ transcript }], { isFinal: true });
    act(() => recognition.onresult!({ results: [finalResult] }));
  }

  beforeEach(() => {
    vi.mocked(ChatServiceFactory.createTenantChatService).mockReset();
    vi.stubGlobal('SpeechRecognition', FakeRecognition);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    FakeRecognition.instances = [];
  });

  it('keeps the phrase as the draft instead of sending it, then sends again once the work ends', async () => {
    const service = await setup();
    await waitFor(() => expect(FakeRecognition.instances.length).toBeGreaterThan(0));
    const messageInput = screen.getByRole('textbox') as HTMLInputElement;

    act(() => service.handlers.typing!(typing(true, 1, 'Maisy')));
    expect(await screen.findByRole('button', { name: 'Stop all agents' })).toBeInTheDocument();

    speak('Also check Friday');
    expect(messageInput.value).toBe('Also check Friday');
    speak('and Saturday');
    expect(messageInput.value).toBe('Also check Friday and Saturday');
    expect(service.sendVoiceMessage).not.toHaveBeenCalled();

    act(() => service.handlers.typing!(typing(false, 1, 'Maisy')));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Stop all agents' })).not.toBeInTheDocument());
    speak('What about tomorrow');

    await waitFor(() => expect(service.sendVoiceMessage).toHaveBeenCalledWith(expect.objectContaining({ text: 'What about tomorrow' })));
    expect(messageInput.value).toBe('Also check Friday and Saturday');
  });
});

// US 7948: a rejected send is explained in the chat instead of failing silently.
describe('AgentChat - send errors (US 7948)', () => {
  beforeEach(() => {
    vi.mocked(ChatServiceFactory.createTenantChatService).mockReset();
  });

  it('shows the friendly error as an assistant message when the send fails', async () => {
    const service = await setup();
    service.sendMessage.mockResolvedValueOnce({ success: false, error: 'One of your images is in a format that can\'t be used.' });

    await userEvent.setup().type(screen.getByRole('textbox'), 'see this photo{Enter}');

    expect(await screen.findByText('One of your images is in a format that can\'t be used.')).toBeInTheDocument();
  });
});
