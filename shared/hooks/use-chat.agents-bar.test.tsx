import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useChat } from './use-chat';
import { ChatMessagesProvider } from '../provider/chat-messages-provider';
import { ChatService } from '../services/chat-service';
import type {
  ConversationStateUpdate,
  SubAgentActivityUpdate,
  ToolApprovalRequestUpdate,
  ToolApprovalResolvedUpdate,
  TypingIndicatorUpdate,
} from '../services/signalr-service';

// Task #7920 (Agents bar): useChat tracks which agents took part in the session and which one
// is working right now, from the existing TypingIndicator and SubAgentActivity events.

function createFakeChatService() {
  const handlers: {
    typing?: (update: TypingIndicatorUpdate) => void;
    subAgent?: (update: SubAgentActivityUpdate) => void;
    approvalRequest?: (update: ToolApprovalRequestUpdate) => void;
    state?: (update: ConversationStateUpdate) => void;
    approvalResolved?: (update: ToolApprovalResolvedUpdate) => void;
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
    onToolApprovalRequest: vi.fn((h: (u: ToolApprovalRequestUpdate) => void) => { handlers.approvalRequest = h; return () => {}; }),
    onToolApprovalResolved: vi.fn((h: (u: ToolApprovalResolvedUpdate) => void) => { handlers.approvalResolved = h; return () => {}; }),
    onConversationStopped: vi.fn().mockReturnValue(() => {}),
    clearQueuedStreamingTokens: vi.fn(),
    stopAllAgents: vi.fn().mockResolvedValue({ success: true }),
    onConnectionStatusChange: vi.fn().mockReturnValue(() => {}),
    joinChat: vi.fn().mockResolvedValue(undefined),
    leaveChat: vi.fn().mockResolvedValue(undefined),
    sendTypingIndicator: vi.fn().mockResolvedValue(undefined),
    getAuthHeaders: vi.fn().mockResolvedValue({}),
    sendMessage: vi.fn().mockResolvedValue({ success: true }),
    sendVoiceMessage: vi.fn().mockResolvedValue({ success: true }),
  };
}

function wrapper({ children }: { children: React.ReactNode }) {
  return <ChatMessagesProvider>{children}</ChatMessagesProvider>;
}

async function setup(chatId = 'session-1', mergeSubAgentCards = false) {
  const service = createFakeChatService();
  const hook = renderHook(
    ({ id }: { id: string }) => useChat(service as unknown as ChatService, { chainOfThought: false, chatId: id, mergeSubAgentCards }),
    { wrapper, initialProps: { id: chatId } }
  );
  await waitFor(() => expect(service.onSubAgentActivityUpdate).toHaveBeenCalled());
  return { service, ...hook };
}

const typing = (overrides: Partial<TypingIndicatorUpdate> = {}): TypingIndicatorUpdate => ({
  chatId: 'session-1',
  isTyping: true,
  agentId: 1,
  agentName: 'Main agent',
  chatbotIconUrl: 'https://cdn.example/main.png',
  ...overrides,
});

const approvalRequest = (overrides: Partial<ToolApprovalRequestUpdate> = {}): ToolApprovalRequestUpdate => ({
  chatId: 'session-1',
  sessionId: 'session-1',
  approvalId: 'approval-1',
  toolName: 'Docs server',
  functionName: 'create_doc',
  expiresAtUtc: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  ...overrides,
});

const subAgent = (overrides: Partial<SubAgentActivityUpdate> = {}): SubAgentActivityUpdate => ({
  chatId: 'session-1',
  agentId: 2,
  agentName: 'Helper',
  chatbotIconUrl: 'https://cdn.example/helper.png',
  action: 'Drafting',
  status: 'started',
  ...overrides,
});

describe('useChat — Agents bar state (Task #7920)', () => {
  it('starts with no session agents and no active agent', async () => {
    const { result } = await setup();

    expect(result.current.sessionAgents).toEqual([]);
    expect(result.current.activeAgent).toBeNull();
  });

  it('records a typing agent as a participant and makes it active', async () => {
    const { service, result } = await setup();

    act(() => service.handlers.typing!(typing()));

    expect(result.current.sessionAgents).toEqual([
      { key: 'id:1', agentId: 1, agentName: 'Main agent', chatbotIconUrl: 'https://cdn.example/main.png' },
    ]);
    expect(result.current.activeAgent?.agentName).toBe('Main agent');
  });

  it('keeps the participant but clears the active agent when typing stops', async () => {
    const { service, result } = await setup();

    act(() => service.handlers.typing!(typing()));
    act(() => service.handlers.typing!(typing({ isTyping: false })));

    expect(result.current.sessionAgents).toHaveLength(1);
    expect(result.current.activeAgent).toBeNull();
  });

  it('makes a started sub-agent the active one, after the agent that handed off', async () => {
    const { service, result } = await setup();

    act(() => service.handlers.typing!(typing()));
    act(() => service.handlers.subAgent!(subAgent()));

    expect(result.current.sessionAgents.map(a => a.agentName)).toEqual(['Main agent', 'Helper']);
    expect(result.current.activeAgent?.agentName).toBe('Helper');
  });

  it('hands the active state back when the sub-agent completes', async () => {
    const { service, result } = await setup();

    act(() => service.handlers.typing!(typing()));
    act(() => service.handlers.subAgent!(subAgent()));
    act(() => service.handlers.subAgent!(subAgent({ status: 'completed' })));

    expect(result.current.activeAgent?.agentName).toBe('Main agent');
  });

  // Task 7947: a sub-agent whose run ended leaves the bar (it used to stay, inactive).
  it.each(['completed', 'failed', 'denied', 'expired', 'cancelled'] as const)(
    'removes a sub-agent with status %s from the bar',
    async (status) => {
      const { service, result } = await setup();

      act(() => service.handlers.subAgent!(subAgent()));
      act(() => service.handlers.subAgent!(subAgent({ status })));

      expect(result.current.activeAgent).toBeNull();
      expect(result.current.sessionAgents).toEqual([]);
    }
  );

  // Task 7947: the backend's full order for a hand-off that pauses on a tool approval
  // (RunnableAISyncService sends typing-off and idle after the approval card).
  it('keeps a sub-agent paused on a tool approval in the bar through the run end, until it completes', async () => {
    const { service, result } = await setup();
    const helper = { agentId: 2, agentName: 'Helper' };

    act(() => service.handlers.typing!(typing()));
    act(() => service.handlers.subAgent!(subAgent(helper)));
    act(() => service.handlers.typing!(typing({ isTyping: false })));
    act(() => service.handlers.state!({ chatId: 'session-1', state: 'idle' }));
    expect(result.current.sessionAgents.map(a => a.agentName)).toEqual(['Helper']);

    act(() => service.handlers.typing!(typing(helper)));
    act(() => service.handlers.subAgent!(subAgent({ ...helper, status: 'awaiting_approval' })));
    act(() => service.handlers.approvalRequest!(approvalRequest({ ...helper, approvalId: 'approval-2' })));
    act(() => service.handlers.typing!(typing({ ...helper, isTyping: false })));
    act(() => service.handlers.state!({ chatId: 'session-1', state: 'idle' }));

    // Still in the bar, not working.
    expect(result.current.sessionAgents.map(a => a.agentName)).toEqual(['Helper']);
    expect(result.current.activeAgent).toBeNull();

    act(() => service.handlers.approvalResolved!({ chatId: 'session-1', approvalId: 'approval-2', decision: 'AllowOnce' }));
    expect(result.current.sessionAgents.map(a => a.agentName)).toEqual(['Helper']);

    act(() => service.handlers.subAgent!(subAgent({ ...helper, status: 'resumed' })));
    expect(result.current.sessionAgents.map(a => a.agentName)).toEqual(['Helper']);
    expect(result.current.activeAgent?.agentName).toBe('Helper');

    act(() => service.handlers.subAgent!(subAgent({ ...helper, status: 'completed' })));
    expect(result.current.sessionAgents).toEqual([]);
  });

  it('keeps a paused sub-agent in its place among the others when it resumes', async () => {
    const { service, result } = await setup();

    act(() => service.handlers.subAgent!(subAgent({ agentId: 2, agentName: 'Kit' })));
    act(() => service.handlers.subAgent!(subAgent({ agentId: 3, agentName: 'Writer' })));
    act(() => service.handlers.subAgent!(subAgent({ agentId: 2, agentName: 'Kit', status: 'awaiting_approval' })));
    act(() => service.handlers.state!({ chatId: 'session-1', state: 'idle' }));
    expect(result.current.sessionAgents.map(a => a.agentName)).toEqual(['Kit', 'Writer']);

    act(() => service.handlers.subAgent!(subAgent({ agentId: 2, agentName: 'Kit', status: 'resumed' })));

    expect(result.current.sessionAgents.map(a => a.agentName)).toEqual(['Kit', 'Writer']);
    expect(result.current.activeAgent?.agentName).toBe('Kit');
  });

  it('keeps the root agent in the bar while its own turn waits for a tool approval', async () => {
    const { service, result } = await setup();

    act(() => service.handlers.typing!(typing()));
    act(() => service.handlers.approvalRequest!(approvalRequest({ agentId: 1, agentName: 'Main agent' })));
    act(() => service.handlers.typing!(typing({ isTyping: false })));
    act(() => service.handlers.state!({ chatId: 'session-1', state: 'idle' }));

    expect(result.current.sessionAgents.map(a => a.agentName)).toEqual(['Main agent']);
    expect(result.current.activeAgent).toBeNull();

    // Answered: the turn resumes and ends as usual.
    act(() => service.handlers.approvalResolved!({ chatId: 'session-1', approvalId: 'approval-1', decision: 'AllowOnce' }));
    act(() => service.handlers.typing!(typing()));
    expect(result.current.activeAgent?.agentName).toBe('Main agent');
    act(() => service.handlers.typing!(typing({ isTyping: false })));
    act(() => service.handlers.state!({ chatId: 'session-1', state: 'idle' }));

    expect(result.current.sessionAgents).toEqual([]);
  });

  // An expiry starts no turn: for the root agent no idle follows, so it leaves right away.
  it('removes a paused root agent as soon as its approval expires', async () => {
    const { service, result } = await setup();

    act(() => service.handlers.typing!(typing()));
    act(() => service.handlers.approvalRequest!(approvalRequest({ agentId: 1, agentName: 'Main agent' })));
    act(() => service.handlers.typing!(typing({ isTyping: false })));
    act(() => service.handlers.state!({ chatId: 'session-1', state: 'idle' }));
    expect(result.current.sessionAgents).toHaveLength(1);

    act(() => service.handlers.approvalResolved!({ chatId: 'session-1', approvalId: 'approval-1', decision: 'Expired' }));

    expect(result.current.sessionAgents).toEqual([]);
  });

  it('keeps a paused agent that answered its approval until its next run end', async () => {
    const { service, result } = await setup();

    act(() => service.handlers.typing!(typing()));
    act(() => service.handlers.approvalRequest!(approvalRequest({ agentId: 1, agentName: 'Main agent' })));
    act(() => service.handlers.state!({ chatId: 'session-1', state: 'idle' }));
    act(() => service.handlers.approvalResolved!({ chatId: 'session-1', approvalId: 'approval-1', decision: 'Deny' }));

    expect(result.current.sessionAgents.map(a => a.agentName)).toEqual(['Main agent']);
  });

  it('does not hold the agent again on a repeated request for an approval already answered', async () => {
    const { service, result } = await setup();

    act(() => service.handlers.typing!(typing()));
    act(() => service.handlers.approvalRequest!(approvalRequest({ agentId: 1, agentName: 'Main agent' })));
    act(() => service.handlers.approvalResolved!({ chatId: 'session-1', approvalId: 'approval-1', decision: 'AllowOnce' }));
    // The same approval arrives again (e.g. its persisted copy) after the answer.
    act(() => service.handlers.approvalRequest!(approvalRequest({ agentId: 1, agentName: 'Main agent' })));
    act(() => service.handlers.state!({ chatId: 'session-1', state: 'idle' }));

    expect(result.current.sessionAgents).toEqual([]);
  });

  it('Stop empties the bar, paused agents included', async () => {
    const { service, result } = await setup();

    act(() => service.handlers.subAgent!(subAgent()));
    act(() => service.handlers.subAgent!(subAgent({ status: 'awaiting_approval' })));
    act(() => result.current.clearActiveAgents());

    expect(result.current.sessionAgents).toEqual([]);
  });

  it('treats a resumed sub-agent as working again', async () => {
    const { service, result } = await setup();

    act(() => service.handlers.subAgent!(subAgent()));
    act(() => service.handlers.subAgent!(subAgent({ status: 'awaiting_approval' })));
    act(() => service.handlers.subAgent!(subAgent({ status: 'resumed' })));

    expect(result.current.activeAgent?.agentName).toBe('Helper');
  });

  it('merges typing and sub-agent events for the same agent into one participant', async () => {
    const { service, result } = await setup();

    act(() => service.handlers.subAgent!(subAgent({ chatbotIconUrl: undefined })));
    act(() => service.handlers.typing!(typing({ agentId: 2, agentName: 'Helper', chatbotIconUrl: 'https://cdn.example/helper.png' })));

    expect(result.current.sessionAgents).toEqual([
      { key: 'id:2', agentId: 2, agentName: 'Helper', chatbotIconUrl: 'https://cdn.example/helper.png' },
    ]);
  });

  it('ignores events from another session', async () => {
    const { service, result } = await setup();

    act(() => service.handlers.typing!(typing({ chatId: 'other-session' })));
    act(() => service.handlers.subAgent!(subAgent({ chatId: 'other-session' })));

    expect(result.current.sessionAgents).toEqual([]);
    expect(result.current.activeAgent).toBeNull();
  });

  it('clearActiveAgents ends every working state and empties the bar (Task 7947)', async () => {
    const { service, result } = await setup();

    act(() => service.handlers.typing!(typing()));
    act(() => service.handlers.subAgent!(subAgent()));
    act(() => result.current.clearActiveAgents());

    expect(result.current.activeAgent).toBeNull();
    expect(result.current.isAgentTyping).toBe(false);
    expect(result.current.sessionAgents).toEqual([]);
  });

  it('clearActiveAgents keeps the same function identity across renders', async () => {
    const { service, result } = await setup();
    const first = result.current.clearActiveAgents;

    act(() => service.handlers.typing!(typing()));

    expect(result.current.clearActiveAgents).toBe(first);
  });

  it('resets the participants when the session changes', async () => {
    const { service, result, rerender } = await setup();

    act(() => service.handlers.typing!(typing()));
    rerender({ id: 'session-2' });

    expect(result.current.sessionAgents).toEqual([]);
    expect(result.current.activeAgent).toBeNull();
  });
});

// Typing events may carry only the agent's name while its sub-agent events carry its id.
describe('useChat — one participant per agent across name-only and id events (Task #7920)', () => {
  it('moves a name-only typing agent to its id when a sub-agent event with that id arrives', async () => {
    const { service, result } = await setup();

    act(() => service.handlers.typing!(typing({ agentId: undefined, agentName: 'Helper' })));
    expect(result.current.sessionAgents.map(a => a.key)).toEqual(['Helper']);
    expect(result.current.activeAgent?.key).toBe('Helper');

    act(() => service.handlers.subAgent!(subAgent({ agentId: 2, agentName: 'Helper' })));

    expect(result.current.sessionAgents).toHaveLength(1);
    expect(result.current.sessionAgents[0]).toMatchObject({ key: 'id:2', agentId: 2, agentName: 'Helper' });
    expect(result.current.activeAgent?.key).toBe('id:2');
  });

  it('keeps the participation order and moves the typing state with it', async () => {
    const { service, result } = await setup();

    act(() => service.handlers.typing!(typing({ agentId: undefined, agentName: 'Helper' })));
    act(() => service.handlers.typing!(typing({ agentId: 1, agentName: 'Main agent' })));
    act(() => service.handlers.subAgent!(subAgent({ agentId: 2, agentName: 'Helper', status: 'completed' })));

    expect(result.current.sessionAgents.map(a => a.key)).toEqual(['id:2', 'id:1']);
    expect(result.current.typingAgents).toHaveLength(2);
    expect(result.current.activeAgent?.key).toBe('id:1');

    // A later name-only typing-off for the same agent lands on the id entry.
    act(() => service.handlers.typing!(typing({ agentId: 1, agentName: 'Main agent', isTyping: false })));
    expect(result.current.activeAgent?.key).toBe('id:2');
    // Task 7947: Helper's run had already completed, so it leaves once it stops typing; Main agent
    // only stopped typing and stays, inactive.
    act(() => service.handlers.typing!(typing({ agentId: undefined, agentName: 'Helper', isTyping: false })));
    expect(result.current.activeAgent).toBeNull();
    expect(result.current.sessionAgents.map(a => a.key)).toEqual(['id:1']);
  });

  it('keeps two agents with the same name but different ids apart', async () => {
    const { service, result } = await setup();

    act(() => service.handlers.subAgent!(subAgent({ agentId: 2, agentName: 'Helper' })));
    act(() => service.handlers.subAgent!(subAgent({ agentId: 3, agentName: 'Helper' })));

    expect(result.current.sessionAgents.map(a => a.key)).toEqual(['id:2', 'id:3']);
    expect(result.current.activeAgent?.key).toBe('id:3');
  });
});

// Task 7947: an agent's avatar leaves the bar as soon as that agent is done.
describe('useChat — Agents bar removes finished agents (Task 7947)', () => {
  const idle = (service: ReturnType<typeof createFakeChatService>) =>
    act(() => service.handlers.state!({ chatId: 'session-1', state: 'idle' }));
  const names = (agents: { agentName?: string }[]) => agents.map(a => a.agentName);

  // The backend's order for a hand-off: the root agent types and hands off (sub-agent started),
  // its turn ends (typing-off, idle), then the sub-agent's own run types, ends (typing-off, idle)
  // and is reported completed.
  it('MAISY -> Kit: MAISY leaves when its turn ends, Kit when it completes, then the bar is empty', async () => {
    const { service, result } = await setup();
    const maisy = { agentId: 1, agentName: 'MAISY' };
    const kit = { agentId: 2, agentName: 'Kit' };

    act(() => service.handlers.typing!(typing(maisy)));
    act(() => service.handlers.subAgent!(subAgent(kit)));
    expect(names(result.current.sessionAgents)).toEqual(['MAISY', 'Kit']);
    expect(result.current.activeAgent?.agentName).toBe('Kit');

    // A bare typing-off only makes MAISY inactive: no flicker during the hand-off.
    act(() => service.handlers.typing!(typing({ ...maisy, isTyping: false })));
    expect(names(result.current.sessionAgents)).toEqual(['MAISY', 'Kit']);

    // MAISY's run is over: MAISY goes, Kit (still running) stays.
    idle(service);
    expect(names(result.current.sessionAgents)).toEqual(['Kit']);
    expect(result.current.activeAgent?.agentName).toBe('Kit');

    act(() => service.handlers.typing!(typing(kit)));
    act(() => service.handlers.typing!(typing({ ...kit, isTyping: false })));
    idle(service);
    expect(names(result.current.sessionAgents)).toEqual(['Kit']);

    act(() => service.handlers.subAgent!(subAgent({ ...kit, status: 'completed' })));
    expect(result.current.sessionAgents).toEqual([]);
    expect(result.current.activeAgent).toBeNull();
  });

  it('MAISY -> Kit, when MAISY keeps working after the hand-off: Kit leaves on completion, MAISY when the run ends', async () => {
    const { service, result } = await setup();
    const maisy = { agentId: 1, agentName: 'MAISY' };
    const kit = { agentId: 2, agentName: 'Kit' };

    act(() => service.handlers.typing!(typing(maisy)));
    act(() => service.handlers.subAgent!(subAgent(kit)));
    act(() => service.handlers.subAgent!(subAgent({ ...kit, status: 'completed' })));
    expect(names(result.current.sessionAgents)).toEqual(['MAISY']);
    expect(result.current.activeAgent?.agentName).toBe('MAISY');

    act(() => service.handlers.typing!(typing({ ...maisy, isTyping: false })));
    expect(names(result.current.sessionAgents)).toEqual(['MAISY']);

    idle(service);
    expect(result.current.sessionAgents).toEqual([]);
  });

  it('keeps an agent that is still typing when the run ends, and removes it at its typing-off', async () => {
    const { service, result } = await setup();

    act(() => service.handlers.typing!(typing()));
    idle(service);
    expect(names(result.current.sessionAgents)).toEqual(['Main agent']);

    act(() => service.handlers.typing!(typing({ isTyping: false })));
    expect(result.current.sessionAgents).toEqual([]);
  });

  it('removes every agent that is not working when the run fails', async () => {
    const { service, result } = await setup();

    act(() => service.handlers.typing!(typing()));
    act(() => service.handlers.typing!(typing({ isTyping: false })));
    act(() => service.handlers.state!({ chatId: 'session-1', state: 'error' }));

    expect(result.current.sessionAgents).toEqual([]);
  });

  it('keeps the order of the agents still present when one leaves', async () => {
    const { service, result } = await setup();

    act(() => service.handlers.typing!(typing()));
    act(() => service.handlers.subAgent!(subAgent({ agentId: 2, agentName: 'Kit' })));
    act(() => service.handlers.subAgent!(subAgent({ agentId: 3, agentName: 'Writer' })));
    act(() => service.handlers.subAgent!(subAgent({ agentId: 2, agentName: 'Kit', status: 'failed' })));

    expect(names(result.current.sessionAgents)).toEqual(['Main agent', 'Writer']);
    expect(result.current.activeAgent?.agentName).toBe('Writer');
  });

  it('a new run after everything is gone shows only the agents now working', async () => {
    const { service, result } = await setup();

    act(() => service.handlers.typing!(typing()));
    act(() => service.handlers.subAgent!(subAgent({ agentId: 2, agentName: 'Kit' })));
    act(() => service.handlers.typing!(typing({ isTyping: false })));
    idle(service);
    act(() => service.handlers.subAgent!(subAgent({ agentId: 2, agentName: 'Kit', status: 'completed' })));
    expect(result.current.sessionAgents).toEqual([]);

    act(() => service.handlers.subAgent!(subAgent({ agentId: 3, agentName: 'Writer' })));

    expect(names(result.current.sessionAgents)).toEqual(['Writer']);
    expect(result.current.activeAgent?.agentName).toBe('Writer');
  });

  it('a returning agent joins at the end instead of jumping back to its old place', async () => {
    const { service, result } = await setup();

    act(() => service.handlers.typing!(typing()));
    act(() => service.handlers.subAgent!(subAgent({ agentId: 2, agentName: 'Kit' })));
    act(() => service.handlers.typing!(typing({ isTyping: false })));
    idle(service);
    expect(names(result.current.sessionAgents)).toEqual(['Kit']);

    act(() => service.handlers.typing!(typing()));

    expect(names(result.current.sessionAgents)).toEqual(['Kit', 'Main agent']);
    expect(result.current.activeAgent?.agentName).toBe('Main agent');
  });

  it('removes a finished agent first seen by name only, once its id is known (re-keying)', async () => {
    const { service, result } = await setup();

    act(() => service.handlers.typing!(typing({ agentId: undefined, agentName: 'Kit' })));
    act(() => service.handlers.typing!(typing({ agentId: undefined, agentName: 'Kit', isTyping: false })));
    idle(service);
    expect(result.current.sessionAgents).toEqual([]);

    act(() => service.handlers.typing!(typing({ agentId: undefined, agentName: 'Kit' })));
    act(() => service.handlers.subAgent!(subAgent({ agentId: 2, agentName: 'Kit' })));
    act(() => service.handlers.subAgent!(subAgent({ agentId: 2, agentName: 'Kit', status: 'completed' })));
    expect(result.current.sessionAgents.map(a => a.key)).toEqual(['id:2']);

    act(() => service.handlers.typing!(typing({ agentId: undefined, agentName: 'Kit', isTyping: false })));
    expect(result.current.sessionAgents).toEqual([]);
  });
});

// Task 7947: several SignalR messages can arrive in one frame and be handled in one React batch.
// The run end must see the agents those earlier messages added or re-keyed.
describe('useChat — Agents bar run end within one batch (Task 7947)', () => {
  it('empties the bar when typing-on, typing-off and idle arrive together in a fresh chat', async () => {
    const { service, result } = await setup();

    act(() => {
      service.handlers.typing!(typing());
      service.handlers.typing!(typing({ isTyping: false }));
      service.handlers.state!({ chatId: 'session-1', state: 'idle' });
    });

    expect(result.current.sessionAgents).toEqual([]);
  });

  it('removes the id key when a name-only typing, an id event and idle arrive together', async () => {
    const { service, result } = await setup();

    act(() => {
      service.handlers.typing!(typing({ agentId: undefined, agentName: 'Kit' }));
      service.handlers.typing!(typing({ agentId: 2, agentName: 'Kit', isTyping: false }));
      service.handlers.state!({ chatId: 'session-1', state: 'idle' });
    });

    expect(result.current.sessionAgents).toEqual([]);
  });

  it('empties the bar when typing-on, typing-off and error arrive together', async () => {
    const { service, result } = await setup();

    act(() => {
      service.handlers.typing!(typing());
      service.handlers.typing!(typing({ isTyping: false }));
      service.handlers.state!({ chatId: 'session-1', state: 'error' });
    });

    expect(result.current.sessionAgents).toEqual([]);
  });

  it('keeps an agent that is still typing when typing-on and idle arrive together, until its typing-off', async () => {
    const { service, result } = await setup();

    act(() => {
      service.handlers.typing!(typing());
      service.handlers.state!({ chatId: 'session-1', state: 'idle' });
    });
    expect(result.current.sessionAgents.map(a => a.agentName)).toEqual(['Main agent']);

    act(() => service.handlers.typing!(typing({ isTyping: false })));
    expect(result.current.sessionAgents).toEqual([]);
  });
});

// Task 7947 (PR thread 98066): an agent that finished and starts again rejoins at the end, also
// within one batch; an agent still visible when it starts again keeps its place.
describe('useChat — Agents bar position when an agent starts again (Task 7947)', () => {
  const names = (agents: { agentName?: string }[]) => agents.map(a => a.agentName);

  it('rejoins at the end when it finishes and starts again in one batch, like across batches', async () => {
    const { service, result } = await setup();

    act(() => service.handlers.subAgent!(subAgent({ agentId: 2, agentName: 'Kit' })));
    act(() => service.handlers.subAgent!(subAgent({ agentId: 3, agentName: 'Writer' })));
    act(() => {
      service.handlers.subAgent!(subAgent({ agentId: 2, agentName: 'Kit', status: 'completed' }));
      service.handlers.subAgent!(subAgent({ agentId: 2, agentName: 'Kit', status: 'started' }));
    });

    expect(names(result.current.sessionAgents)).toEqual(['Writer', 'Kit']);
    expect(result.current.activeAgent?.agentName).toBe('Kit');
  });

  it('rejoins at the end across batches too', async () => {
    const { service, result } = await setup();

    act(() => service.handlers.subAgent!(subAgent({ agentId: 2, agentName: 'Kit' })));
    act(() => service.handlers.subAgent!(subAgent({ agentId: 3, agentName: 'Writer' })));
    act(() => service.handlers.subAgent!(subAgent({ agentId: 2, agentName: 'Kit', status: 'completed' })));
    act(() => service.handlers.subAgent!(subAgent({ agentId: 2, agentName: 'Kit', status: 'started' })));

    expect(names(result.current.sessionAgents)).toEqual(['Writer', 'Kit']);
  });

  it('keeps its place when it was marked done while still typing and then types again', async () => {
    const { service, result } = await setup();

    act(() => service.handlers.typing!(typing()));
    act(() => service.handlers.subAgent!(subAgent({ agentId: 2, agentName: 'Kit' })));
    act(() => {
      // The run ends while Main agent is still typing: done, but still shown.
      service.handlers.state!({ chatId: 'session-1', state: 'idle' });
      service.handlers.typing!(typing());
    });

    expect(names(result.current.sessionAgents)).toEqual(['Main agent', 'Kit']);
    expect(result.current.activeAgent?.agentName).toBe('Main agent');

    // No longer done: a typing-off only makes it inactive again.
    act(() => service.handlers.typing!(typing({ isTyping: false })));
    expect(names(result.current.sessionAgents)).toEqual(['Main agent', 'Kit']);
  });

  it('keeps its place when a held agent resumes in the same batch as the run end', async () => {
    const { service, result } = await setup();

    act(() => service.handlers.subAgent!(subAgent({ agentId: 2, agentName: 'Kit' })));
    act(() => service.handlers.subAgent!(subAgent({ agentId: 3, agentName: 'Writer' })));
    act(() => {
      service.handlers.subAgent!(subAgent({ agentId: 2, agentName: 'Kit', status: 'awaiting_approval' }));
      service.handlers.state!({ chatId: 'session-1', state: 'idle' });
      service.handlers.subAgent!(subAgent({ agentId: 2, agentName: 'Kit', status: 'resumed' }));
    });

    expect(names(result.current.sessionAgents)).toEqual(['Kit', 'Writer']);
    expect(result.current.activeAgent?.agentName).toBe('Kit');
  });
});

describe('useChat — restoring agents that kept working (US 7506)', () => {
  it('shows the agents as working again in the current session', async () => {
    const { result } = await setup('session-1');

    act(() => result.current.restoreWorkingAgents('session-1', [{ agentId: 1, agentName: 'Main agent' }]));

    expect(result.current.isWorking).toBe(true);
    expect(result.current.typingAgents.map(agent => agent.agentName)).toEqual(['Main agent']);
    expect(result.current.activeAgent?.agentName).toBe('Main agent');
  });

  it('ends when the agent stops typing', async () => {
    const { service, result } = await setup('session-1');
    act(() => result.current.restoreWorkingAgents('session-1', [{ agentId: 1, agentName: 'Main agent' }]));

    act(() => service.handlers.typing!(typing({ isTyping: false })));

    expect(result.current.isWorking).toBe(false);
  });

  it('ignores a restore that a newer live event of the session has overtaken', async () => {
    const { service, result } = await setup('session-1');
    const token = result.current.getLiveEventToken('session-1');

    // The working-state lookup is in flight when the turn ends.
    act(() => service.handlers.typing!(typing({ isTyping: false })));
    act(() => result.current.restoreWorkingAgents('session-1', [{ agentId: 1, agentName: 'Main agent' }], token));

    expect(result.current.isWorking).toBe(false);
    expect(result.current.typingAgents).toEqual([]);
  });

  it('still restores when only another session had live events meanwhile', async () => {
    const { service, result } = await setup('session-1');
    const token = result.current.getLiveEventToken('session-1');

    act(() => service.handlers.state!({ chatId: 'session-9', state: 'idle' }));
    act(() => result.current.restoreWorkingAgents('session-1', [{ agentId: 1, agentName: 'Main agent' }], token));

    expect(result.current.getLiveEventToken('session-9')).toBe(1);
    expect(result.current.isWorking).toBe(true);
  });

  it('ignores a restore for a session that is no longer the current one', async () => {
    const { result, rerender } = await setup('session-1');
    rerender({ id: 'session-2' });

    act(() => result.current.restoreWorkingAgents('session-1', [{ agentId: 1, agentName: 'Main agent' }]));

    expect(result.current.isWorking).toBe(false);
    expect(result.current.sessionAgents).toEqual([]);
  });
});

describe('useChat — activeStatus and sub-agent cards (US 8159)', () => {
  const cards = (result: { current: { messages: Array<{ id: string; subAgentActivity?: { status: string } }> } }) =>
    result.current.messages.filter(m => m.subAgentActivity);

  it('is null when nobody is working', async () => {
    const { result } = await setup('session-1', true);
    expect(result.current.activeStatus).toBeNull();
  });

  it('is thinking while the agent types', async () => {
    const { service, result } = await setup('session-1', true);

    act(() => service.handlers.typing!(typing()));

    expect(result.current.activeStatus).toMatchObject({ kind: 'thinking', agent: { agentName: 'Main agent' } });
  });

  it('shows the running sub-agent action, which wins over typing', async () => {
    const { service, result } = await setup('session-1', true);

    act(() => service.handlers.typing!(typing({ agentId: 2, agentName: 'Helper' })));
    act(() => service.handlers.subAgent!(subAgent({ action: 'image-edit-requested' })));

    expect(result.current.activeStatus).toMatchObject({ kind: 'running', action: 'image-edit-requested', agent: { agentName: 'Helper' } });
  });

  it('is waiting for approval while the sub-agent is paused, and running again once resumed', async () => {
    const { service, result } = await setup('session-1', true);

    act(() => service.handlers.subAgent!(subAgent()));
    act(() => service.handlers.subAgent!(subAgent({ status: 'awaiting_approval' })));
    expect(result.current.activeStatus).toMatchObject({ kind: 'awaiting_approval', agent: { agentName: 'Helper' } });

    act(() => service.handlers.subAgent!(subAgent({ status: 'resumed' })));
    expect(result.current.activeStatus).toMatchObject({ kind: 'running', action: 'Drafting' });
  });

  it('is null again after the sub-agent completes', async () => {
    const { service, result } = await setup('session-1', true);

    act(() => service.handlers.subAgent!(subAgent()));
    act(() => service.handlers.subAgent!(subAgent({ status: 'completed' })));

    expect(result.current.activeStatus).toBeNull();
  });

  it('is null after Stop', async () => {
    const { service, result } = await setup('session-1', true);

    act(() => service.handlers.subAgent!(subAgent()));
    await act(async () => { await result.current.stopAllAgents(); });

    expect(result.current.activeStatus).toBeNull();
  });

  it('merges every update of a run into one card', async () => {
    const { service, result } = await setup('session-1', true);

    act(() => service.handlers.subAgent!(subAgent()));
    act(() => service.handlers.subAgent!(subAgent({ status: 'awaiting_approval' })));
    act(() => service.handlers.subAgent!(subAgent({ status: 'resumed' })));
    act(() => service.handlers.subAgent!(subAgent({ status: 'failed', errorCode: 'WKFLOAI1101' })));

    expect(cards(result)).toHaveLength(1);
    expect(cards(result)[0].subAgentActivity?.status).toBe('failed');
    expect((cards(result)[0].subAgentActivity as { errorCode?: string }).errorCode).toBe('WKFLOAI1101');
  });

  it('adds one card per update when merging is off (Chat Widget)', async () => {
    const { service, result } = await setup('session-1', false);

    act(() => service.handlers.subAgent!(subAgent()));
    act(() => service.handlers.subAgent!(subAgent({ status: 'completed' })));

    expect(cards(result).map(m => m.subAgentActivity?.status)).toEqual(['started', 'completed']);
  });

  it('merges runs with and without an orchestrationInstanceId, each on its own', async () => {
    const { service, result } = await setup('session-1', true);

    act(() => service.handlers.subAgent!(subAgent()));
    act(() => service.handlers.subAgent!(subAgent({ orchestrationInstanceId: 'orch-1' })));
    act(() => service.handlers.subAgent!(subAgent({ status: 'completed' })));
    act(() => service.handlers.subAgent!(subAgent({ orchestrationInstanceId: 'orch-1', status: 'completed' })));

    expect(cards(result).map(m => m.subAgentActivity?.status)).toEqual(['completed', 'completed']);
  });

  it('gives two orchestration instances of the same agent and action two cards', async () => {
    const { service, result } = await setup('session-1', true);

    act(() => service.handlers.subAgent!(subAgent({ orchestrationInstanceId: 'orch-1' })));
    act(() => service.handlers.subAgent!(subAgent({ orchestrationInstanceId: 'orch-2' })));
    act(() => service.handlers.subAgent!(subAgent({ orchestrationInstanceId: 'orch-1', status: 'completed' })));

    expect(cards(result)).toHaveLength(2);
  });

  it('starts a new card after a message is sent', async () => {
    const { service, result } = await setup('session-1', true);

    act(() => service.handlers.subAgent!(subAgent()));
    await act(async () => { await result.current.sendMessage('Next', 'session-1'); });
    act(() => service.handlers.subAgent!(subAgent()));

    expect(cards(result)).toHaveLength(2);
  });

  it('starts a new card after the run ends', async () => {
    const { service, result } = await setup('session-1', true);

    act(() => service.handlers.subAgent!(subAgent()));
    act(() => service.handlers.state!({ chatId: 'session-1', state: 'idle' }));
    act(() => service.handlers.subAgent!(subAgent()));

    expect(cards(result)).toHaveLength(2);
  });

  it('gives the next run of the same action a new card', async () => {
    const { service, result } = await setup('session-1', true);

    act(() => service.handlers.subAgent!(subAgent()));
    act(() => service.handlers.subAgent!(subAgent({ status: 'failed' })));
    act(() => service.handlers.subAgent!(subAgent()));

    expect(cards(result)).toHaveLength(2);
  });

  it('keeps runs of different actions apart', async () => {
    const { service, result } = await setup('session-1', true);

    act(() => service.handlers.subAgent!(subAgent({ action: 'Drafting' })));
    act(() => service.handlers.subAgent!(subAgent({ action: 'Reviewing' })));

    expect(cards(result)).toHaveLength(2);
  });
});

describe('useChat — merged cards across batches and key upgrades (US 8159)', () => {
  const cards = (result: { current: { messages: Array<{ id: string; subAgentActivity?: { status: string } }> } }) =>
    result.current.messages.filter(m => m.subAgentActivity);

  it('keeps a paused run on one card when awaiting_approval and idle arrive in the same batch', async () => {
    const { service, result } = await setup('session-1', true);

    act(() => service.handlers.subAgent!(subAgent()));
    act(() => {
      service.handlers.subAgent!(subAgent({ status: 'awaiting_approval' }));
      service.handlers.state!({ chatId: 'session-1', state: 'idle' });
    });
    act(() => service.handlers.subAgent!(subAgent({ status: 'resumed' })));
    act(() => service.handlers.subAgent!(subAgent({ status: 'completed' })));

    expect(cards(result)).toHaveLength(1);
    expect(cards(result)[0].subAgentActivity?.status).toBe('completed');
  });

  it('keeps one card when an agent is first reported by name and later with its id', async () => {
    const { service, result } = await setup('session-1', true);
    const byName = (status: SubAgentActivityUpdate['status']) =>
      subAgent({ agentId: undefined as unknown as number, status });

    act(() => service.handlers.subAgent!(byName('started')));
    act(() => service.handlers.subAgent!(subAgent({ status: 'resumed' })));
    expect(result.current.activeStatus).toMatchObject({ kind: 'running', action: 'Drafting', agent: { agentId: 2 } });
    act(() => service.handlers.subAgent!(subAgent({ status: 'completed' })));

    expect(cards(result)).toHaveLength(1);
    expect(cards(result)[0].subAgentActivity?.status).toBe('completed');
    expect(result.current.activeStatus).toBeNull();
  });
});
