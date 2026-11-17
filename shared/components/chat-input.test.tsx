import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, act, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { ChatInput } from './chat-input';
import type { SpinUpAgentTarget } from '../schema';

const baseProps = {
  inputValue: '',
  isLoading: false,
  selectedFiles: [],
  primaryColor: '#000000',
  onInputChange: vi.fn(),
  onKeyPress: vi.fn(),
  onSendMessage: vi.fn(),
  onFileSelect: vi.fn(),
  onRemoveFile: vi.fn(),
};

// The Chat Widget (isWidget = true) keeps the text pill; the Chat UI icon is covered by the US 7503 block below.
describe('ChatInput feature-selection pill (Chat Widget)', () => {
  it('does not render the pill when no toggle handler is passed', () => {
    render(<ChatInput {...baseProps} isWidget />);
    expect(screen.queryByTitle('Select a feature on the page')).not.toBeInTheDocument();
  });

  it('renders idle label/colors when isFeatureSelectionActive is false', () => {
    render(<ChatInput {...baseProps} isWidget isFeatureSelectionActive={false} onToggleFeatureSelection={vi.fn()} />);
    const button = screen.getByTitle('Select a feature on the page');
    expect(button).toHaveTextContent('Select feature');
    expect(button).toHaveStyle({
      backgroundColor: 'rgb(234, 241, 255)',
      color: 'rgb(30, 79, 191)',
    });
    expect(button.style.border).toBe('1px solid rgb(201, 219, 251)');
  });

  it('shows the active tooltip, label and colors when isFeatureSelectionActive is true', () => {
    render(<ChatInput {...baseProps} isWidget isFeatureSelectionActive onToggleFeatureSelection={vi.fn()} />);
    const button = screen.getByTitle('Stop selecting');
    expect(button).toHaveTextContent('Click a feature…');
    expect(button).toHaveStyle({
      backgroundColor: 'rgb(62, 124, 246)',
      color: 'rgb(255, 255, 255)',
    });
    expect(button.style.border).toBe('1px solid rgb(62, 124, 246)');
  });

  it('calls onToggleFeatureSelection when clicked', async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(<ChatInput {...baseProps} isWidget onToggleFeatureSelection={onToggle} />);

    await user.click(screen.getByTitle('Select a feature on the page'));

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('is disabled while isLoading, matching the "+" button', () => {
    render(<ChatInput {...baseProps} isWidget isLoading onToggleFeatureSelection={vi.fn()} />);
    expect(screen.getByTitle('Select a feature on the page')).toBeDisabled();
  });
});

describe('ChatInput textarea', () => {
  it('renders a textarea (not a single-line input) for the message box', () => {
    render(<ChatInput {...baseProps} />);
    const textarea = screen.getByPlaceholderText('Type your message...');
    expect(textarea.tagName).toBe('TEXTAREA');
  });

  it('typing into the textarea calls onInputChange', async () => {
    const onInputChange = vi.fn();
    const user = userEvent.setup();
    render(<ChatInput {...baseProps} onInputChange={onInputChange} />);

    await user.type(screen.getByPlaceholderText('Type your message...'), 'hi');

    expect(onInputChange).toHaveBeenCalled();
  });
});

function ControlledChatInput({ agents }: { agents: SpinUpAgentTarget[] }) {
  const [value, setValue] = React.useState('');
  return (
    <ChatInput {...baseProps} agents={agents} inputValue={value} onInputChange={setValue} />
  );
}

describe('ChatInput @mention picker trigger', () => {
  it('shows the picker when @ is typed at the start of the input', async () => {
    const user = userEvent.setup();
    render(<ControlledChatInput agents={[{ name: 'Support Bot' }, { name: 'Sales Bot' }]} />);

    await user.type(screen.getByPlaceholderText('Type your message...'), '@sup');

    expect(screen.getByText('Support Bot')).toBeInTheDocument();
  });

  it('shows the picker when @ is typed after whitespace', async () => {
    const user = userEvent.setup();
    render(<ControlledChatInput agents={[{ name: 'Support Bot' }]} />);

    await user.type(screen.getByPlaceholderText('Type your message...'), 'hey @sup');

    expect(screen.getByText('Support Bot')).toBeInTheDocument();
  });

  it('does not show the picker when @ is typed inside an email address', async () => {
    const user = userEvent.setup();
    render(<ControlledChatInput agents={[{ name: 'Support Bot' }]} />);

    await user.type(screen.getByPlaceholderText('Type your message...'), 'foo@bar.com');

    expect(screen.queryByText('Support Bot')).not.toBeInTheDocument();
    expect(screen.queryByText('No agents found')).not.toBeInTheDocument();
  });

  it('does not show the picker at all when agents is not passed', async () => {
    const onInputChange = vi.fn();
    const user = userEvent.setup();
    render(<ChatInput {...baseProps} onInputChange={onInputChange} />);

    await user.type(screen.getByPlaceholderText('Type your message...'), '@sup');

    expect(screen.queryByText('No agents found')).not.toBeInTheDocument();
  });
});

describe('ChatInput @mention picker icons', () => {
  it('renders the agent icon image when iconUrl is present', async () => {
    const user = userEvent.setup();
    const { container } = render(<ControlledChatInput agents={[{ name: 'Support Bot', iconUrl: 'https://example.com/icon.png' }]} />);

    await user.type(screen.getByPlaceholderText('Type your message...'), '@sup');

    // Decorative icon: alt="" intentionally (the adjacent agent name already labels the row for
    // screen readers), so it's queried by src rather than accessible name/role.
    const icon = container.querySelector('img[src="https://example.com/icon.png"]');
    expect(icon).not.toBeNull();
    expect(icon).toHaveAttribute('alt', '');
  });

  it('falls back to the generic bot icon when iconUrl is absent', async () => {
    const user = userEvent.setup();
    const { container } = render(<ControlledChatInput agents={[{ name: 'Support Bot' }]} />);

    await user.type(screen.getByPlaceholderText('Type your message...'), '@sup');

    expect(container.querySelector('img')).toBeNull();
    // US 7551: the generic agent icon is the AI sparkle.
    expect(container.querySelector('[data-testid="ai-sparkle-icon"]')).toBeTruthy();
    expect(screen.getByText('Support Bot')).toBeInTheDocument();
  });
});

// US 7575 (PR review): the shared chat / widget mic must not start while an approval is pending.
describe('ChatInput voice input while an approval is pending', () => {
  const voiceProps = { ...baseProps, isVoiceChatEnabled: true, isVoiceChatConnected: true };

  it('does not start voice input while isVoiceBlocked', async () => {
    const user = userEvent.setup();
    const onStartListening = vi.fn();
    render(<ChatInput {...voiceProps} isVoiceBlocked onStartListening={onStartListening} />);

    const mic = screen.getByRole('button', { name: 'Start voice input' });
    expect(mic).toBeDisabled();
    expect(mic).toHaveAttribute('title', 'Answer the permission request above to continue');
    await user.click(mic);
    expect(onStartListening).not.toHaveBeenCalled();
  });

  it('still lets an ongoing voice input be stopped', async () => {
    const user = userEvent.setup();
    const onStopListening = vi.fn();
    render(<ChatInput {...voiceProps} isVoiceBlocked isListening onStopListening={onStopListening} />);

    await user.click(screen.getByRole('button', { name: 'Stop voice input' }));
    expect(onStopListening).toHaveBeenCalled();
  });

  it('keeps the existing behaviour when not blocked (isLoading does not disable the mic)', async () => {
    const user = userEvent.setup();
    const onStartListening = vi.fn();
    render(<ChatInput {...voiceProps} isLoading onStartListening={onStartListening} />);

    await user.click(screen.getByRole('button', { name: 'Start voice input' }));
    expect(onStartListening).toHaveBeenCalled();
  });
});

describe('ChatInput Stop button (US 7500)', () => {
  it('shows Send, not Stop, while nothing is working', () => {
    render(<ChatInput {...baseProps} onStop={vi.fn()} />);

    expect(screen.queryByRole('button', { name: 'Stop all agents' })).not.toBeInTheDocument();
  });

  it('replaces Send with a Stop button named "Stop all agents" while working', () => {
    render(<ChatInput {...baseProps} inputValue="hello" isWorking onStop={vi.fn()} />);

    const stop = screen.getByRole('button', { name: 'Stop all agents' });
    expect(stop).toHaveTextContent('Stop');
    expect(stop).toBeEnabled();
    expect(screen.getByTestId('chat-stop-button')).toBe(stop);
  });

  it('keeps Stop enabled while the send request is still loading', () => {
    render(<ChatInput {...baseProps} isLoading isWorking onStop={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Stop all agents' })).toBeEnabled();
  });

  it('calls onStop on click', async () => {
    const onStop = vi.fn();
    const user = userEvent.setup();
    render(<ChatInput {...baseProps} isWorking onStop={onStop} />);

    await user.click(screen.getByRole('button', { name: 'Stop all agents' }));

    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it.each(['{Enter}', ' '])('can be reached with Tab and pressed with %s', async (key) => {
    const onStop = vi.fn();
    const user = userEvent.setup();
    render(<ChatInput {...baseProps} isWorking onStop={onStop} isVoiceChatEnabled={false} />);

    const stop = screen.getByRole('button', { name: 'Stop all agents' });
    for (let i = 0; i < 10 && document.activeElement !== stop; i++) {
      await user.tab();
    }
    expect(stop).toHaveFocus();

    await user.keyboard(key);
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('keeps the textarea editable while working', async () => {
    const onInputChange = vi.fn();
    const user = userEvent.setup();
    render(<ChatInput {...baseProps} isWorking onStop={vi.fn()} onInputChange={onInputChange} />);

    const textarea = screen.getByRole('textbox');
    expect(textarea).toBeEnabled();
    await user.type(textarea, 'a');
    expect(onInputChange).toHaveBeenCalledWith('a');
  });

  it('does not pass Enter on while working, so it cannot send', async () => {
    const onKeyPress = vi.fn();
    const user = userEvent.setup();
    render(<ChatInput {...baseProps} inputValue="hello" isWorking onStop={vi.fn()} onKeyPress={onKeyPress} />);

    await user.type(screen.getByRole('textbox'), '{Enter}');

    expect(onKeyPress).not.toHaveBeenCalledWith(expect.objectContaining({ key: 'Enter' }));
  });

  it('passes Enter on again once the work is done', async () => {
    const onKeyPress = vi.fn();
    const user = userEvent.setup();
    render(<ChatInput {...baseProps} inputValue="hello" onStop={vi.fn()} onKeyPress={onKeyPress} />);

    await user.type(screen.getByRole('textbox'), '{Enter}');

    expect(onKeyPress).toHaveBeenCalledWith(expect.objectContaining({ key: 'Enter' }));
  });

  it('keeps the "+" and Select feature buttons working while working', async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(<ChatInput {...baseProps} isWorking onStop={vi.fn()} onToggleFeatureSelection={onToggle} />);

    expect(screen.getByTitle('More options')).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Select feature' }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});

// US 7501 (PR review): the mic can't start a new voice message while agents work - the same rule as
// Enter and the predefined prompts. Stopping an ongoing one still works.
describe('ChatInput voice input while agents work (US 7501)', () => {
  const voiceProps = { ...baseProps, isVoiceChatEnabled: true, isVoiceChatConnected: true };

  it('does not start voice input while working', async () => {
    const user = userEvent.setup();
    const onStartListening = vi.fn();
    render(<ChatInput {...voiceProps} isWorking onStop={vi.fn()} onStartListening={onStartListening} />);

    const mic = screen.getByRole('button', { name: 'Start voice input' });
    expect(mic).toBeDisabled();
    await user.click(mic);
    expect(onStartListening).not.toHaveBeenCalled();
  });

  it('still lets an ongoing voice input be stopped while working', async () => {
    const user = userEvent.setup();
    const onStopListening = vi.fn();
    render(<ChatInput {...voiceProps} isWorking isListening onStop={vi.fn()} onStopListening={onStopListening} />);

    await user.click(screen.getByRole('button', { name: 'Stop voice input' }));
    expect(onStopListening).toHaveBeenCalled();
  });

  it('can start voice input again once the work ends or after Stop', async () => {
    const user = userEvent.setup();
    const onStartListening = vi.fn();
    const Harness = () => {
      const [working, setWorking] = React.useState(true);
      return <ChatInput {...voiceProps} isWorking={working} onStop={() => setWorking(false)} onStartListening={onStartListening} />;
    };
    render(<Harness />);
    expect(screen.getByRole('button', { name: 'Start voice input' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Stop all agents' }));

    const mic = screen.getByRole('button', { name: 'Start voice input' });
    expect(mic).toBeEnabled();
    await user.click(mic);
    expect(onStartListening).toHaveBeenCalledTimes(1);
  });
});

// US 7501 (PR review): Send and Stop swap places, so focus must not fall to <body>.
describe('ChatInput keyboard focus when Send and Stop swap (US 7501)', () => {
  // Mirrors AgentChatInterface: sending disables the textarea until the request is done, and work
  // starts at once; Stop ends it.
  const Harness: React.FC<{ onStop?: () => void }> = ({ onStop }) => {
    const [working, setWorking] = React.useState(false);
    const [loading, setLoading] = React.useState(false);
    const send = () => {
      setWorking(true);
      setLoading(true);
      setTimeout(() => setLoading(false), 0);
    };
    return (
      <ChatInput
        {...baseProps}
        inputValue="hello"
        isLoading={loading}
        isWorking={working}
        isVoiceChatEnabled={false}
        onSendMessage={send}
        onStop={() => { onStop?.(); setWorking(false); }}
      />
    );
  };

  async function tabTo(user: ReturnType<typeof userEvent.setup>, element: HTMLElement) {
    for (let i = 0; i < 10 && document.activeElement !== element; i++) {
      await user.tab();
    }
    expect(element).toHaveFocus();
  }

  it.each(['{Enter}', ' '])('moves focus to the textarea after Stop is pressed with %s', async (key) => {
    const onStop = vi.fn();
    const user = userEvent.setup();
    render(<Harness onStop={onStop} />);
    // Start working with Send (the last button), pressed from the keyboard.
    const buttons = screen.getAllByRole('button');
    const send = buttons[buttons.length - 1];
    await tabTo(user, send);
    await user.keyboard('{Enter}');
    const stop = await screen.findByRole('button', { name: 'Stop all agents' });

    await tabTo(user, stop);
    await user.keyboard(key);

    expect(onStop).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Stop all agents' })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveFocus();
    expect(document.body).not.toHaveFocus();
  });

  it('keeps focus in the textarea when Send pressed from the keyboard turns into Stop', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const buttons = screen.getAllByRole('button');
    const send = buttons[buttons.length - 1];

    await tabTo(user, send);
    await user.keyboard('{Enter}');

    expect(await screen.findByRole('button', { name: 'Stop all agents' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('textbox')).toHaveFocus());
    expect(document.body).not.toHaveFocus();
  });

  it('does not take focus back when the user has moved on before the textarea is usable', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Harness />
        <button type="button">Elsewhere</button>
      </>
    );
    const elsewhere = screen.getByRole('button', { name: 'Elsewhere' });
    const buttons = screen.getAllByRole('button').filter(button => button !== elsewhere);
    const send = buttons[buttons.length - 1];

    await tabTo(user, send);
    await user.keyboard('{Enter}');
    await user.click(elsewhere);
    await screen.findByRole('button', { name: 'Stop all agents' });
    await waitFor(() => expect(screen.getByRole('textbox')).toBeEnabled());

    expect(elsewhere).toHaveFocus();
  });
});

// US 7500 (Task 7925): the Chat UI (isWidget = false) gets the MAISY composer design; the Chat
// Widget (isWidget = true) keeps today's composer.
describe('ChatInput composer design (US 7500)', () => {
  describe('Chat UI (isWidget = false)', () => {
    it('renders one bordered box holding the textarea and the toolbar', () => {
      render(<ChatInput {...baseProps} isWidget={false} onToggleFeatureSelection={vi.fn()} isVoiceChatEnabled />);

      const box = screen.getByTestId('chat-composer-box');
      expect(box).toHaveStyle({ borderRadius: '14px', padding: '8px 8px 8px 12px', flexDirection: 'column', gap: '8px' });
      expect(box.style.border).toBe('1px solid rgb(209, 213, 219)');

      const textarea = screen.getByRole('textbox');
      expect(box).toContainElement(textarea);
      expect(textarea.style.borderStyle).toBe('none');

      expect(box).toContainElement(screen.getByTitle('More options'));
      expect(box).toContainElement(screen.getByRole('button', { name: 'Select feature' }));
      expect(box).toContainElement(screen.getByRole('button', { name: 'Start voice input' }));
      expect(box).toContainElement(screen.getByRole('button', { name: 'Send message' }));
    });

    it('puts the attached file chips inside the box, above the textarea', () => {
      const file = new File(['x'], 'notes.txt', { type: 'text/plain' });
      render(<ChatInput {...baseProps} isWidget={false} selectedFiles={[file]} />);

      const box = screen.getByTestId('chat-composer-box');
      const chip = screen.getByText(/notes\.txt/);
      expect(box).toContainElement(chip);
      expect(chip.compareDocumentPosition(screen.getByRole('textbox')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('gives the box border the brand green while a feature is being picked (US 7503)', () => {
      render(<ChatInput {...baseProps} isWidget={false} isFeatureSelectionActive onToggleFeatureSelection={vi.fn()} />);

      expect(screen.getByTestId('chat-composer-box').style.border).toBe('1px solid rgb(69, 177, 154)');
    });

    it('renders a disabled grey round Send when there is nothing to send', () => {
      render(<ChatInput {...baseProps} isWidget={false} primaryColor="#ff0000" />);

      const send = screen.getByRole('button', { name: 'Send message' });
      expect(send).toBeDisabled();
      expect(send).toHaveStyle({ width: '34px', height: '34px', borderRadius: '9999px', backgroundColor: '#e5e7eb' });
    });

    it('renders an enabled round Send in the chat colour when there is text', async () => {
      const onSendMessage = vi.fn();
      const user = userEvent.setup();
      render(<ChatInput {...baseProps} isWidget={false} inputValue="hello" primaryColor="#ff0000" foregroundColor="#ffffff" onSendMessage={onSendMessage} />);

      const send = screen.getByRole('button', { name: 'Send message' });
      expect(send).toBeEnabled();
      expect(send).toHaveStyle({ backgroundColor: '#ff0000', color: '#ffffff' });
      await user.click(send);
      expect(onSendMessage).toHaveBeenCalledTimes(1);
    });

    it('enables Send when only files are attached', () => {
      const file = new File(['x'], 'notes.txt', { type: 'text/plain' });
      render(<ChatInput {...baseProps} isWidget={false} selectedFiles={[file]} />);

      expect(screen.getByRole('button', { name: 'Send message' })).toBeEnabled();
    });

    it.each([
      ['disconnected', { connectionError: true }],
      ['loading', { isLoading: true }],
    ])('keeps Send disabled and grey while %s, even with text', (_label, props) => {
      render(<ChatInput {...baseProps} isWidget={false} inputValue="hello" primaryColor="#ff0000" {...props} />);

      const send = screen.getByRole('button', { name: 'Send message' });
      expect(send).toBeDisabled();
      expect(send).toHaveStyle({ backgroundColor: '#e5e7eb' });
    });

    it('shows Stop in the Send slot, inside the box, while working', () => {
      render(<ChatInput {...baseProps} isWidget={false} inputValue="hello" isWorking onStop={vi.fn()} isVoiceChatEnabled />);

      const stop = screen.getByRole('button', { name: 'Stop all agents' });
      expect(screen.queryByRole('button', { name: 'Send message' })).not.toBeInTheDocument();
      expect(screen.getByTestId('chat-composer-box')).toContainElement(stop);
      // Same slot as Send: the last control of the toolbar, right after the mic.
      const mic = screen.getByRole('button', { name: 'Start voice input' });
      expect(mic.nextElementSibling).toBe(stop);
      expect(stop.parentElement?.lastElementChild).toBe(stop);
    });
  });

  describe('Chat Widget (isWidget = true)', () => {
    it('keeps the classic composer: no box, a bordered textarea and the square Send', () => {
      const { container } = render(<ChatInput {...baseProps} isWidget inputValue="hello" primaryColor="#ff0000" />);

      expect(screen.queryByTestId('chat-composer-box')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Send message' })).not.toBeInTheDocument();

      const textarea = screen.getByRole('textbox');
      expect(textarea).toHaveStyle({ padding: '10px 12px', borderRadius: '0.375rem' });
      expect(textarea.style.border).toBe('1px solid rgb(209, 213, 219)');

      // The outer composer holds the textarea wrapper and the toolbar directly, as before.
      const composer = container.firstElementChild as HTMLElement;
      expect(composer).toHaveClass('border-t');
      expect(textarea.parentElement?.parentElement).toBe(composer);

      const send = container.querySelector('button.px-3') as HTMLButtonElement;
      expect(send).toBeEnabled();
      expect(send).toHaveClass('disabled:opacity-50');
      expect(send).toHaveStyle({ height: '32px', borderRadius: '9px', backgroundColor: '#ff0000' });
      expect(send.querySelector('svg.lucide-send')).not.toBeNull();
    });

    it('keeps the 32px Stop pill in the Send slot while working', () => {
      render(<ChatInput {...baseProps} isWidget isWorking onStop={vi.fn()} />);

      expect(screen.getByRole('button', { name: 'Stop all agents' })).toHaveStyle({ height: '32px' });
    });
  });
});

// US 7500 (MAISY design): the Chat UI's idle placeholder names the agent; the widget keeps its texts.
describe('ChatInput idle placeholder', () => {
  const helpers: SpinUpAgentTarget[] = [{ name: 'Content Helper' }];
  const textbox = () => screen.getByRole('textbox');

  describe('Chat UI (isWidget = false)', () => {
    it('reads "Ask <agent>, or type @ to call an agent" when there are agents to call', () => {
      render(<ChatInput {...baseProps} isWidget={false} agentName="MAISY" agents={helpers} />);

      expect(textbox()).toHaveAttribute('placeholder', 'Ask MAISY, or type @ to call an agent');
    });

    it('reads "Ask <agent>" when there are no agents to call', () => {
      const { rerender } = render(<ChatInput {...baseProps} isWidget={false} agentName="MAISY" />);
      expect(textbox()).toHaveAttribute('placeholder', 'Ask MAISY');

      rerender(<ChatInput {...baseProps} isWidget={false} agentName="MAISY" agents={[]} />);
      expect(textbox()).toHaveAttribute('placeholder', 'Ask MAISY');
    });

    it('uses the same text when voice input is ready, instead of "Ready to Chat"', () => {
      render(<ChatInput {...baseProps} isWidget={false} agentName="MAISY" agents={helpers} isVoiceChatEnabled isVoiceChatConnected />);

      expect(textbox()).toHaveAttribute('placeholder', 'Ask MAISY, or type @ to call an agent');
      expect(screen.getByRole('button', { name: 'Start voice input' })).toHaveAttribute('title', 'Ask MAISY, or type @ to call an agent');
    });

    it('keeps the transient voice texts', () => {
      const voice = { ...baseProps, isWidget: false, agentName: 'MAISY', agents: helpers, isVoiceChatEnabled: true, isVoiceChatConnected: true };
      const { rerender } = render(<ChatInput {...voice} isListening />);
      expect(textbox()).toHaveAttribute('placeholder', 'Listening...');

      rerender(<ChatInput {...voice} isAISpeaking />);
      expect(textbox()).toHaveAttribute('placeholder', 'AI Speaking...');

      rerender(<ChatInput {...voice} streamingActive />);
      expect(textbox()).toHaveAttribute('placeholder', 'AI Streaming...');

      rerender(<ChatInput {...voice} connectionError />);
      expect(textbox()).toHaveAttribute('placeholder', 'Connection Error');

      rerender(<ChatInput {...voice} isVoiceBlocked />);
      expect(textbox()).toHaveAttribute('placeholder', 'Answer the permission request above to continue');
    });

    it('falls back to "Type your message..." without an agent name', () => {
      const { rerender } = render(<ChatInput {...baseProps} isWidget={false} agents={helpers} />);
      expect(textbox()).toHaveAttribute('placeholder', 'Type your message...');

      rerender(<ChatInput {...baseProps} isWidget={false} agentName="   " agents={helpers} />);
      expect(textbox()).toHaveAttribute('placeholder', 'Type your message...');
    });
  });

  describe('Chat Widget (isWidget = true) is unchanged', () => {
    it('keeps "Type your message..." and "Ready to Chat", even with an agent name and agents', () => {
      const { rerender } = render(<ChatInput {...baseProps} isWidget agentName="MAISY" agents={helpers} />);
      expect(textbox()).toHaveAttribute('placeholder', 'Type your message...');

      rerender(<ChatInput {...baseProps} isWidget agentName="MAISY" agents={helpers} isVoiceChatEnabled isVoiceChatConnected />);
      expect(textbox()).toHaveAttribute('placeholder', 'Ready to Chat');

      rerender(<ChatInput {...baseProps} isWidget agentName="MAISY" agents={helpers} isVoiceChatEnabled isVoiceChatConnected isListening />);
      expect(textbox()).toHaveAttribute('placeholder', 'Listening...');
    });
  });
});

// US 7503 (Task 7926): in the Chat UI (isWidget = false) "Select feature" is a 34px round icon
// button with a tooltip; the Chat Widget keeps the text pill.
describe('ChatInput Select feature icon (US 7503)', () => {
  const renderChatUI = (props: Partial<React.ComponentProps<typeof ChatInput>> = {}) =>
    render(<ChatInput {...baseProps} isWidget={false} onToggleFeatureSelection={vi.fn()} {...props} />);
  const featureButton = () => screen.getByRole('button', { name: 'Select feature' });

  it('replaces the text pill with an icon button named "Select feature", next to "+"', () => {
    renderChatUI();

    const button = featureButton();
    expect(button).toHaveTextContent('');
    // The design's Material Symbols ads_click icon at 21px, not a lucide icon.
    const icon = within(button).getByTestId('ads-click-icon');
    expect(icon).toHaveAttribute('width', '21');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
    expect(icon).toHaveAttribute('data-filled', 'false');
    expect(icon.getAttribute('class') ?? '').not.toMatch(/lucide/);
    expect(button.querySelector('svg.lucide')).toBeNull();
    expect(button).not.toHaveAttribute('title');
    expect(screen.queryByTitle('Select a feature on the page')).not.toBeInTheDocument();
    expect(screen.queryByText('Select feature')).not.toBeInTheDocument();
    // Next to "+": the "+" wrapper is the previous sibling in the toolbar's left group.
    expect(button.parentElement?.previousElementSibling).toContainElement(screen.getByTitle('More options'));
  });

  it('is a 34px round button in the same neutral shape as "+" when inactive', () => {
    renderChatUI();

    const plus = screen.getByTitle('More options');
    const button = featureButton();
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(button).toHaveStyle({ width: '34px', height: '34px' });
    for (const prop of ['width', 'height', 'borderRadius', 'backgroundColor', 'border'] as const) {
      expect(button.style[prop]).toBe(plus.style[prop]);
    }
    expect(button.style.borderRadius).toBe('50%');
    expect(button.style.backgroundColor).toBe('transparent');
  });

  it('keeps the enabled icon at 3:1 contrast or more: #6b7280 idle, #4b5563 hovered (WCAG 1.4.11)', async () => {
    const user = userEvent.setup();
    renderChatUI();
    const button = featureButton();

    expect(button).toHaveStyle({ color: '#6b7280' });
    await user.hover(button);
    expect(button).toHaveStyle({ color: '#4b5563' });
    await user.unhover(button);
    expect(button).toHaveStyle({ color: '#6b7280' });
  });

  it('uses the light grey only while disabled, and the brand green while selecting', async () => {
    const user = userEvent.setup();
    const { rerender } = renderChatUI({ isLoading: true });
    const button = featureButton();
    expect(button).toBeDisabled();
    expect(button).toHaveStyle({ color: '#9ca3af' });
    await user.hover(button);
    expect(button).toHaveStyle({ color: '#9ca3af' });

    rerender(<ChatInput {...baseProps} isWidget={false} isFeatureSelectionActive onToggleFeatureSelection={vi.fn()} />);
    expect(featureButton()).toHaveStyle({ color: '#00806a' });
  });

  it('shows the tooltip on hover and hides it on pointer leave', async () => {
    const user = userEvent.setup();
    renderChatUI();
    const button = featureButton();
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    await user.hover(button);
    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toHaveTextContent(/^Select a feature$/);
    expect(button).toHaveAttribute('aria-describedby', tooltip.id);
    expect(button).toHaveAccessibleDescription('Select a feature');

    await user.unhover(button);
    // It closes after a short delay, so the pointer can reach it first (WCAG 1.4.13).
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
  });

  it('keeps the tooltip open while the pointer moves from the button onto it (WCAG 1.4.13)', async () => {
    const user = userEvent.setup();
    renderChatUI();
    const button = featureButton();

    await user.hover(button);
    const tooltip = screen.getByRole('tooltip');
    // Not pointer-events: none, and bridged down to the button across the gap.
    expect(tooltip.style.pointerEvents).not.toBe('none');
    const bridge = within(tooltip).getByTestId('chat-feature-select-tooltip-bridge');
    expect(bridge).toHaveStyle({ position: 'absolute', top: '100%', height: '8px' });

    // Across the bridge, then onto the tooltip itself.
    await user.hover(bridge);
    await user.hover(tooltip);
    await new Promise(resolve => setTimeout(resolve, 300));
    expect(screen.getByRole('tooltip')).toHaveTextContent(/^Select a feature$/);

    // Back onto the button: still open.
    await user.hover(button);
    await new Promise(resolve => setTimeout(resolve, 300));
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    // Leaving both closes it.
    await user.unhover(button);
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
  });

  it('closes when the pointer leaves the tooltip, and Escape still dismisses it while hovered', async () => {
    const user = userEvent.setup();
    renderChatUI();
    const button = featureButton();

    await user.hover(button);
    await user.hover(screen.getByRole('tooltip'));
    await user.unhover(screen.getByRole('tooltip'));
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());

    await user.hover(button);
    await user.hover(screen.getByRole('tooltip'));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('clears its close timer on unmount', async () => {
    const user = userEvent.setup();
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    const { unmount } = renderChatUI();
    await user.hover(featureButton());
    await user.unhover(featureButton());
    clearTimeoutSpy.mockClear();

    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });

  it('shows the tooltip on keyboard focus and hides it on blur', async () => {
    const user = userEvent.setup();
    renderChatUI();
    const button = featureButton();

    act(() => button.focus());
    expect(button).toHaveFocus();
    expect(screen.getByRole('tooltip')).toHaveTextContent(/^Select a feature$/);

    act(() => button.blur());
    expect(button).not.toHaveFocus();
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    // Reaching it with Tab from "+" shows it too.
    act(() => screen.getByTitle('More options').focus());
    await user.tab();
    expect(button).toHaveFocus();
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
  });

  it('shows the active state as a brand-green tinted circle with a green icon and a green box border', () => {
    renderChatUI({ isFeatureSelectionActive: true });

    const button = featureButton();
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(button).toHaveStyle({ width: '34px', height: '34px', borderRadius: '50%', backgroundColor: '#e0f5f0', color: '#00806a' });
    expect(within(button).getByTestId('ads-click-icon')).toHaveAttribute('data-filled', 'true');
    expect(screen.getByTestId('chat-composer-box').style.border).toBe('1px solid rgb(69, 177, 154)');
  });

  it('keeps the neutral box border when not selecting', () => {
    renderChatUI();

    expect(screen.getByTestId('chat-composer-box').style.border).toBe('1px solid rgb(209, 213, 219)');
  });

  it('toggles: clicking enters selection mode and clicking again exits it', async () => {
    const user = userEvent.setup();
    const Harness = () => {
      const [active, setActive] = React.useState(false);
      return (
        <ChatInput {...baseProps} isWidget={false} isFeatureSelectionActive={active} onToggleFeatureSelection={() => setActive(a => !a)} />
      );
    };
    render(<Harness />);

    await user.click(featureButton());
    expect(featureButton()).toHaveAttribute('aria-pressed', 'true');
    expect(featureButton()).toHaveStyle({ backgroundColor: '#e0f5f0' });
    expect(screen.getByTestId('chat-composer-box').style.border).toBe('1px solid rgb(69, 177, 154)');

    await user.click(featureButton());
    expect(featureButton()).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('chat-composer-box').style.border).toBe('1px solid rgb(209, 213, 219)');
  });

  it('calls onToggleFeatureSelection once per click, and is disabled while loading like "+"', async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    const { rerender } = renderChatUI({ onToggleFeatureSelection: onToggle });

    await user.click(featureButton());
    expect(onToggle).toHaveBeenCalledTimes(1);

    rerender(<ChatInput {...baseProps} isWidget={false} isLoading onToggleFeatureSelection={onToggle} />);
    expect(featureButton()).toBeDisabled();
    expect(screen.getByTitle('More options')).toBeDisabled();
  });

  it('dismisses the tooltip with Escape, while hovered or focused, without moving focus', async () => {
    const user = userEvent.setup();
    renderChatUI();
    const button = featureButton();

    await user.hover(button);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    await user.unhover(button);

    act(() => screen.getByTitle('More options').focus());
    await user.tab();
    expect(button).toHaveFocus();
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    expect(button).toHaveFocus();

    // It shows again on the next hover.
    await user.hover(button);
    expect(screen.getByRole('tooltip')).toHaveTextContent(/^Select a feature$/);
  });

  it('is not rendered when no toggle handler is passed', () => {
    render(<ChatInput {...baseProps} isWidget={false} />);

    // The composer did render; the control is absent in every form, not just under one name.
    expect(screen.getByTestId('chat-composer-box')).toBeInTheDocument();
    expect(screen.getByTitle('More options')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Select feature' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('chat-feature-select-button')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Select a feature on the page')).not.toBeInTheDocument();
    expect(screen.queryByTestId('ads-click-icon')).not.toBeInTheDocument();
    expect(document.querySelector('svg.lucide-mouse-pointer-click')).toBeNull();
  });

  describe('Chat Widget (isWidget = true) is unchanged', () => {
    it('keeps the blue text pill with its title and no icon or tooltip', () => {
      render(<ChatInput {...baseProps} isWidget onToggleFeatureSelection={vi.fn()} />);

      const pill = screen.getByTitle('Select a feature on the page');
      expect(pill).toHaveTextContent('Select feature');
      expect(pill).toHaveStyle({ height: '32px', borderRadius: '9px', backgroundColor: 'rgb(234, 241, 255)', color: 'rgb(30, 79, 191)' });
      expect(pill.querySelector('svg')).toBeNull();
      expect(pill).not.toHaveAttribute('aria-pressed');
      expect(screen.queryByTestId('chat-feature-select-button')).not.toBeInTheDocument();
      expect(screen.queryByRole('tooltip', { hidden: true })).not.toBeInTheDocument();
    });

    it('keeps the blue active pill and no green anywhere while selecting', () => {
      const { container } = render(<ChatInput {...baseProps} isWidget isFeatureSelectionActive onToggleFeatureSelection={vi.fn()} />);

      const pill = screen.getByTitle('Stop selecting');
      expect(pill).toHaveTextContent('Click a feature…');
      expect(pill).toHaveStyle({ backgroundColor: 'rgb(62, 124, 246)', color: 'rgb(255, 255, 255)' });
      expect(pill.style.border).toBe('1px solid rgb(62, 124, 246)');
      expect(screen.queryByTestId('chat-composer-box')).not.toBeInTheDocument();
      expect(container.innerHTML).not.toMatch(/rgb\(69, 177, 154\)|rgb\(224, 245, 240\)|rgb\(0, 128, 106\)/);
    });
  });
});

describe('ChatInput selection-mode banner (US 7503)', () => {
  const banner = () => screen.getByTestId('chat-feature-selection-mode-banner');
  const queryBanner = () => screen.queryByTestId('chat-feature-selection-mode-banner');
  const liveRegion = () => screen.getByRole('status');
  const cancelButton = () => screen.getByRole('button', { name: 'Cancel' });

  // Drives isFeatureSelectionActive like AgentChatInterface does: one toggle handler for the
  // icon and Cancel, and an external "pick" that ends selection mode on its own.
  const Harness: React.FC<{ isWidget?: boolean; onToggle?: () => void; pickRef?: { current: (() => void) | null } }> = ({ isWidget = false, onToggle, pickRef }) => {
    const [active, setActive] = React.useState(false);
    if (pickRef) pickRef.current = () => setActive(false);
    return (
      <ChatInput
        {...baseProps}
        isWidget={isWidget}
        isFeatureSelectionActive={active}
        onToggleFeatureSelection={() => { onToggle?.(); setActive(a => !a); }}
      />
    );
  };

  it('is hidden while selection mode is off, with an empty live region already in place', () => {
    render(<ChatInput {...baseProps} isWidget={false} onToggleFeatureSelection={vi.fn()} />);

    expect(queryBanner()).not.toBeInTheDocument();
    expect(screen.queryByText('Click a feature on the page')).not.toBeInTheDocument();
    expect(liveRegion()).toBeEmptyDOMElement();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
  });

  it('announces through one live region that stays in the DOM: only its text changes', async () => {
    const user = userEvent.setup();
    const pickRef: { current: (() => void) | null } = { current: null };
    render(<Harness pickRef={pickRef} />);
    const region = liveRegion();
    expect(region).toHaveAttribute('role', 'status');
    expect(region).toBeEmptyDOMElement();
    // Visually hidden, and out of the column's flow so it adds no gap.
    expect(region).toHaveStyle({ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden' });

    await user.click(screen.getByRole('button', { name: 'Select feature' }));
    expect(liveRegion()).toBe(region);
    expect(region).toHaveTextContent(/^Click a feature on the page$/);

    await user.click(cancelButton());
    expect(liveRegion()).toBe(region);
    expect(region).toBeEmptyDOMElement();

    await user.click(screen.getByRole('button', { name: 'Select feature' }));
    expect(region).toHaveTextContent(/^Click a feature on the page$/);
    act(() => pickRef.current?.());
    expect(liveRegion()).toBe(region);
    expect(region).toBeEmptyDOMElement();
  });

  it('shows "Click a feature on the page" with the select-feature icon and Cancel while selection mode is on', () => {
    render(<ChatInput {...baseProps} isWidget={false} isFeatureSelectionActive onToggleFeatureSelection={vi.fn()} />);

    const status = banner();
    expect(status).toHaveTextContent(/^Click a feature on the pageCancel$/);
    // Screen readers get the text once, from the live region; the banner itself is not a region.
    expect(status).not.toHaveAttribute('role');
    expect(within(status).getByText('Click a feature on the page')).toHaveAttribute('aria-hidden', 'true');
    expect(liveRegion()).toHaveTextContent(/^Click a feature on the page$/);
    // The design's ads_click icon (filled), not a lucide icon.
    expect(status.firstElementChild).toBe(within(status).getByTestId('ads-click-icon'));
    expect(status.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    expect(status.querySelector('svg.lucide')).toBeNull();
    expect(status.lastElementChild).toBe(cancelButton());
    expect(status).toHaveStyle({
      padding: '8px 8px 8px 12px',
      borderRadius: '8px',
      backgroundColor: '#e0f5f0',
      color: '#00806a',
      fontSize: '13px',
      fontWeight: '600'
    });
    expect(status.firstElementChild).toHaveAttribute('width', '18');
    expect(status.firstElementChild).toHaveAttribute('height', '18');
  });

  it('sits directly above the composer box, outside it', () => {
    render(<ChatInput {...baseProps} isWidget={false} isFeatureSelectionActive onToggleFeatureSelection={vi.fn()} />);

    const box = screen.getByTestId('chat-composer-box');
    expect(banner().nextElementSibling).toBe(box);
    expect(box).not.toContainElement(banner());
  });

  it('Cancel exits selection mode through the same handler as the icon, removes the banner and resets the icon', async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(<Harness onToggle={onToggle} />);

    await user.click(screen.getByRole('button', { name: 'Select feature' }));
    expect(banner()).toBeInTheDocument();
    expect(onToggle).toHaveBeenCalledTimes(1);

    await user.click(cancelButton());

    expect(onToggle).toHaveBeenCalledTimes(2);
    expect(queryBanner()).not.toBeInTheDocument();
    const icon = screen.getByRole('button', { name: 'Select feature' });
    expect(icon).toHaveAttribute('aria-pressed', 'false');
    expect(icon.style.backgroundColor).toBe('transparent');
    expect(screen.getByTestId('chat-composer-box').style.border).toBe('1px solid rgb(209, 213, 219)');
  });

  it('clicking the icon again also removes the banner', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Select feature' }));
    expect(banner()).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Select feature' }));

    expect(queryBanner()).not.toBeInTheDocument();
  });

  it('goes away when selection mode ends on its own (after a pick)', async () => {
    const user = userEvent.setup();
    const pickRef: { current: (() => void) | null } = { current: null };
    render(<Harness pickRef={pickRef} />);

    await user.click(screen.getByRole('button', { name: 'Select feature' }));
    expect(banner()).toBeInTheDocument();

    act(() => pickRef.current?.());

    expect(queryBanner()).not.toBeInTheDocument();
  });

  it('Cancel is a keyboard-reachable button named "Cancel" that works with Enter and Space', async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <ChatInput {...baseProps} isWidget={false} isFeatureSelectionActive onToggleFeatureSelection={onToggle} />
    );

    expect(cancelButton()).toHaveAccessibleName('Cancel');
    expect(cancelButton()).toHaveAttribute('type', 'button');
    expect(cancelButton()).not.toHaveAttribute('tabindex');

    // Tab order: the banner comes before the composer, so Cancel is the first stop.
    await user.tab();
    expect(cancelButton()).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onToggle).toHaveBeenCalledTimes(1);

    rerender(<ChatInput {...baseProps} isWidget={false} isFeatureSelectionActive onToggleFeatureSelection={onToggle} />);
    act(() => cancelButton().focus());
    await user.keyboard(' ');
    expect(onToggle).toHaveBeenCalledTimes(2);
  });

  it('moves keyboard focus to the textarea after Cancel removes the banner', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Select feature' }));
    act(() => cancelButton().focus());
    await user.keyboard('{Enter}');

    expect(queryBanner()).not.toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveFocus();
  });

  it('is not shown when no toggle handler is passed, even if selection mode is on', () => {
    render(<ChatInput {...baseProps} isWidget={false} isFeatureSelectionActive />);

    expect(screen.getByTestId('chat-composer-box')).toBeInTheDocument();
    expect(queryBanner()).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('is never shown in the Chat Widget (isWidget = true)', async () => {
    const user = userEvent.setup();
    render(<Harness isWidget />);

    await user.click(screen.getByTitle('Select a feature on the page'));

    expect(screen.getByTitle('Stop selecting')).toBeInTheDocument();
    expect(queryBanner()).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
  });
});

describe('ChatInput pick-feature design (US 7503)', () => {
  const featureButton = () => screen.getByRole('button', { name: 'Select feature' });
  const box = () => screen.getByTestId('chat-composer-box');
  const GREEN_BORDER = '1px solid rgb(69, 177, 154)';
  const NEUTRAL_BORDER = '1px solid rgb(209, 213, 219)';

  it('shows "Cancel selecting" in the tooltip while selecting and "Select a feature" when not', async () => {
    const user = userEvent.setup();
    const Harness = () => {
      const [active, setActive] = React.useState(false);
      return <ChatInput {...baseProps} isWidget={false} isFeatureSelectionActive={active} onToggleFeatureSelection={() => setActive(a => !a)} />;
    };
    render(<Harness />);

    await user.hover(featureButton());
    expect(screen.getByRole('tooltip')).toHaveTextContent(/^Select a feature$/);

    await user.click(featureButton());
    expect(screen.getByRole('tooltip')).toHaveTextContent(/^Cancel selecting$/);
    expect(featureButton()).toHaveAccessibleDescription('Cancel selecting');
    expect(featureButton()).toHaveAccessibleName('Select feature');

    await user.click(featureButton());
    expect(screen.getByRole('tooltip')).toHaveTextContent(/^Select a feature$/);
  });

  it('fills the icon and adds the pulsing ring only while selecting', () => {
    const { rerender } = render(<ChatInput {...baseProps} isWidget={false} onToggleFeatureSelection={vi.fn()} />);

    expect(featureButton()).not.toHaveClass('wkflo-feature-pick-pulse');
    expect(within(featureButton()).getByTestId('ads-click-icon')).toHaveAttribute('data-filled', 'false');

    rerender(<ChatInput {...baseProps} isWidget={false} isFeatureSelectionActive onToggleFeatureSelection={vi.fn()} />);

    expect(featureButton()).toHaveClass('wkflo-feature-pick-pulse');
    expect(within(featureButton()).getByTestId('ads-click-icon')).toHaveAttribute('data-filled', 'true');
  });

  it('fills the icon in the selection-mode banner, as in the design', () => {
    render(<ChatInput {...baseProps} isWidget={false} isFeatureSelectionActive onToggleFeatureSelection={vi.fn()} />);

    const icon = within(screen.getByTestId('chat-feature-selection-mode-banner')).getByTestId('ads-click-icon');
    expect(icon).toHaveAttribute('data-filled', 'true');
    expect(icon).toHaveAttribute('width', '18');
  });

  it('keeps the composer border brand green while a picked feature is attached, not only while selecting', () => {
    const { rerender } = render(<ChatInput {...baseProps} isWidget={false} onToggleFeatureSelection={vi.fn()} />);
    expect(box().style.border).toBe(NEUTRAL_BORDER);

    rerender(<ChatInput {...baseProps} isWidget={false} hasSelectedFeature onToggleFeatureSelection={vi.fn()} />);
    expect(box().style.border).toBe(GREEN_BORDER);

    rerender(<ChatInput {...baseProps} isWidget={false} hasSelectedFeature isFeatureSelectionActive onToggleFeatureSelection={vi.fn()} />);
    expect(box().style.border).toBe(GREEN_BORDER);

    // Also when the host cannot enter selection mode (no icon), as long as a feature is attached.
    rerender(<ChatInput {...baseProps} isWidget={false} hasSelectedFeature />);
    expect(box().style.border).toBe(GREEN_BORDER);
  });

  it('defines the pulse once in the shared stylesheet, only when the user allows motion', () => {
    const css = readFileSync(resolve(__dirname, '../styles/chat-components.css'), 'utf8').replace(/\r\n/g, '\n');

    expect(css).toMatch(/@keyframes wkflo-feature-pick-pulse \{\n\s*0% \{ box-shadow: 0 0 0 0 rgba\(0, 160, 133, 0\.45\); \}\n\s*100% \{ box-shadow: 0 0 0 8px rgba\(0, 160, 133, 0\); \}/);
    const media = css.slice(css.indexOf('@media (prefers-reduced-motion: no-preference) {\n    .wkflo-feature-pick-pulse'));
    expect(media).toMatch(/^@media \(prefers-reduced-motion: no-preference\) \{\n\s*\.wkflo-feature-pick-pulse \{\n\s*animation: wkflo-feature-pick-pulse 1\.4s ease-out infinite;/);
    // The animation is never applied outside that media query.
    expect(css.match(/animation: wkflo-feature-pick-pulse/g)).toHaveLength(1);
  });

  describe('Chat Widget (isWidget = true) is unchanged', () => {
    it('keeps the blue pill with its titles, no fill, no pulse, no tooltip and no box while selecting or with a feature attached', () => {
      const { container, rerender } = render(<ChatInput {...baseProps} isWidget hasSelectedFeature onToggleFeatureSelection={vi.fn()} />);

      expect(screen.getByTitle('Select a feature on the page')).toHaveTextContent('Select feature');
      expect(screen.queryByTestId('chat-composer-box')).not.toBeInTheDocument();

      rerender(<ChatInput {...baseProps} isWidget hasSelectedFeature isFeatureSelectionActive onToggleFeatureSelection={vi.fn()} />);

      const pill = screen.getByTitle('Stop selecting');
      expect(pill).toHaveTextContent('Click a feature…');
      expect(pill).not.toHaveClass('wkflo-feature-pick-pulse');
      expect(pill.querySelector('svg')).toBeNull();
      expect(screen.queryByRole('tooltip', { hidden: true })).not.toBeInTheDocument();
      expect(screen.queryByText('Cancel selecting')).not.toBeInTheDocument();
      expect(container.querySelector('.wkflo-feature-pick-pulse')).toBeNull();
      expect(container.innerHTML).not.toMatch(/rgb\(69, 177, 154\)/);
    });
  });
});

describe('ChatInput selected-feature pill (Task 7941)', () => {
  const featureProps = {
    hasSelectedFeature: true,
    selectedFeatureName: 'Homepage Hero',
    selectedFeatureType: 'Text',
  };
  const queryPill = () => screen.queryByTestId('chat-selected-feature-pill');

  describe('Chat UI (isWidget = false)', () => {
    it('shows the pill first inside the composer box, with the icon, the name and a Remove button', () => {
      render(<ChatInput {...baseProps} {...featureProps} isWidget={false} onRemoveSelectedFeature={vi.fn()} />);

      const box = screen.getByTestId('chat-composer-box');
      const pill = within(box).getByTestId('chat-selected-feature-pill');
      expect(box.firstElementChild).toBe(pill);
      expect(pill).toHaveStyle({
        alignSelf: 'flex-start',
        display: 'inline-flex',
        gap: '4px',
        fontSize: '12px',
        fontWeight: '600',
        padding: '3px 4px 3px 6px',
        borderRadius: '999px',
        backgroundColor: 'rgb(224, 245, 240)',
        color: 'rgb(0, 128, 106)',
      });

      const icon = within(pill).getByTestId('ads-click-icon');
      expect(icon).toHaveAttribute('width', '16');
      expect(within(pill).getByTestId('chat-selected-feature-pill-name')).toHaveTextContent(/^Homepage Hero$/);

      const remove = within(pill).getByRole('button', { name: 'Remove feature Text: Homepage Hero' });
      expect(remove).toHaveAttribute('title', 'Remove');
      expect(remove).toHaveStyle({ width: '18px', height: '18px', borderRadius: '999px' });
    });

    it('shows the name only; the type is in the tooltip and the accessible label, not visible text', () => {
      render(<ChatInput {...baseProps} {...featureProps} isWidget={false} onRemoveSelectedFeature={vi.fn()} />);

      const pill = screen.getByTestId('chat-selected-feature-pill');
      expect(pill).toHaveTextContent(/^Homepage Hero$/);
      expect(screen.getByTestId('chat-selected-feature-pill-name')).toHaveAttribute('title', 'Text: Homepage Hero');
      expect(within(pill).getByRole('button')).toHaveAccessibleName('Remove feature Text: Homepage Hero');
    });

    it('truncates a long name with an ellipsis', () => {
      render(<ChatInput {...baseProps} {...featureProps} isWidget={false} onRemoveSelectedFeature={vi.fn()} />);

      expect(screen.getByTestId('chat-selected-feature-pill')).toHaveStyle({ maxWidth: '100%' });
      expect(screen.getByTestId('chat-selected-feature-pill-name')).toHaveStyle({
        minWidth: '0',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      });
    });

    it('calls onRemoveSelectedFeature when Remove is clicked', async () => {
      const onRemove = vi.fn();
      const user = userEvent.setup();
      render(<ChatInput {...baseProps} {...featureProps} isWidget={false} onRemoveSelectedFeature={onRemove} />);

      await user.click(screen.getByRole('button', { name: 'Remove feature Text: Homepage Hero' }));

      expect(onRemove).toHaveBeenCalledTimes(1);
    });

    it('returns keyboard focus to the textarea after Remove is used from the keyboard', async () => {
      const user = userEvent.setup();
      const { rerender } = render(<ChatInput {...baseProps} {...featureProps} isWidget={false} onRemoveSelectedFeature={vi.fn()} />);
      const remove = screen.getByRole('button', { name: 'Remove feature Text: Homepage Hero' });
      remove.focus();

      await user.keyboard('{Enter}');
      rerender(<ChatInput {...baseProps} isWidget={false} onRemoveSelectedFeature={vi.fn()} />);

      expect(queryPill()).not.toBeInTheDocument();
      expect(screen.getByRole('textbox')).toHaveFocus();
    });

    it('keeps the brand-green composer border while the pill is shown', () => {
      render(<ChatInput {...baseProps} {...featureProps} isWidget={false} onRemoveSelectedFeature={vi.fn()} />);

      expect(screen.getByTestId('chat-composer-box').style.border).toBe('1px solid rgb(69, 177, 154)');
    });

    it('shows no pill when no feature is selected', () => {
      render(<ChatInput {...baseProps} isWidget={false} onRemoveSelectedFeature={vi.fn()} />);

      expect(queryPill()).not.toBeInTheDocument();
      expect(screen.queryByTestId('ads-click-icon')).not.toBeInTheDocument();
    });
  });

  describe('Chat Widget (isWidget = true) - Task 7943', () => {
    it('shows the same pill directly above the textarea, outside any composer box', () => {
      render(<ChatInput {...baseProps} {...featureProps} isWidget onRemoveSelectedFeature={vi.fn()} />);

      expect(screen.queryByTestId('chat-composer-box')).not.toBeInTheDocument();
      const pill = screen.getByTestId('chat-selected-feature-pill');
      expect(pill.nextElementSibling).toContainElement(screen.getByRole('textbox'));
      expect(pill).toHaveStyle({
        alignSelf: 'flex-start',
        display: 'inline-flex',
        marginBottom: '3px',
        backgroundColor: 'rgb(224, 245, 240)',
        color: 'rgb(0, 128, 106)',
      });
      expect(within(pill).getByTestId('ads-click-icon')).toHaveAttribute('width', '16');
      expect(pill).toHaveTextContent(/^Homepage Hero$/);
      expect(screen.getByTestId('chat-selected-feature-pill-name')).toHaveAttribute('title', 'Text: Homepage Hero');
      expect(within(pill).getByRole('button', { name: 'Remove feature Text: Homepage Hero' })).toHaveAttribute('title', 'Remove');
    });

    it('calls onRemoveSelectedFeature and returns keyboard focus to the textarea', async () => {
      const onRemove = vi.fn();
      const user = userEvent.setup();
      const { rerender } = render(<ChatInput {...baseProps} {...featureProps} isWidget onRemoveSelectedFeature={onRemove} />);
      screen.getByRole('button', { name: 'Remove feature Text: Homepage Hero' }).focus();

      await user.keyboard('{Enter}');
      rerender(<ChatInput {...baseProps} isWidget onRemoveSelectedFeature={onRemove} />);

      expect(onRemove).toHaveBeenCalledTimes(1);
      expect(queryPill()).not.toBeInTheDocument();
      expect(screen.getByRole('textbox')).toHaveFocus();
    });

    it('keeps the textarea border unchanged while a feature is attached', () => {
      render(<ChatInput {...baseProps} {...featureProps} isWidget onRemoveSelectedFeature={vi.fn()} />);

      expect(screen.getByRole('textbox').style.border).toBe('1px solid rgb(209, 213, 219)');
    });

    it('shows no pill when no feature is selected', () => {
      render(<ChatInput {...baseProps} isWidget onRemoveSelectedFeature={vi.fn()} />);

      expect(queryPill()).not.toBeInTheDocument();
    });
  });
});
