import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AgentChatInterface, AgentConfig } from './agent-chat-interface';
import { ChatMessagesProvider } from '../provider/chat-messages-provider';
import { ChatServiceFactory } from '../services/chat-service.factory';
import type { ConnectionPhase } from '../services/signalr-service';

// US 7550: MAISY agents get the MAISY top bar - the connection status under the title, a banner
// while reconnecting or disconnected (with Retry), and a composer that keeps the draft offline.
// Every other agent keeps the classic header.

vi.mock('../services/chat-service.factory', () => ({
  ChatServiceFactory: { createPublicChatService: vi.fn() },
}));

function createFakeChatService() {
  const state: { phase: ConnectionPhase; connection?: (isConnected: boolean) => void } = { phase: 'connected' };
  const service = {
    state,
    // Moves the fake connection to `phase` and tells the subscribers, like SignalRService does.
    setPhase(phase: ConnectionPhase) {
      state.phase = phase;
      state.connection?.(phase === 'connected');
    },
    initialize: vi.fn().mockResolvedValue(undefined),
    getConnectionState: vi.fn(() => (state.phase === 'connected' ? 'Connected' : 'Disconnected')),
    getConnectionPhase: vi.fn(() => state.phase),
    get isConnected() { return state.phase === 'connected'; },
    disconnect: vi.fn().mockResolvedValue(undefined),
    onMessageUpdate: vi.fn().mockReturnValue(() => {}),
    onToolExecutionUpdate: vi.fn().mockReturnValue(() => {}),
    onSubAgentActivityUpdate: vi.fn().mockReturnValue(() => {}),
    onStreamingToken: vi.fn().mockReturnValue(() => {}),
    onStreamingAudio: vi.fn().mockReturnValue(() => {}),
    onTypingIndicator: vi.fn().mockReturnValue(() => {}),
    onConversationStateUpdate: vi.fn().mockReturnValue(() => {}),
    onContactFormRequest: vi.fn().mockReturnValue(() => {}),
    onContactFormCompleted: vi.fn().mockReturnValue(() => {}),
    onToolApprovalRequest: vi.fn().mockReturnValue(() => {}),
    onToolApprovalResolved: vi.fn().mockReturnValue(() => {}),
    onConversationStopped: vi.fn().mockReturnValue(() => {}),
    clearQueuedStreamingTokens: vi.fn(),
    stopAllAgents: vi.fn().mockResolvedValue({ success: true }),
    respondToToolApproval: vi.fn().mockResolvedValue({ success: true }),
    onConnectionStatusChange: vi.fn((handler: (isConnected: boolean) => void) => {
      state.connection = handler;
      handler(state.phase === 'connected');
      return () => {};
    }),
    readMessages: vi.fn().mockResolvedValue({ success: true, data: { data: [] } }),
    getSessionWorkingState: vi.fn().mockResolvedValue({ isWorking: false }),
    listConversations: vi.fn().mockResolvedValue({ success: true, data: [] }),
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
  return service;
}

const baseAgent: AgentConfig = {
  tenantGuid: 'tenant-guid',
  agentName: 'MAISY',
  primaryColor: '#e0f5f0',
  foregroundColor: '#1f2523',
  bubbleStyle: 'rounded',
  showDescription: false,
  chainOfThought: false,
  apiEndpoint: 'https://api.example.com',
  isVoiceChatEnabled: false,
  shareId: 'share-top-bar',
  securityConfiguration: { type: 'none' },
};

const maisyAgent: AgentConfig = { ...baseAgent, isMaisyAgent: true };

async function setup(agent: AgentConfig) {
  const service = createFakeChatService();
  vi.mocked(ChatServiceFactory.createPublicChatService).mockReturnValue(service as any);
  render(
    <ChatMessagesProvider>
      <AgentChatInterface agent={agent} />
    </ChatMessagesProvider>
  );
  await waitFor(() => expect(service.onConnectionStatusChange).toHaveBeenCalled());
  return service;
}

describe('AgentChatInterface — MAISY top bar (US 7550)', () => {
  beforeEach(() => {
    vi.mocked(ChatServiceFactory.createPublicChatService).mockReset();
    localStorage.clear();
  });

  it('keeps the classic header for an agent that is not MAISY', async () => {
    await setup(baseAgent);

    expect(screen.queryByTestId('maisy-chat-header')).not.toBeInTheDocument();
    expect(screen.queryByTestId('maisy-connection-status')).not.toBeInTheDocument();
    expect(screen.getByTitle('Reset Session')).toBeInTheDocument();
    expect(screen.getByTitle('Load Message History')).toBeInTheDocument();
  });

  it('uses the MAISY top bar for a MAISY agent, with its colours from the chat settings', async () => {
    await setup(maisyAgent);

    const header = screen.getByTestId('maisy-chat-header');
    expect(header).toHaveStyle({ backgroundColor: '#e0f5f0' });
    expect(screen.getByRole('heading', { name: 'MAISY' })).toHaveStyle({ color: '#1f2523' });
  });

  it('is not turned on by canSelectFeature alone', async () => {
    await setup({ ...baseAgent, canSelectFeature: true });

    expect(screen.queryByTestId('maisy-chat-header')).not.toBeInTheDocument();
  });

  it('shows Connected with no banner while connected', async () => {
    await setup(maisyAgent);

    await waitFor(() => expect(screen.getByTestId('maisy-connection-status')).toHaveTextContent('Connected'));
    expect(screen.queryByTestId('connection-banner')).not.toBeInTheDocument();
  });

  it('shows Reconnecting and its banner, without Retry, while reconnecting', async () => {
    const service = await setup(maisyAgent);

    act(() => service.setPhase('reconnecting'));

    expect(screen.getByTestId('maisy-connection-status')).toHaveTextContent('Reconnecting…');
    expect(screen.getByTestId('maisy-connection-dot')).toHaveClass('wkflo-connection-dot-pulse');
    const banner = screen.getByTestId('connection-banner');
    expect(banner).toHaveTextContent('Reconnecting to MAISY');
    expect(banner).toHaveTextContent('This usually takes a few seconds.');
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('shows Disconnected, its banner with Retry and the offline placeholder while disconnected', async () => {
    const service = await setup(maisyAgent);

    act(() => service.setPhase('disconnected'));

    expect(screen.getByTestId('maisy-connection-status')).toHaveTextContent('Disconnected');
    const banner = screen.getByTestId('connection-banner');
    expect(banner).toHaveTextContent("MAISY can't connect");
    expect(banner).toHaveTextContent('Check your internet connection. Anything you type will be kept.');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveAttribute('placeholder', 'MAISY is offline. Your message will be kept.');
  });

  it('reconnects from Retry', async () => {
    const service = await setup(maisyAgent);
    act(() => service.setPhase('disconnected'));
    service.initialize.mockClear();

    service.initialize.mockImplementation(async () => service.setPhase('connected'));
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }));

    expect(service.initialize).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByTestId('connection-banner')).not.toBeInTheDocument());
    expect(screen.getByTestId('maisy-connection-status')).toHaveTextContent('Connected');
  });

  it('keeps the draft while disconnected and sends it once connected again', async () => {
    const service = await setup(maisyAgent);
    act(() => service.setPhase('disconnected'));
    const user = userEvent.setup();

    const textbox = screen.getByRole('textbox');
    expect(textbox).not.toBeDisabled();
    await user.type(textbox, 'Draft while offline{Enter}');

    expect(service.sendMessage).not.toHaveBeenCalled();
    expect(textbox).toHaveValue('Draft while offline');
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();

    act(() => service.setPhase('connected'));
    await user.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() => expect(service.sendMessage).toHaveBeenCalledTimes(1));
    expect(service.sendMessage.mock.calls[0][0].input.text).toBe('Draft while offline');
  });
});
