import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AgentChatMessages } from './agent-chat-messages';
import { ChatMessage } from '@shared/services/chat-service';
import type { DateTimeFormatSettings } from '@shared/utils/format-date-time';

function buildMessage(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id: 'msg-1',
    type: 'assistant',
    content: 'Hello from the agent',
    timestamp: new Date(),
    channelMessageType: 1,
    ...overrides,
  };
}

function renderMessages(messages: ChatMessage[], displaySettings?: DateTimeFormatSettings) {
  return render(
    <AgentChatMessages
      messages={messages}
      typingIndicators={[]}
      expandedTools={new Set()}
      messagesContainerRef={{ current: null }}
      agentName="Host Agent"
      agentId={1}
      onToggleToolDescription={() => {}}
      onSubmitContactForm={async () => {}}
      onSkipContactForm={() => {}}
      displaySettings={displaySettings}
    />
  );
}

// US 7078: a spun-up agent's generated/edited image is sent by the backend with `type: 'user'`
// (Anthropic rejects an image content block inside an assistant turn) but flagged
// `metadata.renderAsSystem: true` so it still renders like an agent/system message — left-aligned,
// gray Bot icon, agent-style bubble — instead of the real-user right-aligned blue styling.
// See PLAN.md and the identical fix in shared/components/chat-messages.tsx.
describe('AgentChatMessages — renderAsSystem-flagged User-role messages render as system-styled (US 7078)', () => {
  it('renders a User-role message with metadata.renderAsSystem left-aligned, with the Bot icon and gray bubble', () => {
    const { container } = renderMessages([
      buildMessage({
        type: 'user',
        content: 'Here is the generated image',
        metadata: { renderAsSystem: true },
      }),
    ]);

    const row = container.querySelector('.flex.items-start.gap-2.max-w-\\[75\\%\\]')?.parentElement as HTMLElement;
    expect(row.className).toContain('justify-start');
    expect(row.className).not.toContain('justify-end');

    // Gray agent icon - the AI sparkle, US 7551 (User icon + blue background is suppressed).
    expect(container.querySelector('svg.lucide-user')).toBeNull();
    expect(container.querySelector('[data-testid="ai-sparkle-icon"]')).toBeTruthy();

    // Agent-style (gray/white) bubble, not the blue user bubble.
    const bubble = screen.getByText('Here is the generated image').closest('.p-3.rounded-lg') as HTMLElement;
    expect(bubble.className).not.toContain('bg-blue-600');
  });

  it('leaves a plain real User-role message (no renderAsSystem) unaffected — right-aligned, User icon, blue bubble', () => {
    const { container } = renderMessages([
      buildMessage({
        type: 'user',
        content: 'Hello there',
      }),
    ]);

    const row = container.querySelector('.flex.items-start.gap-2.max-w-\\[75\\%\\]')?.parentElement as HTMLElement;
    expect(row.className).toContain('justify-end');
    expect(row.className).not.toContain('justify-start');

    expect(container.querySelector('svg.lucide-user')).toBeTruthy();

    const bubble = screen.getByText('Hello there').closest('.p-3.rounded-lg') as HTMLElement;
    expect(bubble.className).toContain('bg-blue-600');
  });
});

// Bug 7722: the admin test chat shows sub-agent activity (incl. approval statuses) instead of an
// empty tool box.
describe('AgentChatMessages — subagent activity (Bug 7722)', () => {
  function renderActivity(status: string) {
    renderMessages([
      buildMessage({
        type: 'tool',
        content: '',
        subAgentActivity: {
          chatId: 'chat-1',
          agentId: 7,
          agentName: 'Research Agent',
          action: 'Creating the document',
          status: status as never,
        },
      }),
    ]);
    return screen.getByTestId('agent-chat-subagent-activity');
  }

  it.each([
    ['started', 'Working…', 'wrench'],
    ['awaiting_approval', 'Waiting for approval', 'hand'],
    ['resumed', 'Working… (approved)', 'wrench'],
    ['completed', 'Done', 'wrench'],
    ['failed', 'Failed', 'wrench'],
    ['denied', 'Denied', 'ban'],
    ['expired', 'Expired', 'clock'],
  ])('renders %s as "%s" with the %s icon', (status, label, icon) => {
    const card = renderActivity(status);

    expect(card).toHaveTextContent('Research Agent');
    expect(card).toHaveTextContent('Creating the document');
    expect(card).toHaveTextContent(label);
    expect(card.querySelector(`[data-icon="${icon}"]`)).not.toBeNull();
  });

  it('shows an unknown status neutrally, never as "Done"', () => {
    const card = renderActivity('something_new');

    expect(card).toHaveTextContent('Status unavailable');
    expect(card).not.toHaveTextContent('Done');
  });
});

// Task 7851: in the agent Test tab, function call content (long JSON, URLs, IDs with no
// spaces) overflowed the chat panel. Every bubble must let such strings wrap.
describe('AgentChatMessages — long unbroken content wraps (Task 7851)', () => {
  const LONG_TOKEN = `{"designId":"${'D'.repeat(400)}"}`;

  it('constrains a tool-call message and its result data', () => {
    const { getByTestId } = renderMessages([
      buildMessage({
        type: 'tool',
        content: LONG_TOKEN,
        contentItems: [{ name: `canva-search-designs-${'x'.repeat(200)}`, data: LONG_TOKEN, status: 'success' }],
      }),
    ]);

    const toolBubble = getByTestId('agent-chat-tool-message');
    expect(toolBubble.className).toContain('min-w-0');
    expect(toolBubble.className).toContain('wrap-anywhere');

    const toolName = screen.getByText(/^canva-search-designs-/);
    expect(toolName.className).toContain('min-w-0');
    expect(toolName.className).toContain('wrap-anywhere');
    expect((toolName.parentElement as HTMLElement).className).toContain('min-w-0');

    for (const el of screen.getAllByText(LONG_TOKEN)) {
      expect(el.className).toContain('wrap-anywhere');
    }
  });

  it('constrains a regular message bubble with a very long unbroken string', () => {
    renderMessages([buildMessage({ type: 'system', channelMessageType: 3, content: LONG_TOKEN })]);

    const text = screen.getByText(LONG_TOKEN);
    expect(text.className).toContain('min-w-0');
    expect(text.className).toContain('wrap-anywhere');

    const bubble = text.closest('.p-3.rounded-lg') as HTMLElement;
    expect(bubble.className).toContain('min-w-0');
    expect(bubble.className).toContain('max-w-full');
    expect(bubble.className).toContain('wrap-anywhere');
    expect((bubble.parentElement as HTMLElement).className).toContain('min-w-0');
  });
});

// US 7502: the Stop marker renders as the full-width divider, never as an agent bubble.
describe('AgentChatMessages — Stop divider', () => {
  const divider = buildMessage({
    id: 'stopped-marker-1',
    type: 'system',
    content: 'Stopped. All agents cancelled.',
    channelMessageType: 3,
    agentName: 'MAISY',
    metadata: { renderAsSystem: true, isStoppedMarker: true, stoppedAt: '2026-10-19T10:00:00Z' },
    stoppedMarker: { stoppedAt: '2026-10-19T10:00:00Z' },
  });

  it('renders the divider below the partial text', () => {
    renderMessages([buildMessage({ id: 'reply-1', content: 'Partial answer' }), divider]);

    const dividerText = screen.getByText('Stopped. All agents cancelled.');
    expect(dividerText.closest('[role="separator"], [aria-hidden="true"]')).toBeNull();
    const partial = screen.getByText('Partial answer');
    expect(partial.compareDocumentPosition(dividerText) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('never renders the marker as a bubble with the agent name and bot icon', () => {
    const { container } = renderMessages([divider]);

    expect(screen.getAllByText('Stopped. All agents cancelled.')).toHaveLength(1);
    expect(screen.queryByText('MAISY')).toBeNull();
    expect(container.querySelector('[data-testid="ai-sparkle-icon"]')).toBeNull();
  });
});

// US 7959: a chat runtime error entry (the assistant failed while answering) or tool warning.
describe('AgentChatMessages — chat runtime error entry', () => {
  it('shows the friendly text as an error with the agent name, without rating', () => {
    render(
      <AgentChatMessages
        messages={[buildMessage({
          id: 'error-1',
          messageId: 'should-not-matter',
          content: 'The assistant took too long to reply. Please try again.',
          channelMessageType: 3,
          agentName: 'Research Agent',
          chatError: { code: 'WKFLOAI1102', severity: 'error', isTerminal: true },
        })]}
        typingIndicators={[]}
        expandedTools={new Set()}
        messagesContainerRef={{ current: null }}
        agentName="Host Agent"
        agentId={1}
        onToggleToolDescription={() => {}}
        onRateMessage={() => {}}
        onSubmitContactForm={async () => {}}
        onSkipContactForm={() => {}}
      />
    );

    const entry = screen.getByTestId('agent-chat-error');
    expect(entry.getAttribute('data-severity')).toBe('error');
    expect(entry.getAttribute('role')).toBe('alert');
    expect(entry.textContent).toContain('The assistant took too long to reply. Please try again.');
    expect(screen.getByText('Research Agent')).toBeTruthy();
    expect(screen.queryByTitle('Thumbs up')).toBeNull();
    expect(screen.queryByTitle('Thumbs down')).toBeNull();
  });

  it('shows a tool warning in the warning style', () => {
    renderMessages([buildMessage({
      content: "A tool this assistant uses isn't available right now.",
      channelMessageType: 3,
      chatError: { code: 'WKFLOAI1113', severity: 'warning', isTerminal: false },
    })]);

    const entry = screen.getByTestId('agent-chat-error');
    expect(entry.getAttribute('data-severity')).toBe('warning');
    expect(entry.className).toContain('bg-amber-50');
    expect(screen.getByText('Host Agent')).toBeTruthy();
  });

  it('shows the friendly text of a failed sub-agent run with an error code', () => {
    renderMessages([buildMessage({
      type: 'tool',
      content: '',
      subAgentActivity: {
        chatId: 'chat-1',
        agentId: 7,
        agentName: 'Research Agent',
        action: 'Looking up data',
        status: 'failed',
        errorCode: 'WKFLOAI1116',
      },
    })]);

    expect(screen.getByTestId('agent-chat-subagent-activity-error').textContent)
      .toBe("The assistants couldn't complete your request. Please try again.");
  });
});

// PR review: the error entry shows the failing agent's avatar and a readable timestamp.
describe('AgentChatMessages — chat runtime error entry avatar and timestamp', () => {
  const errorEntry = (overrides: Partial<ChatMessage> = {}) => buildMessage({
    content: 'The assistant took too long to reply. Please try again.',
    channelMessageType: 3,
    chatError: { code: 'WKFLOAI1102', severity: 'error', isTerminal: true },
    ...overrides,
  });

  it("shows the failing agent's icon when it has one", () => {
    const { container } = renderMessages([errorEntry({ chatbotIconUrl: '  https://cdn.example/research-agent.png ' })]);

    expect(screen.getByAltText('Chatbot icon').getAttribute('src')).toBe('https://cdn.example/research-agent.png');
    expect(container.querySelector('[data-testid="ai-sparkle-icon"]')).toBeNull();
  });

  it.each([undefined, '', '   '])('falls back to the AI sparkle when the icon is %p', (chatbotIconUrl) => {
    const { container } = renderMessages([errorEntry({ chatbotIconUrl })]);

    expect(screen.queryByAltText('Chatbot icon')).toBeNull();
    expect(container.querySelector('[data-testid="ai-sparkle-icon"]')).toBeTruthy();
  });

  it('uses severity-specific dark text for the timestamp', () => {
    const timestamp = new Date('2026-10-21T10:30:00Z');
    // US 7974: in the tenant's zone and formats (defaults here: UTC, 24h, yyyy-MM-dd).
    const time = '2026-10-21 10:30';

    const { unmount } = renderMessages([errorEntry({ timestamp })]);
    expect(screen.getByText(time).className).toContain('text-red-800');
    expect(screen.getByText(time).className).not.toContain('text-gray-400');
    unmount();

    renderMessages([errorEntry({ timestamp, chatError: { code: 'WKFLOAI1112', severity: 'warning', isTerminal: false } })]);
    expect(screen.getByText(time).className).toContain('text-amber-800');
  });
});

// US 7974: timestamps follow the tenant's time zone and formats, never the browser's.
describe('AgentChatMessages — tenant-local timestamps (US 7974)', () => {
  // Australia/Sydney is UTC+11 (AEDT) in late October.
  const sydney: DateTimeFormatSettings = { timeZone: 'Australia/Sydney', timeFormat: '12h', dateFormat: 'dd/MM/yyyy' };
  const sentAt = new Date('2026-10-21T08:30:00Z'); // 21/10/2026 7:30 PM in Sydney

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows only the time for a message from today in the tenant zone', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-21T12:00:00Z')); // 11 PM the same day in Sydney

    renderMessages([buildMessage({ timestamp: sentAt })], sydney);

    expect(screen.getByTestId('chat-message-timestamp').textContent).toBe('7:30 PM');
  });

  it('shows date and time for an earlier day, in each bubble and card', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-05T12:00:00Z'));

    renderMessages([
      buildMessage({ id: 'user-1', type: 'user', content: 'A question', timestamp: sentAt }),
      buildMessage({ id: 'reply-1', content: 'An answer', timestamp: sentAt }),
      buildMessage({ id: 'tool-1', type: 'tool', content: 'Ran a tool', timestamp: sentAt }),
      buildMessage({
        id: 'activity-1', type: 'tool', content: '', timestamp: sentAt,
        subAgentActivity: { chatId: 'chat-1', agentId: 7, agentName: 'Research Agent', action: 'Looking up data', status: 'started' },
      }),
      buildMessage({ id: 'stopped-1', type: 'system', content: '', timestamp: sentAt, stoppedMarker: { stoppedAt: '2026-10-21T08:30:00Z' } }),
    ], sydney);

    const timestamps = screen.getAllByTestId('chat-message-timestamp');
    expect(timestamps).toHaveLength(5);
    for (const timestamp of timestamps) {
      expect(timestamp.textContent).toBe('21/10/2026 7:30 PM');
      expect(timestamp.getAttribute('datetime')).toBe('2026-10-21T08:30:00.000Z');
    }
  });

  it.each([
    ['missing', undefined],
    ['the .NET default', new Date('0001-01-01T00:00:00Z')],
    ['unparseable', new Date('not a date')],
  ])('shows no timestamp when it is %s', (_label, timestamp) => {
    renderMessages([buildMessage({ timestamp })], sydney);

    expect(screen.getByText('Hello from the agent')).toBeInTheDocument();
    expect(screen.queryByTestId('chat-message-timestamp')).toBeNull();
  });

  it('shows no timestamp on typing indicators', () => {
    render(
      <AgentChatMessages
        messages={[]}
        typingIndicators={[{ agentId: 1, agentName: 'Host Agent' }]}
        expandedTools={new Set()}
        messagesContainerRef={{ current: null }}
        agentName="Host Agent"
        agentId={1}
        onToggleToolDescription={() => {}}
        onSubmitContactForm={async () => {}}
        onSkipContactForm={() => {}}
        displaySettings={sydney}
      />
    );

    expect(screen.queryByTestId('chat-message-timestamp')).toBeNull();
  });
});

// US 8159: the Test Agent tab shows the Agents bar, which carries "typing" and sub-agent progress.
describe('AgentChatMessages — status in the Agents bar (US 8159)', () => {
  function renderBarMode(messages: ChatMessage[], typing: Array<{ agentId?: number; agentName?: string }> = []) {
    return render(
      <AgentChatMessages
        messages={messages}
        typingIndicators={typing}
        expandedTools={new Set()}
        messagesContainerRef={{ current: null }}
        agentName="Host Agent"
        agentId={1}
        onToggleToolDescription={() => {}}
        onSubmitContactForm={async () => {}}
        onSkipContactForm={() => {}}
        statusInAgentsBar
      />
    );
  }

  const activity = (status: string) => buildMessage({
    id: `activity-${status}`,
    type: 'tool',
    content: '',
    subAgentActivity: {
      chatId: 'chat-1', agentId: 7, agentName: 'Research Agent', action: 'image-edit-requested', status: status as never,
    },
  });

  it('hides the typing bubble', () => {
    const { container } = renderBarMode([], [{ agentId: 1, agentName: 'Host Agent' }]);
    expect(container.querySelector('.animate-bounce')).toBeNull();
  });

  it.each(['started', 'resumed', 'completed', 'awaiting_approval'])('hides the %s sub-agent card', (status) => {
    renderBarMode([activity(status)]);
    expect(screen.queryByTestId('agent-chat-subagent-activity')).toBeNull();
  });

  it.each(['failed', 'denied', 'expired', 'cancelled'])('keeps the %s sub-agent card', (status) => {
    renderBarMode([activity(status)]);
    expect(screen.getAllByTestId('agent-chat-subagent-activity')).toHaveLength(1);
  });
});
