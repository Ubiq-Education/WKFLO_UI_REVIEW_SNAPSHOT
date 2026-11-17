import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatHeader } from './chat-header';
import type { AgentConfig } from './agent-chat-interface';

// US 7550 / 7507: the MAISY top bar in the chat view and in the conversations list.

const agent: AgentConfig = {
  tenantGuid: 'tenant-guid',
  agentName: 'MAISY',
  primaryColor: '#e0f5f0',
  foregroundColor: '#1f2523',
  bubbleStyle: 'rounded',
  showDescription: false,
  chainOfThought: false,
  apiEndpoint: 'https://api.example.com',
  isVoiceChatEnabled: false,
};

describe('ChatHeader — MAISY views', () => {
  it('shows the agent and its connection status in the chat view', () => {
    render(<ChatHeader agent={agent} isMaisy connectionPhase="connected" />);

    expect(screen.getByTestId('maisy-chat-header')).toHaveAttribute('data-view', 'chat');
    expect(screen.getByRole('heading', { name: 'MAISY' })).toBeInTheDocument();
    expect(screen.getByTestId('maisy-connection-status')).toHaveTextContent('Connected');
  });

  it('shows only the "Conversations" title in the list view, in the configured text colour', () => {
    render(<ChatHeader agent={agent} isMaisy connectionPhase="connected" maisyView="list" />);

    expect(screen.getByTestId('maisy-chat-header')).toHaveAttribute('data-view', 'list');
    expect(screen.getByRole('heading', { name: 'Conversations' })).toHaveStyle({ color: '#1f2523' });
    expect(screen.queryByRole('heading', { name: 'MAISY' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('maisy-connection-status')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Reset Session')).not.toBeInTheDocument();
  });

  it('keeps the widget controls in the list view', () => {
    render(<ChatHeader agent={agent} isMaisy isWidget maisyView="list" onClose={() => {}} />);

    // New chat and close.
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });
});

describe('ChatHeader — MAISY back arrow (US 7506)', () => {
  it('puts the back arrow first in the chat view and goes back to the list from it', async () => {
    const onShowConversations = vi.fn();
    render(<ChatHeader agent={agent} isMaisy connectionPhase="connected" onShowConversations={onShowConversations} />);

    const back = screen.getByRole('button', { name: 'Back to conversations' });
    expect(back).toHaveAttribute('title', 'Back to conversations');
    expect(screen.getByTestId('maisy-chat-header').firstElementChild).toBe(back);

    await userEvent.setup().click(back);
    expect(onShowConversations).toHaveBeenCalledTimes(1);
  });

  it('has no back arrow in the list view', () => {
    render(<ChatHeader agent={agent} isMaisy maisyView="list" onShowConversations={() => {}} />);

    expect(screen.queryByRole('button', { name: 'Back to conversations' })).not.toBeInTheDocument();
  });

  it('has no back arrow when there is no list to go back to', () => {
    render(<ChatHeader agent={agent} isMaisy connectionPhase="connected" />);

    expect(screen.queryByRole('button', { name: 'Back to conversations' })).not.toBeInTheDocument();
  });
});

describe('ChatHeader — MAISY New chat (US 7505)', () => {
  it.each(['chat', 'list'] as const)('shows New chat in the %s view and starts a new chat from it', async view => {
    const onNewChat = vi.fn();
    render(<ChatHeader agent={agent} isMaisy maisyView={view} onNewChat={onNewChat} />);

    const newChat = screen.getByRole('button', { name: 'New chat' });
    expect(newChat.querySelector('[data-testid="edit-square-icon"]')).toBeTruthy();
    await userEvent.setup().click(newChat);

    expect(onNewChat).toHaveBeenCalledTimes(1);
  });

  it('replaces Reset Session and Load Message History', () => {
    render(<ChatHeader agent={agent} isMaisy onNewChat={() => {}} onResetSession={() => {}} onLoadHistory={() => {}} />);

    expect(screen.queryByTitle('Reset Session')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Load Message History')).not.toBeInTheDocument();
  });

  it('keeps Reset Session and Load Message History for an agent that is not MAISY', () => {
    render(<ChatHeader agent={agent} onNewChat={() => {}} />);

    expect(screen.queryByRole('button', { name: 'New chat' })).not.toBeInTheDocument();
    expect(screen.getByTitle('Reset Session')).toBeInTheDocument();
    expect(screen.getByTitle('Load Message History')).toBeInTheDocument();
  });
});

describe('ChatHeader — MAISY conversation title (Task 8225)', () => {
  it('shows the title centered in the chat view, next to the agent name and status', () => {
    render(<ChatHeader agent={agent} isMaisy connectionPhase="connected" conversationTitle="Planning the quarterly review" />);

    const title = screen.getByTestId('maisy-conversation-title');
    expect(title).toHaveTextContent('Planning the quarterly review');
    expect(title).toHaveStyle({ textAlign: 'center', color: '#1f2523' });
    expect(screen.getByRole('heading', { name: 'MAISY' })).toBeInTheDocument();
    expect(screen.getByTestId('maisy-connection-status')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New chat' })).toBeInTheDocument();
  });

  it('keeps a long title on one line with an ellipsis and the full text in the title attribute', () => {
    const longTitle = 'A very long conversation title that goes on and on and does not fit the header at all';
    render(<ChatHeader agent={agent} isMaisy conversationTitle={longTitle} />);

    const title = screen.getByTestId('maisy-conversation-title');
    expect(title).toHaveAttribute('title', longTitle);
    expect(title).toHaveStyle({ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' });
  });

  it('sizes the agent block to its content (capped at 40%) and gives the title the rest; New chat keeps its size', () => {
    render(<ChatHeader agent={agent} isMaisy connectionPhase="connected" conversationTitle="Planning the quarterly review" />);

    const title = screen.getByTestId('maisy-conversation-title');
    const agentBlock = screen.getByTestId('maisy-agent-block');
    // The agent block doesn't grow: it takes the width its name/description/status need.
    expect(agentBlock).toHaveStyle({ flex: '0 1 auto', maxWidth: '40%', minWidth: '0' });
    // The title grows into all the remaining free width.
    expect(title).toHaveStyle({ flex: '1 1 0', minWidth: '0' });
    expect(screen.getByRole('button', { name: 'New chat' })).toHaveStyle({ flexShrink: '0', whiteSpace: 'nowrap' });
  });

  it('shows no title when none is passed, and the agent block fills the free width as before', () => {
    render(<ChatHeader agent={agent} isMaisy connectionPhase="connected" />);

    expect(screen.queryByTestId('maisy-conversation-title')).not.toBeInTheDocument();
    const agentBlock = screen.getByTestId('maisy-agent-block');
    expect(agentBlock).toHaveStyle({ flex: '1 1 0', minWidth: '0' });
    expect(agentBlock.style.maxWidth).toBe('');
  });

  it('shows only "Conversations" in the list view, even with a title', () => {
    render(<ChatHeader agent={agent} isMaisy maisyView="list" conversationTitle="Planning the quarterly review" />);

    expect(screen.queryByTestId('maisy-conversation-title')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Conversations' })).toBeInTheDocument();
  });

  it('leaves the classic header without a title', () => {
    render(<ChatHeader agent={agent} conversationTitle="Planning the quarterly review" />);

    expect(screen.queryByTestId('maisy-conversation-title')).not.toBeInTheDocument();
    expect(screen.queryByText('Planning the quarterly review')).not.toBeInTheDocument();
  });
});
