import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConversationList } from './conversation-list';
import type { ConversationAgentSummary, ConversationSummary } from '../models/conversation-summary';
import { formatConversationTimestamp } from '../utils/conversation-list-format';

const agent = (agentId: number, name: string, role: string | null = null, avatarUrl: string | null = null): ConversationAgentSummary => ({
  agentId,
  name,
  role,
  avatarUrl,
});

const conversation = (overrides: Partial<ConversationSummary> = {}): ConversationSummary => ({
  sessionId: 'session-1',
  title: 'Plan the open evening',
  previewLine: 'Can you help me plan the open evening?',
  lastActivityAt: '2026-09-27T16:10:00Z',
  agents: [agent(1, 'MAISY', 'Your AI assistant', 'https://example.com/maisy.png')],
  ...overrides,
});

function renderList(props: Partial<React.ComponentProps<typeof ConversationList>> = {}) {
  const onOpenConversation = vi.fn();
  render(
    <ConversationList
      conversations={[conversation()]}
      status="ready"
      onOpenConversation={onOpenConversation}
      {...props}
    />
  );
  return { onOpenConversation };
}

describe('ConversationList (US 7507)', () => {
  it('shows the title, preview, agents and timestamp of each conversation', () => {
    renderList();

    const timestamp = formatConversationTimestamp('2026-09-27T16:10:00Z');
    const row = screen.getByRole('button', { name: `Plan the open evening, ${timestamp}` });
    expect(within(row).getByText('Plan the open evening')).toBeInTheDocument();
    expect(within(row).getByText('Can you help me plan the open evening?')).toBeInTheDocument();
    expect(within(row).getByText(timestamp)).toBeInTheDocument();
    expect(within(row).getByTestId('conversation-agent-avatar')).toHaveAttribute('title', 'MAISY · Your AI assistant');
  });

  it('names each row by title and timestamp, and describes it with the preview and the agents', () => {
    const agents = [agent(1, 'MAISY', 'Your AI assistant'), agent(2, 'Pages Agent'), agent(3, 'Image Agent', 'Makes images'), agent(4, 'News Agent'), agent(5, 'Events Agent')];
    renderList({ conversations: [conversation({ agents })] });

    const timestamp = formatConversationTimestamp('2026-09-27T16:10:00Z');
    const row = screen.getByRole('button', { name: `Plan the open evening, ${timestamp}` });
    // Every agent, also the ones collapsed into "+N".
    expect(row).toHaveAccessibleDescription(
      'Can you help me plan the open evening? Agents: MAISY · Your AI assistant, Pages Agent, Image Agent · Makes images, News Agent, Events Agent'
    );
    for (const id of row.getAttribute('aria-describedby')!.split(' ')) {
      expect(row.contains(document.getElementById(id))).toBe(true);
    }
  });

  it('keeps the description ids stable across re-renders and unique per row', () => {
    const conversations = [conversation({ sessionId: 'a', title: 'First' }), conversation({ sessionId: 'b', title: 'Second' })];
    const { rerender } = render(<ConversationList conversations={conversations} status="ready" onOpenConversation={vi.fn()} />);
    const before = screen.getAllByRole('button').map(row => row.getAttribute('aria-describedby'));

    rerender(<ConversationList conversations={conversations} status="loading" onOpenConversation={vi.fn()} />);

    expect(screen.getAllByRole('button').map(row => row.getAttribute('aria-describedby'))).toEqual(before);
    expect(new Set(before.flatMap(ids => ids!.split(' '))).size).toBe(4);
  });

  it('has nothing focusable or interactive inside a row, and keeps the hover tooltips', () => {
    const agents = [agent(1, 'MAISY'), agent(2, 'Pages Agent'), agent(3, 'Image Agent'), agent(4, 'News Agent'), agent(5, 'Events Agent', 'Plans events')];
    renderList({ conversations: [conversation({ agents })] });

    const row = screen.getByRole('button');
    expect(row.querySelectorAll('button, a, input, select, textarea, [tabindex], [role]')).toHaveLength(0);
    expect(within(row).queryAllByRole('img')).toHaveLength(0);
    expect(screen.getByTestId('conversation-agents-more')).toHaveAttribute('title', 'News Agent\nEvents Agent · Plans events');
  });

  it("shows the timestamp in the tenant's time zone and formats", () => {
    renderList({ displaySettings: { timeZone: 'Europe/London', dateFormat: 'dd/MM/yyyy', timeFormat: '12h' } });

    // 16:10 UTC is 17:10 in London (BST).
    expect(screen.getByText('27/09/2026 5:10 PM')).toBeInTheDocument();
  });

  it('shows "New conversation" when there is no preview line', () => {
    renderList({ conversations: [conversation({ previewLine: null })] });

    expect(screen.getByText('New conversation')).toBeInTheDocument();
  });

  it('shows the agents in order, and the first 3 plus "+N" for more than 4', () => {
    const agents = [agent(1, 'MAISY'), agent(2, 'Pages Agent'), agent(3, 'Image Agent'), agent(4, 'News Agent'), agent(5, 'Events Agent')];
    renderList({ conversations: [conversation({ agents })] });

    const avatars = screen.getAllByTestId('conversation-agent-avatar');
    expect(avatars.map(a => a.getAttribute('title'))).toEqual(['MAISY', 'Pages Agent', 'Image Agent']);
    expect(screen.getByTestId('conversation-agents-more')).toHaveTextContent('+2');
  });

  it('shows all agents when there are 4 or fewer', () => {
    const agents = [agent(1, 'MAISY'), agent(2, 'Pages Agent'), agent(3, 'Image Agent'), agent(4, 'News Agent')];
    renderList({ conversations: [conversation({ agents })] });

    expect(screen.getAllByTestId('conversation-agent-avatar')).toHaveLength(4);
    expect(screen.queryByTestId('conversation-agents-more')).not.toBeInTheDocument();
  });

  it('shows initials for an agent without an avatar', () => {
    renderList({ conversations: [conversation({ agents: [agent(2, 'Pages Agent')] })] });

    expect(screen.getByTestId('conversation-agent-avatar')).toHaveTextContent('PA');
  });

  it('opens a conversation from anywhere on its row', async () => {
    const { onOpenConversation } = renderList();

    await userEvent.setup().click(screen.getByText('Can you help me plan the open evening?'));

    expect(onOpenConversation).toHaveBeenCalledWith('session-1');
  });

  it('marks the conversation that was open last', () => {
    renderList({
      conversations: [conversation({ sessionId: 'a', title: 'First' }), conversation({ sessionId: 'b', title: 'Second' })],
      activeSessionId: 'b',
    });

    const rows = screen.getAllByRole('button');
    expect(rows[0]).not.toHaveAttribute('aria-current');
    expect(rows[1]).toHaveAttribute('aria-current', 'true');
    expect(rows[1]).toHaveClass('wkflo-conversation-row--active');
  });

  it('moves between rows with the arrow keys, Home and End', async () => {
    const user = userEvent.setup();
    renderList({
      conversations: ['a', 'b', 'c'].map(id => conversation({ sessionId: id, title: id })),
    });
    const rows = screen.getAllByRole('button');

    rows[0].focus();
    await user.keyboard('{ArrowDown}');
    expect(rows[1]).toHaveFocus();
    await user.keyboard('{End}');
    expect(rows[2]).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(rows[2]).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(rows[1]).toHaveFocus();
    await user.keyboard('{Home}');
    expect(rows[0]).toHaveFocus();
  });

  it('shows "No conversations yet" for an empty list', () => {
    renderList({ conversations: [] });

    expect(screen.getByText('No conversations yet')).toBeInTheDocument();
  });

  it('shows a loading message before the first load', () => {
    renderList({ conversations: [], status: 'loading' });

    expect(screen.getByRole('status')).toHaveTextContent('Loading conversations…');
  });

  it('keeps the rows on screen while reloading', () => {
    renderList({ status: 'loading' });

    expect(screen.getByText('Plan the open evening')).toBeInTheDocument();
  });

  it('offers Retry when the list could not be loaded', async () => {
    const onRetry = vi.fn();
    renderList({ conversations: [], status: 'error', onRetry });

    expect(screen.getByRole('alert')).toHaveTextContent("Conversations couldn't be loaded.");
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe('ConversationList focus on showing (US 7506)', () => {
  const rows = () => screen.getAllByRole('button');
  const twoConversations = [conversation({ sessionId: 'a', title: 'First' }), conversation({ sessionId: 'b', title: 'Second' })];

  it('focuses the row of the conversation that was open', () => {
    renderList({ conversations: twoConversations, activeSessionId: 'b', focusOnShow: true });

    expect(rows()[1]).toHaveFocus();
  });

  it('focuses the first row when the open conversation is not listed', () => {
    renderList({ conversations: twoConversations, activeSessionId: 'not-listed', focusOnShow: true });

    expect(rows()[0]).toHaveFocus();
  });

  it('focuses the empty state when there are no conversations', () => {
    renderList({ conversations: [], status: 'ready', focusOnShow: true });

    expect(screen.getByTestId('conversation-list-empty')).toHaveFocus();
  });

  it('waits for the list to load before moving focus', () => {
    const { rerender } = render(
      <ConversationList conversations={[]} status="loading" activeSessionId="b" onOpenConversation={vi.fn()} focusOnShow />
    );
    expect(document.body).toHaveFocus();

    rerender(<ConversationList conversations={twoConversations} status="ready" activeSessionId="b" onOpenConversation={vi.fn()} focusOnShow />);

    expect(rows()[1]).toHaveFocus();
  });

  it('moves focus only once, and not when the user has put it somewhere else', () => {
    const elsewhere = document.createElement('button');
    document.body.appendChild(elsewhere);
    try {
      const { rerender } = render(
        <ConversationList conversations={[]} status="loading" onOpenConversation={vi.fn()} focusOnShow />
      );
      elsewhere.focus();

      rerender(<ConversationList conversations={twoConversations} status="ready" onOpenConversation={vi.fn()} focusOnShow />);

      expect(elsewhere).toHaveFocus();
    } finally {
      elsewhere.remove();
    }
  });

  it('leaves focus alone without focusOnShow', () => {
    renderList({ conversations: twoConversations, activeSessionId: 'b' });

    expect(document.body).toHaveFocus();
  });
});
