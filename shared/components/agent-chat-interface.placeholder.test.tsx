import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AgentChatInterface, AgentConfig } from './agent-chat-interface';
import { ChatMessagesProvider } from '../provider/chat-messages-provider';

// US 7500 (MAISY design): the Chat UI's idle placeholder uses the agent's configured name. Without
// one it stays "Type your message..." - not "Ask Assistant", the generic name used elsewhere.

// No shareId/securityConfiguration: no ChatService is created and no network calls fire.
const baseAgent: AgentConfig = {
  tenantGuid: 'tenant-guid',
  agentName: 'MAISY',
  primaryColor: '#000000',
  bubbleStyle: 'rounded',
  showDescription: false,
  chainOfThought: false,
  apiEndpoint: 'https://api.example.com',
  isVoiceChatEnabled: false,
};

function renderInterface(agent: AgentConfig, isWidget = false) {
  return render(
    <ChatMessagesProvider>
      <AgentChatInterface agent={agent} isWidget={isWidget} />
    </ChatMessagesProvider>
  );
}

describe('AgentChatInterface idle placeholder (US 7500)', () => {
  it('asks the configured agent in the Chat UI', () => {
    renderInterface(baseAgent);

    expect(screen.getByRole('textbox')).toHaveAttribute('placeholder', 'Ask MAISY');
  });

  it('falls back to "Type your message..." in the Chat UI when no name is configured', () => {
    renderInterface({ ...baseAgent, agentName: '' });

    expect(screen.getByRole('textbox')).toHaveAttribute('placeholder', 'Type your message...');
    expect(screen.queryByPlaceholderText('Ask Assistant')).not.toBeInTheDocument();
  });

  it('keeps "Type your message..." in the Chat Widget, with or without a name', () => {
    const { unmount } = renderInterface(baseAgent, true);
    expect(screen.getByRole('textbox')).toHaveAttribute('placeholder', 'Type your message...');
    unmount();

    renderInterface({ ...baseAgent, agentName: '' }, true);
    expect(screen.getByRole('textbox')).toHaveAttribute('placeholder', 'Type your message...');
  });
});
