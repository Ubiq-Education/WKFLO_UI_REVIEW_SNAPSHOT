import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { AgentsBar, getInitials, resolveAgentDisplay, type AgentsBarHostAgent } from './agents-bar';
import type { SessionAgentInfo } from '../hooks/use-chat';

const host: AgentsBarHostAgent = {
  agentId: 1,
  name: 'Main agent',
  iconUrl: 'https://cdn.example/host.png',
};

const mainAgent: SessionAgentInfo = { key: 'id:1', agentId: 1, agentName: 'Main agent' };
const helper: SessionAgentInfo = { key: 'id:2', agentId: 2, agentName: 'Content Helper', chatbotIconUrl: 'https://cdn.example/helper.png' };
const writer: SessionAgentInfo = { key: 'id:3', agentId: 3, agentName: 'Writer' };

const baseProps = {
  hostAgent: host,
  accentColor: '#3b82f6',
};

const avatars = () => screen.getAllByTestId('agents-bar-avatar');

describe('AgentsBar', () => {
  it('renders nothing before any agent has taken part', () => {
    render(<AgentsBar {...baseProps} agents={[]} activeAgent={null} />);
    expect(screen.queryByTestId('agents-bar')).toBeNull();
    // Only the empty, always-mounted live region is there.
    expect(screen.getByTestId('agents-bar-live-region')).toBeEmptyDOMElement();
  });

  it('shows the label and one avatar per agent, with a chevron between them', () => {
    render(<AgentsBar {...baseProps} agents={[mainAgent, helper, writer]} activeAgent={null} />);

    const bar = screen.getByTestId('agents-bar');
    expect(within(bar).getByText('Agents')).toBeInTheDocument();
    expect(avatars()).toHaveLength(3);
    expect(bar.querySelectorAll('svg.lucide-chevron-right')).toHaveLength(2);
  });

  it('centres the label, avatars, chevrons and status on one line, with no offset on the avatar group', () => {
    render(<AgentsBar {...baseProps} agents={[mainAgent, helper]} activeAgent={helper} />);

    const bar = screen.getByTestId('agents-bar');
    expect(bar).toHaveClass('flex', 'items-center');
    const group = screen.getByRole('list', { name: 'Agents in this conversation' });
    expect(group).toHaveClass('flex', 'items-center');
    expect(group.style.paddingTop).toBe('');
    expect(group.style.marginTop).toBe('');
    for (const item of within(group).getAllByRole('listitem')) {
      expect(item).toHaveClass('flex', 'items-center');
      expect(item.style.paddingTop).toBe('');
    }
    // The label, the avatar group and the status are direct children of the centred row.
    expect(within(bar).getByText('Agents').parentElement).toBe(bar);
    expect(group.parentElement).toBe(bar);
    expect(screen.getByTestId('agents-bar-status').parentElement).toBe(bar);
    // The bouncing avatar is animated with a transform only, so it does not shift the layout.
    const active = avatars().find(avatar => avatar.dataset.active === 'true')!;
    expect(active).toHaveClass('animate-bounce');
    expect(active.style.marginTop).toBe('');
    expect(active.style.top).toBe('');
  });

  it('gives each avatar an accessible name, marking the working agent', () => {
    render(<AgentsBar {...baseProps} agents={[mainAgent, helper, writer]} activeAgent={helper} />);

    // role="img" makes the aria-label count: a plain span's aria-label is ignored.
    const named = within(screen.getByRole('list', { name: 'Agents in this conversation' })).getAllByRole('img');
    expect(named.map(avatar => avatar.getAttribute('aria-label'))).toEqual(['Main agent', 'Content Helper (working)', 'Writer']);
    expect(screen.getByRole('img', { name: 'Content Helper (working)' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('img', { name: 'Main agent' })).toHaveAccessibleName('Main agent');
    expect(screen.getByRole('img', { name: 'Writer' })).toHaveAccessibleName('Writer');
  });

  it('uses the payload icon, then the host icon, then initials', () => {
    render(<AgentsBar {...baseProps} agents={[mainAgent, helper, writer]} activeAgent={null} />);

    const [hostAvatar, helperAvatar, writerAvatar] = avatars();
    expect(hostAvatar.querySelector('img')).toHaveAttribute('src', 'https://cdn.example/host.png');
    expect(helperAvatar.querySelector('img')).toHaveAttribute('src', 'https://cdn.example/helper.png');
    expect(writerAvatar.querySelector('img')).toBeNull();
    expect(writerAvatar).toHaveTextContent('W');
  });

  it('uses a spin-up target icon when the payload has none', () => {
    render(
      <AgentsBar
        {...baseProps}
        agents={[writer]}
        activeAgent={null}
        knownAgents={[{ name: 'Writer', iconUrl: 'https://cdn.example/writer.png' }]}
      />
    );

    expect(avatars()[0].querySelector('img')).toHaveAttribute('src', 'https://cdn.example/writer.png');
  });

  // Task 7947 (user decision): an agent not working is dimmed even when nobody is working.
  it('shows no status and dims every avatar while nobody is working', () => {
    render(<AgentsBar {...baseProps} agents={[mainAgent, helper]} activeAgent={null} />);

    // The live region stays in the page (so a later status is announced) but says nothing.
    expect(screen.getByTestId('agents-bar-status')).toBeEmptyDOMElement();
    avatars().forEach(avatar => {
      expect(avatar).toHaveStyle({ opacity: '0.45' });
      expect(avatar).toHaveAttribute('data-active', 'false');
      expect(avatar).not.toHaveClass('animate-bounce');
    });
  });

  it('rings and bounces the active agent and dims the others', () => {
    render(<AgentsBar {...baseProps} agents={[mainAgent, helper]} activeAgent={helper} />);

    const [hostAvatar, helperAvatar] = avatars();
    expect(helperAvatar).toHaveAttribute('data-active', 'true');
    expect(helperAvatar).toHaveAttribute('aria-current', 'true');
    expect(helperAvatar).toHaveClass('animate-bounce');
    expect(helperAvatar.style.boxShadow).toContain('0 0 0 4px');
    expect(helperAvatar).toHaveStyle({ opacity: '1' });

    expect(hostAvatar).toHaveAttribute('data-active', 'false');
    expect(hostAvatar).not.toHaveClass('animate-bounce');
    expect(hostAvatar).toHaveStyle({ opacity: '0.45' });
  });

  it('shows only the name of the active host agent, with no role or description', () => {
    render(<AgentsBar {...baseProps} agents={[mainAgent, helper]} activeAgent={mainAgent} />);

    const status = screen.getByTestId('agents-bar-status');
    expect(status).toHaveTextContent(/^Main agent$/);
    expect(status).toHaveAttribute('title', 'Main agent');
  });

  it('shows only the name of an active hand-off agent', () => {
    render(<AgentsBar {...baseProps} agents={[mainAgent, helper]} activeAgent={helper} />);

    const status = screen.getByTestId('agents-bar-status');
    expect(status).toHaveTextContent(/^Content Helper$/);
    expect(status).toHaveAttribute('title', 'Content Helper');
  });

  it('titles every avatar with the agent name only', () => {
    render(<AgentsBar {...baseProps} agents={[mainAgent, helper]} activeAgent={null} />);

    expect(avatars().map(avatar => avatar.getAttribute('title'))).toEqual(['Main agent', 'Content Helper']);
  });
});

describe('resolveAgentDisplay', () => {
  it('falls back to the host name and icon for an event with no id or name', () => {
    const display = resolveAgentDisplay({ key: '__typing_unknown__' }, host);
    expect(display).toEqual({ name: 'Main agent', iconUrl: 'https://cdn.example/host.png', initials: 'MA' });
  });

  it('always has initials, even when neither the event nor the host has a usable name', () => {
    const display = resolveAgentDisplay({ key: '__typing_unknown__' }, { name: '   ' });
    expect(display).toEqual({ name: 'Agent', iconUrl: undefined, initials: 'A' });
  });

  it('does not give the host icon to a different agent with the same name but another id', () => {
    const display = resolveAgentDisplay({ key: 'id:9', agentId: 9, agentName: 'Main agent' }, host);
    expect(display).toEqual({ name: 'Main agent', iconUrl: undefined, initials: 'MA' });
  });

  it('returns no role for the host or a hand-off agent', () => {
    expect(resolveAgentDisplay(mainAgent, host)).not.toHaveProperty('role');
    expect(resolveAgentDisplay(helper, host)).not.toHaveProperty('role');
  });
});

describe('getInitials', () => {
  it('takes the first letter of up to two words', () => {
    expect(getInitials('content helper bot')).toBe('CH');
    expect(getInitials('  Writer ')).toBe('W');
  });
});

describe('AgentsBar status text (US 8159)', () => {
  it('shows Thinking next to the active agent name, in a polite live region', () => {
    render(<AgentsBar {...baseProps} agents={[mainAgent]} activeAgent={mainAgent} status={{ kind: 'thinking', agent: mainAgent }} />);

    const status = screen.getByTestId('agents-bar-status');
    expect(status).toHaveTextContent(/^Main agent Thinking…$/);
    const live = screen.getByTestId('agents-bar-live-region');
    expect(live).toHaveAttribute('aria-live', 'polite');
    expect(live).toHaveTextContent(/^Main agent Thinking…$/);
  });

  it('keeps the same live region node when the first agent arrives, so the status is announced', () => {
    const { rerender } = render(<AgentsBar {...baseProps} agents={[]} activeAgent={null} />);
    const before = screen.getByTestId('agents-bar-live-region');

    rerender(<AgentsBar {...baseProps} agents={[mainAgent]} activeAgent={mainAgent} status={{ kind: 'thinking', agent: mainAgent }} />);

    expect(screen.getByTestId('agents-bar-live-region')).toBe(before);
    expect(before).toHaveTextContent('Main agent Thinking…');
  });

  it('shows the running action with the raw event name', () => {
    render(<AgentsBar {...baseProps} agents={[mainAgent, helper]} activeAgent={helper} status={{ kind: 'running', agent: helper, action: 'image-edit-requested' }} />);

    expect(screen.getByTestId('agents-bar-status')).toHaveTextContent(/^Content Helper Working: image-edit-requested…$/);
  });

  it('shows Working when the action is unknown', () => {
    render(<AgentsBar {...baseProps} agents={[mainAgent, helper]} activeAgent={helper} status={{ kind: 'running', agent: helper }} />);

    expect(screen.getByTestId('agents-bar-status')).toHaveTextContent(/^Content Helper Working…$/);
  });

  it('shows Waiting for approval with the paused agent name while every avatar is dimmed', () => {
    render(<AgentsBar {...baseProps} agents={[mainAgent, helper]} activeAgent={null} status={{ kind: 'awaiting_approval', agent: helper }} />);

    expect(screen.getByTestId('agents-bar-status')).toHaveTextContent(/^Content Helper Waiting for approval$/);
    avatars().forEach(avatar => expect(avatar).toHaveStyle({ opacity: '0.45' }));
  });
});
