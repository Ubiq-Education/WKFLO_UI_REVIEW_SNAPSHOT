import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AgentChatInput } from './agent-chat-input';
import type { SpinUpAgentTarget } from '@shared/schema';

const baseProps = {
  input: '',
  isProcessing: false,
  isLoading: false,
  conversationState: 'idle' as const,
  selectedFiles: [],
  isConnected: true,
  connectionState: 'Connected',
  onInputChange: vi.fn(),
  onKeyDown: vi.fn(),
  onSendMessage: vi.fn(),
  onFileSelect: vi.fn(),
  onRemoveFile: vi.fn(),
  onBlur: vi.fn(),
  onReconnect: vi.fn(),
};

function ControlledAgentChatInput({ agents }: { agents: SpinUpAgentTarget[] }) {
  const [value, setValue] = React.useState('');
  return (
    <AgentChatInput {...baseProps} agents={agents} input={value} onInputChange={setValue} />
  );
}

describe('AgentChatInput @mention picker trigger', () => {
  it('shows the picker when @ is typed at the start of the input', async () => {
    const user = userEvent.setup();
    render(<ControlledAgentChatInput agents={[{ name: 'Support Bot' }, { name: 'Sales Bot' }]} />);

    await user.type(screen.getByRole('textbox'), '@sup');

    expect(screen.getByText('Support Bot')).toBeInTheDocument();
  });

  it('shows the picker when @ is typed after whitespace', async () => {
    const user = userEvent.setup();
    render(<ControlledAgentChatInput agents={[{ name: 'Support Bot' }]} />);

    await user.type(screen.getByRole('textbox'), 'hey @sup');

    expect(screen.getByText('Support Bot')).toBeInTheDocument();
  });

  it('does not show the picker when @ is typed inside an email address', async () => {
    const user = userEvent.setup();
    render(<ControlledAgentChatInput agents={[{ name: 'Support Bot' }]} />);

    await user.type(screen.getByRole('textbox'), 'foo@bar.com');

    expect(screen.queryByText('Support Bot')).not.toBeInTheDocument();
    expect(screen.queryByText('No agents found')).not.toBeInTheDocument();
    expect(screen.queryByText('Loading agents...')).not.toBeInTheDocument();
  });
});

describe('AgentChatInput @mention picker icons', () => {
  it('renders the agent icon image when iconUrl is present', async () => {
    const user = userEvent.setup();
    const { container } = render(<ControlledAgentChatInput agents={[{ name: 'Support Bot', iconUrl: 'https://example.com/icon.png' }]} />);

    await user.type(screen.getByRole('textbox'), '@sup');

    // Decorative icon: alt="" intentionally (the adjacent agent name already labels the row for
    // screen readers), so it's queried by src rather than accessible name/role.
    const icon = container.querySelector('img[src="https://example.com/icon.png"]');
    expect(icon).not.toBeNull();
    expect(icon).toHaveAttribute('alt', '');
  });

  it('falls back to the generic bot icon when iconUrl is absent', async () => {
    const user = userEvent.setup();
    const { container } = render(<ControlledAgentChatInput agents={[{ name: 'Support Bot' }]} />);

    await user.type(screen.getByRole('textbox'), '@sup');

    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('Support Bot')).toBeInTheDocument();
  });
});

// US 7575 (PR review): a pending tool approval must also block starting voice input.
describe('AgentChatInput voice input while an approval is pending', () => {
  const voiceProps = { ...baseProps, isVoiceChatEnabled: true, isVoiceChatConnected: true };

  it('does not start voice input while blocked', async () => {
    const user = userEvent.setup();
    const onStartListening = vi.fn();
    render(<AgentChatInput {...voiceProps} blockedMessage="Answer the permission request above to continue" onStartListening={onStartListening} />);

    const mic = screen.getByRole('button', { name: 'Start voice input' });
    expect(mic).toBeDisabled();
    await user.click(mic);
    expect(onStartListening).not.toHaveBeenCalled();
  });

  it('still lets an ongoing voice input be stopped', async () => {
    const user = userEvent.setup();
    const onStopListening = vi.fn();
    render(<AgentChatInput {...voiceProps} isListening blockedMessage="Answer the permission request above to continue" onStopListening={onStopListening} />);

    await user.click(screen.getByRole('button', { name: 'Stop voice input' }));
    expect(onStopListening).toHaveBeenCalled();
  });

  it('starts voice input normally when nothing is pending', async () => {
    const user = userEvent.setup();
    const onStartListening = vi.fn();
    render(<AgentChatInput {...voiceProps} onStartListening={onStartListening} />);

    await user.click(screen.getByRole('button', { name: 'Start voice input' }));
    expect(onStartListening).toHaveBeenCalled();
  });
});

// US 7500/7501: while agents work, Send becomes the Stop pill and Enter doesn't send.
describe('AgentChatInput Stop while agents work', () => {
  it('shows a keyboard-reachable "Stop all agents" button instead of Send', async () => {
    const user = userEvent.setup();
    const onStop = vi.fn();
    render(<AgentChatInput {...baseProps} isProcessing isWorking onStop={onStop} />);

    const stop = screen.getByRole('button', { name: 'Stop all agents' });
    expect(stop).toBeEnabled();
    expect(stop).toHaveTextContent('Stop');
    // The spinner Send button is replaced, not shown next to Stop.
    expect(document.querySelector('svg.lucide-loader-circle, svg.lucide-loader2')).toBeNull();

    stop.focus();
    expect(stop).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onStop).toHaveBeenCalledTimes(1);
    await user.keyboard(' ');
    expect(onStop).toHaveBeenCalledTimes(2);
  });

  it('keeps typing allowed but does not send on Enter while working', async () => {
    const user = userEvent.setup();
    const onKeyDown = vi.fn();
    function Controlled() {
      const [value, setValue] = React.useState('');
      return <AgentChatInput {...baseProps} isWorking onStop={vi.fn()} input={value} onInputChange={setValue} onKeyDown={onKeyDown} />;
    }
    render(<Controlled />);

    const textbox = screen.getByRole('textbox');
    expect(textbox).toBeEnabled();
    await user.type(textbox, 'next question');
    expect(textbox).toHaveValue('next question');

    onKeyDown.mockClear();
    await user.keyboard('{Enter}');
    expect(onKeyDown).not.toHaveBeenCalledWith(expect.objectContaining({ key: 'Enter' }));
  });

  it('shows Send again, and Enter reaches the handler, when not working', async () => {
    const user = userEvent.setup();
    const onKeyDown = vi.fn();
    render(<AgentChatInput {...baseProps} input="hello" onKeyDown={onKeyDown} onStop={vi.fn()} />);

    expect(screen.queryByRole('button', { name: 'Stop all agents' })).not.toBeInTheDocument();
    await user.type(screen.getByRole('textbox'), '{Enter}');
    expect(onKeyDown).toHaveBeenCalledWith(expect.objectContaining({ key: 'Enter' }));
  });

  it('keeps the connection status indicator while working', () => {
    render(<AgentChatInput {...baseProps} isWorking onStop={vi.fn()} />);

    expect(screen.getByTitle('Real-time connection: Connected')).toBeInTheDocument();
  });
});

// US 7501 (PR review): Send and Stop swap places, so focus must not fall to <body>.
describe('AgentChatInput keyboard focus when Send and Stop swap', () => {
  // Mirrors AgentChat: sending disables the input until the request is done (isProcessing), and
  // work starts at once; Stop ends it.
  const Harness: React.FC<{ onStop?: () => void }> = ({ onStop }) => {
    const [working, setWorking] = React.useState(false);
    const [processing, setProcessing] = React.useState(false);
    const send = () => {
      setWorking(true);
      setProcessing(true);
      setTimeout(() => setProcessing(false), 0);
    };
    return (
      <AgentChatInput
        {...baseProps}
        input="hello"
        isProcessing={processing}
        isWorking={working}
        isVoiceChatEnabled={false}
        onSendMessage={send}
        onStop={() => { onStop?.(); setWorking(false); }}
      />
    );
  };

  const messageInput = () => screen.getByRole('textbox');

  async function tabTo(user: ReturnType<typeof userEvent.setup>, element: HTMLElement) {
    for (let i = 0; i < 15 && document.activeElement !== element; i++) {
      await user.tab();
    }
    expect(element).toHaveFocus();
  }

  // Send is an icon-only button; reach it with Tab and press it from the keyboard.
  async function pressSendWithKeyboard(user: ReturnType<typeof userEvent.setup>) {
    const send = document.querySelector('svg.lucide-send')!.closest('button') as HTMLElement;
    await tabTo(user, send);
    await user.keyboard('{Enter}');
  }

  it('keeps focus in the message input when Send pressed from the keyboard turns into Stop', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await pressSendWithKeyboard(user);

    expect(await screen.findByRole('button', { name: 'Stop all agents' })).toBeInTheDocument();
    await waitFor(() => expect(messageInput()).toHaveFocus());
  });

  it.each(['{Enter}', ' '])('moves focus to the message input after Stop is pressed with %s', async (key) => {
    const onStop = vi.fn();
    const user = userEvent.setup();
    render(<Harness onStop={onStop} />);
    await pressSendWithKeyboard(user);
    const stop = await screen.findByRole('button', { name: 'Stop all agents' });
    await waitFor(() => expect(messageInput()).toBeEnabled());

    await tabTo(user, stop);
    await user.keyboard(key);

    expect(onStop).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Stop all agents' })).not.toBeInTheDocument();
    expect(messageInput()).toHaveFocus();
  });
});

// US 7501: the mic can't start a new voice message while agents work; stopping still works.
describe('AgentChatInput voice input while agents work', () => {
  const voiceProps = { ...baseProps, isVoiceChatEnabled: true, isVoiceChatConnected: true };

  it('does not start voice input while working', async () => {
    const user = userEvent.setup();
    const onStartListening = vi.fn();
    render(<AgentChatInput {...voiceProps} isWorking onStop={vi.fn()} onStartListening={onStartListening} />);

    const mic = screen.getByRole('button', { name: 'Start voice input' });
    expect(mic).toBeDisabled();
    await user.click(mic);
    expect(onStartListening).not.toHaveBeenCalled();
  });

  it('still lets an ongoing voice input be stopped while working', async () => {
    const user = userEvent.setup();
    const onStopListening = vi.fn();
    render(<AgentChatInput {...voiceProps} isWorking isListening onStop={vi.fn()} onStopListening={onStopListening} />);

    await user.click(screen.getByRole('button', { name: 'Stop voice input' }));
    expect(onStopListening).toHaveBeenCalled();
  });

  it('can start voice input again after Stop', async () => {
    const user = userEvent.setup();
    const onStartListening = vi.fn();
    const Harness = () => {
      const [working, setWorking] = React.useState(true);
      return <AgentChatInput {...voiceProps} isWorking={working} onStop={() => setWorking(false)} onStartListening={onStartListening} />;
    };
    render(<Harness />);
    expect(screen.getByRole('button', { name: 'Start voice input' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Stop all agents' }));

    await user.click(screen.getByRole('button', { name: 'Start voice input' }));
    expect(onStartListening).toHaveBeenCalledTimes(1);
  });
});
