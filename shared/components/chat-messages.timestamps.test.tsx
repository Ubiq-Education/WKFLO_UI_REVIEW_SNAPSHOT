import React from 'react';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { ChatMessages } from './chat-messages';
import { ChatMessage } from '../services/chat-service';
import { AgentConfig } from './agent-chat-interface';
import { MessageTimestamp } from './message-timestamp';
import * as formatDateTime from '../utils/format-date-time';

// US 7974: every bubble and card shows when it was sent, in the tenant's time zone and date/time
// formats (agent.displaySettings, from the chat configuration) - never the viewer's browser.

// Australia/Sydney is UTC+11 (AEDT) in late October: 08:30 UTC is 7:30 PM there.
const SENT_AT = '2026-10-21T08:30:00Z';
const SENT_AT_TODAY = '7:30 PM';
const SENT_AT_EARLIER_DAY = '21 Oct, 2026 7:30 PM';

const agent: AgentConfig = {
  tenantGuid: 'tenant-guid',
  agentName: 'Host Agent',
  primaryColor: '#000000',
  bubbleStyle: 'rounded',
  showDescription: false,
  chainOfThought: true,
  apiEndpoint: 'https://api.example.com',
  isVoiceChatEnabled: false,
  displaySettings: { timeZone: 'Australia/Sydney', timeFormat: '12h', dateFormat: 'dd MMM, yyyy' },
};

function buildMessage(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id: 'msg-1',
    type: 'assistant',
    content: 'Hello from the agent',
    timestamp: new Date(SENT_AT),
    channelMessageType: 1,
    ...overrides,
  };
}

function renderMessages(
  messages: ChatMessage[],
  options: { agent?: AgentConfig; typingIndicators?: Array<{ agentId?: number; agentName?: string }>; predefinedPrompts?: Array<{ title: string; prompt: string }> } = {}
) {
  return render(
    <ChatMessages
      messages={messages}
      agent={options.agent ?? agent}
      isLoading={false}
      typingIndicators={options.typingIndicators ?? []}
      authError={null}
      messagesContainerRef={{ current: null }}
      isAuthenticated={true}
      predefinedPrompts={options.predefinedPrompts}
      onSubmitContactForm={async () => {}}
      onSkipContactForm={() => {}}
      onAddTextSuggestionToTop={() => null}
      onAddTextSuggestionToBottom={() => null}
      onReplaceAllWithTextSuggestion={() => null}
      onKeepTextSuggestion={() => {}}
      onUndoTextSuggestion={() => {}}
    />
  );
}

const ENTRIES: Array<[string, Partial<ChatMessage>]> = [
  ['a user bubble', { id: 'user-1', type: 'user', content: 'A question' }],
  ['an assistant bubble', { id: 'reply-1', content: 'An answer' }],
  ['the welcome message', { id: '1', content: 'Hi! How can I help?' }],
  ['a thinking bubble', { id: 'thinking-1', channelMessageType: 2, content: 'Working it out' }],
  ['a metadata system bubble', { id: 'metadata-1', type: 'system', channelMessageType: 3, content: 'Looked something up' }],
  ['a renderAsSystem bubble', { id: 'image-1', type: 'user', content: 'Generated image', metadata: { renderAsSystem: true } }],
  ['a sub-agent activity card', {
    id: 'activity-1', type: 'tool', content: '',
    subAgentActivity: { chatId: 'chat-1', agentId: 7, agentName: 'Research Agent', action: 'Looking up data', status: 'started' },
  }],
  ['a tool approval card', {
    id: 'approval-1', type: 'system', content: '', channelMessageType: 4,
    toolApproval: {
      chatId: 'chat-1', sessionId: 'chat-1', approvalId: 'approval-1', toolName: 'Calendar', functionName: 'create_event',
      expiresAtUtc: '2026-10-21T08:40:00Z', status: 'Pending',
    },
  }],
  ['a contact form card', {
    id: 'contact-1', type: 'system', content: '',
    contactForm: {
      chatId: 'chat-1', message: 'A question', mandatory: false, firstNameRequired: true, lastNameRequired: false,
      emailRequired: true, submitButtonText: 'Send', successMessageEnabled: false, successMessageText: '',
    },
  }],
  ['a text suggestion card', {
    id: 'suggestion-1', type: 'system', content: '', channelMessageType: 4,
    textSuggestion: { featureId: 42, suggestedText: 'This is the suggested copy.' },
  }],
  ['an MCP OAuth reconnect card', {
    id: 'reconnect-1', type: 'system', content: '', channelMessageType: 4,
    mcpOAuthReconnect: { toolName: 'Design tool', startPath: '/ai/api/v1/mcp/oauth/start', message: 'Please reconnect.' },
  }],
  ['the stopped divider', { id: 'stopped-1', type: 'system', content: '', channelMessageType: 3, stoppedMarker: { stoppedAt: SENT_AT } }],
  ['a chat error entry', {
    id: 'error-1', content: 'The assistant took too long to reply. Please try again.', channelMessageType: 3,
    chatError: { code: 'WKFLOAI1102', severity: 'error', isTerminal: true },
  }],
];

describe('ChatMessages — tenant-local timestamps (US 7974)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it.each(ENTRIES)('shows only the time on %s from today in the tenant zone', (_label, overrides) => {
    vi.setSystemTime(new Date('2026-10-21T12:00:00Z')); // 11 PM the same day in Sydney

    renderMessages([buildMessage(overrides)]);

    const timestamp = screen.getByTestId('chat-message-timestamp');
    expect(timestamp.textContent).toBe(SENT_AT_TODAY);
    expect(timestamp.tagName).toBe('TIME');
    expect(timestamp.getAttribute('datetime')).toBe('2026-10-21T08:30:00.000Z');
  });

  it.each(ENTRIES)('shows date and time on %s from an earlier day', (_label, overrides) => {
    vi.setSystemTime(new Date('2026-11-05T12:00:00Z'));

    renderMessages([buildMessage(overrides)]);

    expect(screen.getByTestId('chat-message-timestamp').textContent).toBe(SENT_AT_EARLIER_DAY);
  });

  it('uses the tenant day, not the UTC day, to decide what "today" is', () => {
    // 21 Oct 23:30 UTC is already 22 Oct 10:30 AM in Sydney - the same tenant day as "now".
    vi.setSystemTime(new Date('2026-10-22T02:00:00Z'));

    renderMessages([buildMessage({ timestamp: new Date('2026-10-21T23:30:00Z') })]);

    expect(screen.getByTestId('chat-message-timestamp').textContent).toBe('10:30 AM');
  });

  it('puts the stopped divider timestamp beside its label', () => {
    vi.setSystemTime(new Date('2026-10-21T12:00:00Z'));

    renderMessages([buildMessage({ id: 'stopped-1', type: 'system', content: '', stoppedMarker: { stoppedAt: SENT_AT } })]);

    const divider = screen.getByTestId('stopped-divider');
    expect(within(divider).getByTestId('chat-message-timestamp').textContent).toBe(SENT_AT_TODAY);
  });

  it('falls back to UTC, 24h and yyyy-MM-dd when the chat configuration has no display settings', () => {
    vi.setSystemTime(new Date('2026-11-05T12:00:00Z'));

    renderMessages([buildMessage({})], { agent: { ...agent, displaySettings: undefined } });

    expect(screen.getByTestId('chat-message-timestamp').textContent).toBe('2026-10-21 08:30');
  });

  it.each([
    ['missing', undefined],
    ['the .NET default 0001-01-01', new Date('0001-01-01T00:00:00Z')],
    ['unparseable', new Date('not a date')],
  ])('shows no timestamp when it is %s', (_label, timestamp) => {
    renderMessages([buildMessage({ timestamp })]);

    expect(screen.getByText('Hello from the agent')).toBeInTheDocument();
    expect(screen.queryByTestId('chat-message-timestamp')).toBeNull();
  });

  it('shows no timestamp on typing indicators', () => {
    renderMessages([], { typingIndicators: [{ agentId: 1, agentName: 'Host Agent' }] });

    expect(screen.getByText('Thinking')).toBeInTheDocument();
    expect(screen.queryByTestId('chat-message-timestamp')).toBeNull();
  });

  it("gives the welcome message's prompt chips no timestamps of their own", () => {
    renderMessages([buildMessage({ id: '1', content: 'Hi! How can I help?' })], {
      predefinedPrompts: [{ title: 'Opening hours', prompt: 'When are you open?' }, { title: 'Contact', prompt: 'How do I get in touch?' }],
    });

    expect(screen.getByRole('button', { name: 'Opening hours' })).toBeInTheDocument();
    // Only the welcome bubble's own timestamp.
    expect(screen.getAllByTestId('chat-message-timestamp')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Opening hours' }).querySelector('time')).toBeNull();
  });
});

describe('MessageTimestamp (US 7974)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('formats once while only unrelated re-renders happen (e.g. streamed tokens)', () => {
    const format = vi.spyOn(formatDateTime, 'formatChatTimestamp');
    const settings = { timeZone: 'Australia/Sydney', timeFormat: '12h', dateFormat: 'dd/MM/yyyy' };
    const sentAt = new Date(SENT_AT);

    const { rerender } = render(<div><MessageTimestamp value={sentAt} settings={settings} /><span>a</span></div>);
    rerender(<div><MessageTimestamp value={sentAt} settings={{ ...settings }} /><span>ab</span></div>);
    rerender(<div><MessageTimestamp value={new Date(SENT_AT)} settings={{ ...settings }} /><span>abc</span></div>);

    expect(format).toHaveBeenCalledTimes(1);
  });

  it('formats again when the tenant settings change', () => {
    const { rerender } = render(<MessageTimestamp value={SENT_AT} settings={{ timeZone: 'UTC', timeFormat: '24h', dateFormat: 'yyyy-MM-dd' }} />);
    const before = screen.getByTestId('chat-message-timestamp').textContent;

    rerender(<MessageTimestamp value={SENT_AT} settings={{ timeZone: 'Australia/Sydney', timeFormat: '24h', dateFormat: 'yyyy-MM-dd' }} />);

    expect(screen.getByTestId('chat-message-timestamp').textContent).not.toBe(before);
  });
});
