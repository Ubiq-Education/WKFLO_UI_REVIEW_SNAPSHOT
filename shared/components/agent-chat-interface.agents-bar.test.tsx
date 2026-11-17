import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { AgentChatInterface, AgentConfig } from './agent-chat-interface';
import { ChatMessagesProvider } from '../provider/chat-messages-provider';
import { ChatServiceFactory } from '../services/chat-service.factory';
import type { ConversationStateUpdate, SubAgentActivityUpdate, TypingIndicatorUpdate } from '../services/signalr-service';

// Task 7920: by design, the Agents bar is shown in the Chat UI (isWidget = false) and not in the
// Chat Widget (isWidget = true).

vi.mock('../services/chat-service.factory', () => ({
  ChatServiceFactory: { createPublicChatService: vi.fn() },
}));

function createFakeChatService() {
  const handlers: {
    typing?: (update: TypingIndicatorUpdate) => void;
    subAgent?: (update: SubAgentActivityUpdate) => void;
    state?: (update: ConversationStateUpdate) => void;
  } = {};
  return {
    handlers,
    initialize: vi.fn().mockResolvedValue(undefined),
    getConnectionState: vi.fn().mockReturnValue('Connected'),
    disconnect: vi.fn().mockResolvedValue(undefined),
    onMessageUpdate: vi.fn().mockReturnValue(() => {}),
    onToolExecutionUpdate: vi.fn().mockReturnValue(() => {}),
    onSubAgentActivityUpdate: vi.fn((h: (u: SubAgentActivityUpdate) => void) => { handlers.subAgent = h; return () => {}; }),
    onStreamingToken: vi.fn().mockReturnValue(() => {}),
    onStreamingAudio: vi.fn().mockReturnValue(() => {}),
    onTypingIndicator: vi.fn((h: (u: TypingIndicatorUpdate) => void) => { handlers.typing = h; return () => {}; }),
    onConversationStateUpdate: vi.fn((h: (u: ConversationStateUpdate) => void) => { handlers.state = h; return () => {}; }),
    onContactFormRequest: vi.fn().mockReturnValue(() => {}),
    onContactFormCompleted: vi.fn().mockReturnValue(() => {}),
    onToolApprovalRequest: vi.fn().mockReturnValue(() => {}),
    onToolApprovalResolved: vi.fn().mockReturnValue(() => {}),
    // Stop (Task 7921) subscribes to these; harmless before it exists.
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
  shareId: 'share-agents-bar',
  securityConfiguration: { type: 'none' },
  welcomeMessage: 'Hello there',
};

async function setup(isWidget: boolean, agentOverrides: Partial<AgentConfig> = {}) {
  const service = createFakeChatService();
  vi.mocked(ChatServiceFactory.createPublicChatService).mockReturnValue(service as any);
  render(
    <ChatMessagesProvider>
      <AgentChatInterface agent={{ ...agent, ...agentOverrides }} isWidget={isWidget} />
    </ChatMessagesProvider>
  );
  await waitFor(() => expect(service.joinChat).toHaveBeenCalled());
  await waitFor(() => expect(service.handlers.typing).toBeDefined());
  await waitFor(() => expect(service.handlers.subAgent).toBeDefined());
  const chatId: string = service.joinChat.mock.calls[0]?.[0] ?? '';
  return { service, chatId };
}

function emitAgentActivity(service: ReturnType<typeof createFakeChatService>, chatId: string) {
  act(() => service.handlers.typing!({ chatId, isTyping: true, agentId: 1, agentName: 'Test Agent' }));
  act(() => service.handlers.subAgent!({
    chatId,
    agentId: 2,
    agentName: 'Helper Agent',
    action: 'Looking things up',
    status: 'started',
  }));
}

describe('AgentChatInterface Agents bar per variant (Task 7920)', () => {
  beforeEach(() => {
    vi.mocked(ChatServiceFactory.createPublicChatService).mockReset();
  });

  it('shows the Agents bar in the Chat UI after typing and sub-agent events', async () => {
    const { service, chatId } = await setup(false);

    emitAgentActivity(service, chatId);

    expect(await screen.findByTestId('agents-bar')).toBeInTheDocument();
    expect(screen.getAllByTestId('agents-bar-avatar').length).toBeGreaterThan(0);
  });

  it('shows the host agent by name only, even when its description is shown elsewhere', async () => {
    const { service, chatId } = await setup(false, { agentDescription: 'General help', showDescription: true });

    act(() => service.handlers.typing!({ chatId, isTyping: true, agentId: 1, agentName: 'Test Agent' }));

    const status = await screen.findByTestId('agents-bar-status');
    expect(status).toHaveTextContent(/^Test Agent Thinking…$/);
    expect(status).toHaveAttribute('title', 'Test Agent: Thinking…');
    expect(screen.getByRole('img', { name: 'Test Agent (working)' })).toHaveAttribute('title', 'Test Agent');
    expect(screen.getByTestId('agents-bar')).not.toHaveTextContent('General help');
  });

  it('never shows the Agents bar in the Chat Widget, even after the same typing and sub-agent events', async () => {
    const { service, chatId } = await setup(true);

    emitAgentActivity(service, chatId);

    // The widget did render and receive the events: the sub-agent activity is in the thread...
    expect(await screen.findByPlaceholderText('Type your message...')).toBeInTheDocument();
    expect(await screen.findByText(/Looking things up/)).toBeInTheDocument();
    // ...but it renders no Agents bar.
    expect(screen.queryByTestId('agents-bar')).not.toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Agents in this conversation' })).not.toBeInTheDocument();
  });

  it('keeps Stop working in the Chat Widget', async () => {
    const { service, chatId } = await setup(true);
    emitAgentActivity(service, chatId);

    act(() => { screen.getByRole('button', { name: 'Stop all agents' }).click(); });

    expect(service.stopAllAgents).toHaveBeenCalledWith(chatId);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Stop all agents' })).not.toBeInTheDocument());
  });
});

// Task 7947: an agent's avatar leaves the bar when that agent is done; the bar hides when none is left.
describe('AgentChatInterface Agents bar removes finished agents (Task 7947)', () => {
  beforeEach(() => {
    vi.mocked(ChatServiceFactory.createPublicChatService).mockReset();
  });

  it('MAISY -> Kit: removes the host when its turn ends, Kit when it completes, then hides the bar', async () => {
    const { service, chatId } = await setup(false);
    const avatarNames = () => screen.queryAllByTestId('agents-bar-avatar').map(avatar => avatar.getAttribute('title'));

    act(() => service.handlers.typing!({ chatId, isTyping: true, agentId: 1, agentName: 'Test Agent' }));
    act(() => service.handlers.subAgent!({ chatId, agentId: 2, agentName: 'Kit', action: 'Drafting', status: 'started' }));
    act(() => service.handlers.typing!({ chatId, isTyping: false, agentId: 1, agentName: 'Test Agent' }));
    expect(avatarNames()).toEqual(['Test Agent', 'Kit']);
    // Still present but not working: dimmed, as before.
    expect(screen.getByRole('img', { name: 'Test Agent' })).toHaveStyle({ opacity: '0.45' });
    expect(screen.getByRole('img', { name: 'Kit (working)' })).toBeInTheDocument();

    act(() => service.handlers.state!({ chatId, state: 'idle' }));
    expect(avatarNames()).toEqual(['Kit']);
    expect(screen.getByTestId('agents-bar-status')).toHaveTextContent(/^Kit Working: Drafting…$/);

    act(() => service.handlers.subAgent!({ chatId, agentId: 2, agentName: 'Kit', action: 'Drafting', status: 'completed' }));
    expect(screen.queryByTestId('agents-bar')).not.toBeInTheDocument();

    // A new run shows the bar again with only the agent now working.
    act(() => service.handlers.typing!({ chatId, isTyping: true, agentId: 1, agentName: 'Test Agent' }));
    expect(avatarNames()).toEqual(['Test Agent']);
  });
});
