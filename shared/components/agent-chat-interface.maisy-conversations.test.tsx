import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AgentChatInterface, AgentConfig } from './agent-chat-interface';
import { ChatMessagesProvider } from '../provider/chat-messages-provider';
import { ChatServiceFactory } from '../services/chat-service.factory';
import type { ConversationSummary, SessionWorkingState } from '../models/conversation-summary';

// US 7506 / 7507: a MAISY chat's back arrow opens the conversations list; a row opens that
// conversation, with its own history, draft and agents still working. Other agents have no list.

vi.mock('../services/chat-service.factory', () => ({
  ChatServiceFactory: { createPublicChatService: vi.fn() },
}));

const FIRST_SESSION = '11111111-1111-4111-8111-111111111111';
const SECOND_SESSION = '22222222-2222-4222-8222-222222222222';
const SESSION_KEY = 'wkflo-chat-session-tenant-guid-share-conversations-anonymous';

const conversation = (sessionId: string, title: string, lastActivityAt: string): ConversationSummary => ({
  sessionId,
  title,
  previewLine: `${title} preview`,
  lastActivityAt,
  agents: [{ agentId: 12, name: 'MAISY', role: 'Your AI assistant', avatarUrl: null }],
});

const historyFor = (sessionId: string) => ({
  success: true,
  data: {
    data: [{
      id: `reply-${sessionId}`,
      content: sessionId === FIRST_SESSION ? 'Reply in the first conversation' : 'Reply in the second conversation',
      type: 'assistant',
      timestamp: '2026-09-27T16:10:00Z',
      channelMessageType: 1,
    }],
  },
});

function createFakeChatService(workingState: SessionWorkingState = { isWorking: false }) {
  const connection: { handler?: (isConnected: boolean) => void } = {};
  // The latest subscribed handlers, to push live events.
  const handlers: {
    typing?: (update: { chatId: string; isTyping: boolean; agentId?: number; agentName?: string }) => void;
    token?: (update: Record<string, unknown>) => void;
    state?: (update: { chatId: string; state: string }) => void;
  } = {};
  return {
    connection,
    handlers,
    initialize: vi.fn().mockResolvedValue(undefined),
    getConnectionState: vi.fn().mockReturnValue('Connected'),
    getConnectionPhase: vi.fn().mockReturnValue('connected'),
    isConnected: true,
    disconnect: vi.fn().mockResolvedValue(undefined),
    onMessageUpdate: vi.fn().mockReturnValue(() => {}),
    onToolExecutionUpdate: vi.fn().mockReturnValue(() => {}),
    onSubAgentActivityUpdate: vi.fn().mockReturnValue(() => {}),
    onStreamingToken: vi.fn((handler: NonNullable<typeof handlers.token>) => {
      handlers.token = handler;
      return () => {};
    }),
    onStreamingAudio: vi.fn().mockReturnValue(() => {}),
    onTypingIndicator: vi.fn((handler: NonNullable<typeof handlers.typing>) => {
      handlers.typing = handler;
      return () => {};
    }),
    onConversationStateUpdate: vi.fn((handler: NonNullable<typeof handlers.state>) => {
      handlers.state = handler;
      return () => {};
    }),
    onContactFormRequest: vi.fn().mockReturnValue(() => {}),
    onContactFormCompleted: vi.fn().mockReturnValue(() => {}),
    onToolApprovalRequest: vi.fn().mockReturnValue(() => {}),
    onToolApprovalResolved: vi.fn().mockReturnValue(() => {}),
    onConversationStopped: vi.fn().mockReturnValue(() => {}),
    clearQueuedStreamingTokens: vi.fn(),
    stopAllAgents: vi.fn().mockResolvedValue({ success: true }),
    respondToToolApproval: vi.fn().mockResolvedValue({ success: true }),
    onConnectionStatusChange: vi.fn((handler: (isConnected: boolean) => void) => {
      connection.handler = handler;
      handler(true);
      return () => {};
    }),
    readMessages: vi.fn((sessionId: string) => Promise.resolve(historyFor(sessionId))),
    listConversations: vi.fn().mockResolvedValue({
      success: true,
      data: [
        conversation(FIRST_SESSION, 'First conversation', '2026-09-27T16:10:00Z'),
        conversation(SECOND_SESSION, 'Second conversation', '2026-09-26T09:00:00Z'),
      ],
    }),
    getSessionWorkingState: vi.fn().mockResolvedValue(workingState),
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
  agentName: 'MAISY',
  agentId: 12,
  primaryColor: '#e0f5f0',
  foregroundColor: '#1f2523',
  bubbleStyle: 'rounded',
  showDescription: false,
  chainOfThought: false,
  apiEndpoint: 'https://api.example.com',
  isVoiceChatEnabled: false,
  shareId: 'share-conversations',
  securityConfiguration: { type: 'none' },
};

const maisyAgent: AgentConfig = { ...baseAgent, isMaisyAgent: true };

async function setup(agent: AgentConfig = maisyAgent, workingState?: SessionWorkingState) {
  const service = createFakeChatService(workingState);
  vi.mocked(ChatServiceFactory.createPublicChatService).mockReturnValue(service as any);
  render(
    <ChatMessagesProvider>
      <AgentChatInterface agent={agent} />
    </ChatMessagesProvider>
  );
  await screen.findByText('Reply in the first conversation');
  return { service, user: userEvent.setup() };
}

async function openList(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Back to conversations' }));
  return screen.findByRole('list', { name: 'Conversations' });
}

describe('AgentChatInterface — MAISY conversations (US 7506 / 7507)', () => {
  beforeEach(() => {
    vi.mocked(ChatServiceFactory.createPublicChatService).mockReset();
    localStorage.clear();
    localStorage.setItem(SESSION_KEY, FIRST_SESSION);
  });

  it('has no back arrow or list for an agent that is not MAISY', async () => {
    await setup(baseAgent);

    expect(screen.queryByRole('button', { name: 'Back to conversations' })).not.toBeInTheDocument();
  });

  it('opens the conversations list from the back arrow, marking the conversation that was open', async () => {
    const { service, user } = await setup();
    // The header's title lookup of the restored session is the first call (Task 8225).
    await waitFor(() => expect(service.listConversations).toHaveBeenCalledTimes(1));

    const list = await openList(user);

    expect(service.listConversations).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('heading', { name: 'Conversations' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back to conversations' })).not.toBeInTheDocument();
    const rows = within(list).getAllByRole('button');
    expect(rows[0]).toHaveTextContent('First conversation');
    expect(rows[0]).toHaveAttribute('aria-current', 'true');
    expect(screen.getByTestId('maisy-view-pane')).toHaveClass('wkflo-maisy-view-enter-from-left');
  });

  it('shows the footer message with the conversation, not with the conversations list', async () => {
    const { user } = await setup({ ...maisyAgent, footerMessage: 'AI can make mistakes.' });
    expect(screen.getByText('AI can make mistakes.')).toBeInTheDocument();

    await openList(user);
    expect(screen.queryByText('AI can make mistakes.')).not.toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: /First conversation/ })[0]);
    expect(await screen.findByText('AI can make mistakes.')).toBeInTheDocument();
  });

  it("shows the list timestamps in the tenant's time zone and formats", async () => {
    const { user } = await setup({
      ...maisyAgent,
      displaySettings: { timeZone: 'Europe/London', dateFormat: 'dd/MM/yyyy', timeFormat: '12h' },
    });

    const list = await openList(user);

    // 16:10 UTC is 17:10 in London (BST).
    expect(within(list).getByText('27/09/2026 5:10 PM')).toBeInTheDocument();
  });

  it('moves focus to the row of the open conversation when the list opens, and to the composer when a conversation opens', async () => {
    const { user } = await setup();

    const list = await openList(user);
    await waitFor(() => expect(within(list).getByRole('button', { name: /^First conversation/ })).toHaveFocus());

    await user.click(within(list).getByRole('button', { name: /^Second conversation/ }));
    await screen.findByText('Reply in the second conversation');
    await waitFor(() => expect(screen.getByRole('textbox')).toHaveFocus());
  });

  it('focuses the composer when going back to the conversation that was open', async () => {
    const { user } = await setup();
    await openList(user);

    await user.keyboard('{Enter}');

    expect(await screen.findByText('Reply in the first conversation')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('textbox')).toHaveFocus());
  });

  it('does not move focus into the composer when the chat first opens', async () => {
    await setup();

    expect(screen.getByRole('textbox')).not.toHaveFocus();
  });

  it('reloads the list each time it is shown', async () => {
    const { service, user } = await setup();
    await openList(user);
    await user.click(screen.getByRole('button', { name: /^First conversation/ }));

    await openList(user);

    // The title lookup, the first list load and this one.
    await waitFor(() => expect(service.listConversations).toHaveBeenCalledTimes(3));
  });

  it('opens another conversation with its own history and joins its session', async () => {
    const { service, user } = await setup();
    await openList(user);

    await user.click(screen.getByRole('button', { name: /^Second conversation/ }));

    expect(await screen.findByText('Reply in the second conversation')).toBeInTheDocument();
    expect(screen.queryByText('Reply in the first conversation')).not.toBeInTheDocument();
    expect(service.readMessages).toHaveBeenLastCalledWith(SECOND_SESSION);
    await waitFor(() => expect(service.joinChat).toHaveBeenLastCalledWith(SECOND_SESSION));
    expect(localStorage.getItem(SESSION_KEY)).toBe(SECOND_SESSION);
    expect(screen.getByTestId('maisy-view-pane')).toHaveClass('wkflo-maisy-view-enter-from-right');
  });

  it("leaves the previous conversation's SignalR group when switching, and joins it again on return", async () => {
    const { service, user } = await setup();
    await waitFor(() => expect(service.joinChat).toHaveBeenLastCalledWith(FIRST_SESSION));
    expect(service.leaveChat).not.toHaveBeenCalled();

    // The list alone keeps the open conversation joined.
    await openList(user);
    expect(service.leaveChat).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /^Second conversation/ }));
    await screen.findByText('Reply in the second conversation');
    expect(service.leaveChat).toHaveBeenCalledTimes(1);
    expect(service.leaveChat).toHaveBeenLastCalledWith(FIRST_SESSION);
    expect(service.joinChat).toHaveBeenLastCalledWith(SECOND_SESSION);

    await openList(user);
    await user.click(screen.getByRole('button', { name: /^First conversation/ }));
    await screen.findByText('Reply in the first conversation');
    expect(service.leaveChat).toHaveBeenLastCalledWith(SECOND_SESSION);
    expect(service.joinChat).toHaveBeenLastCalledWith(FIRST_SESSION);
    // Back in the first conversation, it catches up on what happened while it was not joined.
    await waitFor(() => expect(service.getSessionWorkingState).toHaveBeenLastCalledWith(FIRST_SESSION));
    expect(service.readMessages).toHaveBeenLastCalledWith(FIRST_SESSION);
    // Each switch leaves exactly one group: the one before it.
    expect(service.leaveChat).toHaveBeenCalledTimes(2);
  });

  it('goes back to the conversation that was open without loading it again', async () => {
    const { service, user } = await setup();
    const readsBefore = service.readMessages.mock.calls.length;
    await openList(user);

    await user.click(screen.getByRole('button', { name: /^First conversation/ }));

    expect(screen.getByText('Reply in the first conversation')).toBeInTheDocument();
    expect(service.readMessages.mock.calls.length).toBe(readsBefore);
  });

  it('keeps each conversation\'s draft', async () => {
    const { user } = await setup();
    await user.type(screen.getByRole('textbox'), 'Draft for the first');

    await openList(user);
    await user.click(screen.getByRole('button', { name: /^Second conversation/ }));
    await screen.findByText('Reply in the second conversation');
    expect(screen.getByRole('textbox')).toHaveValue('');
    await user.type(screen.getByRole('textbox'), 'Draft for the second');

    await openList(user);
    await user.click(screen.getByRole('button', { name: /^First conversation/ }));
    await screen.findByText('Reply in the first conversation');
    expect(screen.getByRole('textbox')).toHaveValue('Draft for the first');

    await openList(user);
    await user.click(screen.getByRole('button', { name: /^Second conversation/ }));
    await screen.findByText('Reply in the second conversation');
    expect(screen.getByRole('textbox')).toHaveValue('Draft for the second');
  });

  it('shows the agents still working when returning to a conversation', async () => {
    const { service, user } = await setup(maisyAgent, { isWorking: true });
    await openList(user);

    await user.click(screen.getByRole('button', { name: /^Second conversation/ }));

    await waitFor(() => expect(service.getSessionWorkingState).toHaveBeenCalledWith(SECOND_SESSION));
    expect(await screen.findByRole('button', { name: 'Stop all agents' })).toBeInTheDocument();
  });

  it('drops a late "working" answer when the turn ended while it was being looked up', async () => {
    const { service, user } = await setup();
    let answerWorkingState!: (state: SessionWorkingState) => void;
    service.getSessionWorkingState.mockImplementation(() => new Promise<SessionWorkingState>(resolve => {
      answerWorkingState = resolve;
    }));
    await openList(user);
    await user.click(screen.getByRole('button', { name: /^Second conversation/ }));
    await waitFor(() => expect(service.getSessionWorkingState).toHaveBeenCalledWith(SECOND_SESSION));

    // The live typing-off arrives first; the answer read before it says "working".
    act(() => service.handlers.typing!({ chatId: SECOND_SESSION, isTyping: false, agentId: 12, agentName: 'MAISY' }));
    await act(async () => answerWorkingState({ isWorking: true }));

    expect(screen.queryByRole('button', { name: 'Stop all agents' })).not.toBeInTheDocument();
  });

  it('shows the conversation as idle when its agents are done', async () => {
    const { service, user } = await setup();
    await openList(user);

    await user.click(screen.getByRole('button', { name: /^Second conversation/ }));

    await waitFor(() => expect(service.getSessionWorkingState).toHaveBeenCalledWith(SECOND_SESSION));
    expect(screen.queryByRole('button', { name: 'Stop all agents' })).not.toBeInTheDocument();
  });

  it('catches up on the open conversation once the connection is back', async () => {
    const { service } = await setup();
    const readsBefore = service.readMessages.mock.calls.length;

    service.getConnectionPhase.mockReturnValue('reconnecting');
    act(() => service.connection.handler!(false));
    service.getConnectionPhase.mockReturnValue('connected');
    act(() => service.connection.handler!(true));

    await waitFor(() => expect(service.getSessionWorkingState).toHaveBeenCalledWith(FIRST_SESSION));
    expect(service.readMessages.mock.calls.length).toBe(readsBefore + 1);
    expect(service.readMessages).toHaveBeenLastCalledWith(FIRST_SESSION);
  });
});

describe('AgentChatInterface — MAISY New chat (US 7505)', () => {
  const GREETING = "Hi! I'm MAISY. How can I assist you today?";

  beforeEach(() => {
    vi.mocked(ChatServiceFactory.createPublicChatService).mockReset();
    localStorage.clear();
    localStorage.setItem(SESSION_KEY, FIRST_SESSION);
  });

  it('opens an empty chat with the greeting in a new session', async () => {
    const { service, user } = await setup();

    await user.click(screen.getByRole('button', { name: 'New chat' }));

    expect(screen.queryByText('Reply in the first conversation')).not.toBeInTheDocument();
    expect(screen.getByText(GREETING)).toBeInTheDocument();
    const newSession = localStorage.getItem(SESSION_KEY);
    expect(newSession).not.toBe(FIRST_SESSION);
    await waitFor(() => expect(service.joinChat).toHaveBeenLastCalledWith(newSession));
  });

  it('does nothing while the open chat is already a new, empty one', async () => {
    const { user } = await setup();
    await user.click(screen.getByRole('button', { name: 'New chat' }));
    const newSession = localStorage.getItem(SESSION_KEY);
    await user.type(screen.getByRole('textbox'), 'Half-written question');

    await user.click(screen.getByRole('button', { name: 'New chat' }));

    expect(localStorage.getItem(SESSION_KEY)).toBe(newSession);
    expect(screen.getByRole('textbox')).toHaveValue('Half-written question');
  });

  it('keeps the draft with the conversation it was written in', async () => {
    const { user } = await setup();
    await user.type(screen.getByRole('textbox'), 'Draft for the first');

    await user.click(screen.getByRole('button', { name: 'New chat' }));
    expect(screen.getByRole('textbox')).toHaveValue('');

    await openList(user);
    await user.click(screen.getByRole('button', { name: /^First conversation/ }));
    await screen.findByText('Reply in the first conversation');
    expect(screen.getByRole('textbox')).toHaveValue('Draft for the first');
  });

  it("does not start a new chat while the open conversation's history is still loading", async () => {
    const { service, user } = await setup();
    let answerHistory!: () => void;
    service.readMessages.mockImplementation((sessionId: string) => new Promise(resolve => {
      answerHistory = () => resolve(historyFor(sessionId));
    }));
    await openList(user);
    await user.click(screen.getByRole('button', { name: /^Second conversation/ }));
    await waitFor(() => expect(service.readMessages).toHaveBeenLastCalledWith(SECOND_SESSION));

    // The history isn't there yet, so the conversation only looks empty: New chat changes nothing.
    await user.click(screen.getByRole('button', { name: 'New chat' }));
    expect(localStorage.getItem(SESSION_KEY)).toBe(SECOND_SESSION);

    await act(async () => answerHistory());

    // The history lands in the conversation it belongs to, which is still the open one.
    expect(await screen.findByText('Reply in the second conversation')).toBeInTheDocument();
    expect(localStorage.getItem(SESSION_KEY)).toBe(SECOND_SESSION);
    expect(service.joinChat).toHaveBeenLastCalledWith(SECOND_SESSION);
    expect(service.readMessages).toHaveBeenCalledTimes(2);
  });

  it('starts a new chat from the conversations list', async () => {
    const { user } = await setup();
    await openList(user);

    await user.click(screen.getByRole('button', { name: 'New chat' }));

    expect(screen.queryByRole('list', { name: 'Conversations' })).not.toBeInTheDocument();
    expect(screen.getByText(GREETING)).toBeInTheDocument();
    expect(localStorage.getItem(SESSION_KEY)).not.toBe(FIRST_SESSION);
  });

  it('goes back to the empty new chat from the list instead of starting another', async () => {
    const { user } = await setup();
    await user.click(screen.getByRole('button', { name: 'New chat' }));
    const newSession = localStorage.getItem(SESSION_KEY);
    await openList(user);

    await user.click(screen.getByRole('button', { name: 'New chat' }));

    expect(screen.getByText(GREETING)).toBeInTheDocument();
    expect(localStorage.getItem(SESSION_KEY)).toBe(newSession);
  });
});

describe('AgentChatInterface — MAISY header conversation title (Task 8225)', () => {
  const titleOf = () => screen.queryByTestId('maisy-conversation-title');

  // Renders with a fake service whose list answers with `rows`, and the session in storage as given.
  async function setupWithList(rows: ConversationSummary[], storedSession = FIRST_SESSION, agent: AgentConfig = maisyAgent) {
    localStorage.setItem(SESSION_KEY, storedSession);
    const service = createFakeChatService();
    service.listConversations.mockResolvedValue({ success: true, data: rows });
    vi.mocked(ChatServiceFactory.createPublicChatService).mockReturnValue(service as any);
    render(
      <ChatMessagesProvider>
        <AgentChatInterface agent={agent} />
      </ChatMessagesProvider>
    );
    await screen.findByText(/Reply in the (first|second) conversation|Hi! I'm MAISY/);
    return service;
  }

  beforeEach(() => {
    vi.mocked(ChatServiceFactory.createPublicChatService).mockReset();
    localStorage.clear();
    localStorage.setItem(SESSION_KEY, FIRST_SESSION);
  });

  it('looks up the title of a restored session once', async () => {
    const { service } = await setup();

    await waitFor(() => expect(titleOf()).toHaveTextContent('First conversation'));
    expect(titleOf()).toHaveAttribute('title', 'First conversation');
    expect(service.listConversations).toHaveBeenCalledTimes(1);
  });

  it('shows the title of the row a conversation was opened from, without another lookup', async () => {
    const { service, user } = await setup();
    await waitFor(() => expect(titleOf()).toHaveTextContent('First conversation'));
    await openList(user);
    const listCalls = service.listConversations.mock.calls.length;

    await user.click(screen.getByRole('button', { name: /^Second conversation/ }));
    await screen.findByText('Reply in the second conversation');

    expect(titleOf()).toHaveTextContent('Second conversation');
    expect(service.listConversations).toHaveBeenCalledTimes(listCalls);
  });

  it('shows the title again when going back to the open conversation from the list', async () => {
    const { user } = await setup();
    await waitFor(() => expect(titleOf()).toHaveTextContent('First conversation'));
    await openList(user);
    expect(titleOf()).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^First conversation/ }));

    expect(titleOf()).toHaveTextContent('First conversation');
  });

  it('falls back to the preview when the conversation has no title', async () => {
    await setupWithList([{ ...conversation(FIRST_SESSION, 'x', '2026-09-27T16:10:00Z'), title: null, previewLine: 'First question' }]);

    await waitFor(() => expect(titleOf()).toHaveTextContent('First question'));
  });

  it('falls back to "New conversation" when it has neither title nor preview', async () => {
    await setupWithList([{ ...conversation(FIRST_SESSION, 'x', '2026-09-27T16:10:00Z'), title: null, previewLine: null }]);

    await waitFor(() => expect(titleOf()).toHaveTextContent('New conversation'));
  });

  it('shows "New conversation" when the restored session is not in the list', async () => {
    await setupWithList([]);

    await waitFor(() => expect(titleOf()).toHaveTextContent('New conversation'));
  });

  it('shows "New conversation" in a new, empty chat, without a lookup', async () => {
    const { service, user } = await setup();
    await waitFor(() => expect(titleOf()).toHaveTextContent('First conversation'));
    const calls = service.listConversations.mock.calls.length;

    await user.click(screen.getByRole('button', { name: 'New chat' }));

    expect(titleOf()).toHaveTextContent('New conversation');
    expect(service.listConversations).toHaveBeenCalledTimes(calls);
  });

  it('looks up a new chat after its first reply completes, not when the first message is sent', async () => {
    const { service, user } = await setup();
    await waitFor(() => expect(titleOf()).toHaveTextContent('First conversation'));
    await user.click(screen.getByRole('button', { name: 'New chat' }));
    const newSession = localStorage.getItem(SESSION_KEY)!;
    const calls = service.listConversations.mock.calls.length;
    // The server has the new conversation by the time its reply is done.
    service.listConversations.mockResolvedValue({
      success: true,
      data: [conversation(newSession, 'Quarterly review planning', '2026-09-28T10:00:00Z')],
    });

    await user.type(screen.getByRole('textbox'), 'Help me plan{Enter}');
    await waitFor(() => expect(service.sendMessage).toHaveBeenCalled());

    // The message is on screen, but the conversation is not listed yet: no lookup, no guessed title.
    expect(service.listConversations).toHaveBeenCalledTimes(calls);

    act(() => {
      service.handlers.token!({
        chatId: newSession, messageId: 'reply-1', type: 'assistant', token: 'Sure.', isComplete: true, channelMessageType: 1,
      });
      service.handlers.state!({ chatId: newSession, state: 'idle' });
    });

    await waitFor(() => expect(titleOf()).toHaveTextContent('Quarterly review planning'));
    expect(service.listConversations).toHaveBeenCalledTimes(calls + 1);
  });

  it('never shows "New conversation" while a restored session loads', async () => {
    const seen: string[] = [];
    const observer = new MutationObserver(() => {
      const text = screen.queryByTestId('maisy-conversation-title')?.textContent;
      if (text) seen.push(text);
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    try {
      await setup();
      await waitFor(() => expect(titleOf()).toHaveTextContent('First conversation'));
    } finally {
      observer.disconnect();
    }

    expect(seen).not.toContain('New conversation');
  });

  it('shows no title for an agent that is not MAISY', async () => {
    await setup(baseAgent);

    expect(titleOf()).not.toBeInTheDocument();
  });

  it('shows no title in preview mode and does not look anything up', async () => {
    const service = createFakeChatService();
    vi.mocked(ChatServiceFactory.createPublicChatService).mockReturnValue(service as any);
    render(
      <ChatMessagesProvider>
        <AgentChatInterface agent={maisyAgent} previewMode />
      </ChatMessagesProvider>
    );

    expect(titleOf()).not.toBeInTheDocument();
    expect(service.listConversations).not.toHaveBeenCalled();
  });
});
