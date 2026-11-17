import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { AgentChatInterface, AgentConfig } from './agent-chat-interface';
import { ChatMessagesProvider } from '../provider/chat-messages-provider';
import { ChatServiceFactory } from '../services/chat-service.factory';
import { MessageUpdate } from '../services/signalr-service';
import { FeatureContextService } from '../services/feature-context-service';

// Simulates the host page (PetraCMS) telling the iframe which feature is currently selected —
// the same SELECTED_FEATURE relay FeatureContextService listens for in production. The
// resulting setState (in TextSuggestionCard, US 6930's selection-gating) happens outside any
// React event handler, so it's wrapped in act() to flush it to the DOM before the next assertion.
function postSelectedFeature(featureId: string, featureType = 'Text', featureName = 'Some Feature') {
  act(() => {
    window.dispatchEvent(new MessageEvent('message', {
      data: { type: 'SELECTED_FEATURE', featureId, featureType, featureName },
    }));
  });
}

// Task #6795: the text-suggestion card no longer arrives over its own dedicated SignalR event.
// It's now a normal chat message on channelMessageType 4 ("Forms") whose metadata carries a
// generic { formType, data } envelope, hydrated into `message.textSuggestion` by
// hydrateFormsMetadata — exercised here both on the live path (onMessageUpdate) and on history
// load (readMessages), since that's the actual fix for the card disappearing on page refresh.

vi.mock('../services/chat-service.factory', () => ({
  ChatServiceFactory: { createPublicChatService: vi.fn() },
}));

function buildTextSuggestionMetadata(payload: { featureId: number; suggestedText: string; featureName: string }) {
  return { formType: 'TextSuggestion', data: JSON.stringify(payload) };
}

// Minimal stand-in for ChatService covering every method agent-chat-interface/use-chat call
// during mount. Captures the handler passed to onMessageUpdate so tests can drive it directly,
// and lets each test configure what readMessages resolves with (history load).
function createFakeChatService(historyMessages: any[] = []) {
  let messageHandler: ((update: MessageUpdate) => void) | null = null;

  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    getConnectionState: vi.fn().mockReturnValue('Connected'),
    disconnect: vi.fn().mockResolvedValue(undefined),
    onMessageUpdate: vi.fn((handler: (update: MessageUpdate) => void) => {
      messageHandler = handler;
      return () => { messageHandler = null; };
    }),
    // Exposes the captured handler under a test-only name (not part of the real ChatService
    // interface) so tests can trigger a "live" push without reaching into closures.
    __emitMessageUpdate: (update: MessageUpdate) => messageHandler?.(update),
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
      handler(true);
      return () => {};
    }),
    readMessages: vi.fn().mockResolvedValue({ success: true, data: { data: historyMessages } }),
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
}

const baseAgent: AgentConfig = {
  tenantGuid: 'tenant-guid',
  agentName: 'Test Agent',
  primaryColor: '#000000',
  bubbleStyle: 'rounded',
  showDescription: false,
  chainOfThought: false,
  apiEndpoint: 'https://api.example.com',
  isVoiceChatEnabled: false,
  shareId: 'share-text-suggestion',
  securityConfiguration: { type: 'none' },
};

function renderInterface(agent: AgentConfig = baseAgent) {
  return render(
    <ChatMessagesProvider>
      <AgentChatInterface agent={agent} />
    </ChatMessagesProvider>
  );
}

describe('AgentChatInterface — text suggestion card (channelMessageType 4 / Forms)', () => {
  let originalParent: Window;
  let fakeParent: { postMessage: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    originalParent = window.parent;
    fakeParent = { postMessage: vi.fn() };
    Object.defineProperty(window, 'parent', { value: fakeParent, configurable: true });

    const store = new Map<string, string>();
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
        removeItem: (key: string) => store.delete(key),
        clear: () => store.clear(),
        key: (index: number) => Array.from(store.keys())[index] ?? null,
        get length() { return store.size; },
      },
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'parent', { value: originalParent, configurable: true });
    // Prevents a selection posted by one test from leaking into the next — FeatureContextService
    // is a module-level singleton, so its selected-feature state otherwise persists across tests.
    FeatureContextService.resetInstance();
  });

  it('renders the suggestion card when a live MessageUpdate arrives with channelMessageType 4', async () => {
    const fakeChatService = createFakeChatService();
    vi.mocked(ChatServiceFactory.createPublicChatService).mockReturnValue(fakeChatService as any);

    renderInterface();

    // Wait for the session to be established (joinChat is called once a sessionId exists and
    // the service reports connected) before pushing the live update — mirrors how use-chat.ts
    // filters incoming updates by the current chatId.
    await waitFor(() => expect(fakeChatService.joinChat).toHaveBeenCalled());
    const chatId = fakeChatService.joinChat.mock.calls[0][0];

    fakeChatService.__emitMessageUpdate({
      chatId,
      message: {
        id: 'msg-live-1',
        type: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
        channelMessageType: 4,
        metadata: buildTextSuggestionMetadata({
          featureId: 42,
          suggestedText: 'Live suggested copy.',
          featureName: 'About Us',
        }),
      },
    });

    await waitFor(() => {
      expect(screen.getByText('Live suggested copy.')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Add to top' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add to bottom' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Replace all' })).toBeInTheDocument();
  });

  it('reconstructs the suggestion card from loaded history — the refresh-survival fix', async () => {
    const historyMessage = {
      id: 'msg-history-1',
      type: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      channelMessageType: 4,
      metadata: buildTextSuggestionMetadata({
        featureId: 7,
        suggestedText: 'Historical suggested copy.',
        featureName: 'Homepage',
      }),
    };
    const fakeChatService = createFakeChatService([historyMessage]);
    vi.mocked(ChatServiceFactory.createPublicChatService).mockReturnValue(fakeChatService as any);

    renderInterface();

    await waitFor(() => {
      expect(screen.getByText('Historical suggested copy.')).toBeInTheDocument();
    });
  });

  // US 6930 (Revision 2): all three actions (Add to top / Add to bottom / Replace all) hand off
  // to a Keep/Undo prompt, and both Keep and Undo loop back to the three-button view rather than
  // ending the card.
  //
  // US 6930 bug fix: apply-time targeting regressed to always hit the suggestion's own
  // featureId, ignoring the admin's actual live selection on the host page. The fix: apply
  // actions send NO featureId at all (the host resolves via its own selectedFeatureId, exactly
  // as before US 6930), while Undo is given the featureId that was *actually selected at the
  // moment the action was clicked* (captured via FeatureContextService.getCurrent(), relayed
  // from the host's SELECTED_FEATURE messages) — not the suggestion's featureId, and not
  // whatever's selected by the time Undo is clicked.
  describe('Any action -> Keep/Undo -> loops back (US 6930 Revision 2 + bug fix)', () => {
    async function renderWithLiveSuggestion(featureId: number, suggestedText: string) {
      const fakeChatService = createFakeChatService();
      vi.mocked(ChatServiceFactory.createPublicChatService).mockReturnValue(fakeChatService as any);

      renderInterface();

      await waitFor(() => expect(fakeChatService.joinChat).toHaveBeenCalled());
      const chatId = fakeChatService.joinChat.mock.calls[0][0];

      fakeChatService.__emitMessageUpdate({
        chatId,
        message: {
          id: 'msg-replace-1',
          type: 'assistant',
          content: '',
          timestamp: new Date().toISOString(),
          channelMessageType: 4,
          metadata: buildTextSuggestionMetadata({
            featureId,
            suggestedText,
            featureName: 'About Us',
          }),
        },
      });

      await waitFor(() => {
        expect(screen.getByText(suggestedText)).toBeInTheDocument();
      });
    }

    it.each([
      ['Add to top', 'top'] as const,
      ['Add to bottom', 'bottom'] as const,
      ['Replace all', 'replace'] as const,
    ])('posts INSERT_TEXT_INTO_FEATURE (mode: %s) with no featureId — never the suggestion\'s own — then shows Keep/Undo', async (buttonName, mode) => {
      await renderWithLiveSuggestion(42, 'Live suggested copy.');
      // The suggestion was generated for feature 42, but the admin has since selected a
      // different feature (99) on the host page — the action must target 99, i.e. the host's
      // own "currently selected" resolution, so the widget must not send any featureId at all.
      postSelectedFeature('99');

      fireEvent.click(screen.getByRole('button', { name: buttonName }));

      expect(fakeParent.postMessage).toHaveBeenCalledWith(
        { type: 'INSERT_TEXT_INTO_FEATURE', mode, html: 'Live suggested copy.' },
        '*'
      );
      expect(screen.queryByRole('button', { name: buttonName })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Keep' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
    });

    it('clicking Undo posts UNDO_TEXT_FEATURE with the feature that was actually selected at apply-time, and loops back to the three buttons', async () => {
      await renderWithLiveSuggestion(42, 'Another suggested copy.');
      postSelectedFeature('99');

      fireEvent.click(screen.getByRole('button', { name: 'Replace all' }));
      fakeParent.postMessage.mockClear();
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

      expect(fakeParent.postMessage).toHaveBeenCalledWith(
        { type: 'UNDO_TEXT_FEATURE', featureId: '99' },
        '*'
      );
      expect(screen.queryByRole('button', { name: 'Keep' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Add to top' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Add to bottom' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Replace all' })).toBeInTheDocument();
    });

    it('Undo still targets the feature selected at apply-time even if the selection changes before Undo is clicked', async () => {
      await renderWithLiveSuggestion(42, 'Yet another suggested copy.');
      postSelectedFeature('feature-a');

      fireEvent.click(screen.getByRole('button', { name: 'Replace all' }));

      // Admin moves on and selects a different feature on the host page before clicking Undo.
      postSelectedFeature('feature-b');
      fakeParent.postMessage.mockClear();
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

      expect(fakeParent.postMessage).toHaveBeenCalledWith(
        { type: 'UNDO_TEXT_FEATURE', featureId: 'feature-a' },
        '*'
      );
    });

    // US 6930 follow-up: the three "proposed" buttons only make sense once a text feature is
    // actually selected on the host page — with nothing selected there's nothing to apply to,
    // so they're disabled entirely (this also makes the earlier "featureId is null at apply
    // time" case unreachable through the UI: the button can't be clicked in the first place).
    it('disables the three proposed buttons with no live-tracked selection, and enables them once one arrives', async () => {
      // No postSelectedFeature call yet — getCurrent() is null.
      await renderWithLiveSuggestion(42, 'Copy with nothing selected yet.');

      expect(screen.getByRole('button', { name: 'Add to top' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Add to bottom' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Replace all' })).toBeDisabled();

      fireEvent.click(screen.getByRole('button', { name: 'Replace all' }));
      // Disabled — the click never registered, so the card is still in its proposed state and
      // never posted anything to the host.
      expect(fakeParent.postMessage).not.toHaveBeenCalled();
      expect(screen.queryByRole('button', { name: 'Keep' })).not.toBeInTheDocument();

      postSelectedFeature('feature-1');

      expect(screen.getByRole('button', { name: 'Add to top' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Add to bottom' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Replace all' })).toBeEnabled();
    });

    it('toggles proposed-button availability live as the host page selection changes while the card is on screen', async () => {
      await renderWithLiveSuggestion(42, 'Copy toggled live.');

      postSelectedFeature('feature-1');
      expect(screen.getByRole('button', { name: 'Replace all' })).toBeEnabled();

      act(() => {
        FeatureContextService.getInstance().clearSelection();
      });
      expect(screen.getByRole('button', { name: 'Replace all' })).toBeDisabled();

      postSelectedFeature('feature-2');
      expect(screen.getByRole('button', { name: 'Replace all' })).toBeEnabled();
    });

    it('does not gate Keep/Undo on selection — both stay usable even after the selection is cleared', async () => {
      await renderWithLiveSuggestion(42, 'Copy for Keep/Undo gating check.');
      postSelectedFeature('feature-1');

      fireEvent.click(screen.getByRole('button', { name: 'Replace all' }));
      expect(screen.getByRole('button', { name: 'Keep' })).toBeInTheDocument();

      // Admin deselects everything on the host page while the Keep/Undo prompt is showing.
      act(() => {
        FeatureContextService.getInstance().clearSelection();
      });

      expect(screen.getByRole('button', { name: 'Keep' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();

      fakeParent.postMessage.mockClear();
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

      expect(fakeParent.postMessage).toHaveBeenCalledWith(
        { type: 'UNDO_TEXT_FEATURE', featureId: 'feature-1' },
        '*'
      );
      // Looped back to proposed with nothing selected — visible again, but correctly disabled.
      expect(screen.getByRole('button', { name: 'Add to top' })).toBeDisabled();
    });

    it('clicking Keep sends no further postMessage and loops back to the three buttons', async () => {
      await renderWithLiveSuggestion(7, 'Yet another suggested copy.');
      postSelectedFeature('7');

      fireEvent.click(screen.getByRole('button', { name: 'Replace all' }));
      fakeParent.postMessage.mockClear();
      fireEvent.click(screen.getByRole('button', { name: 'Keep' }));

      expect(fakeParent.postMessage).not.toHaveBeenCalled();
      expect(screen.queryByRole('button', { name: 'Keep' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Add to top' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Add to bottom' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Replace all' })).toBeInTheDocument();
    });

    it('supports looping through multiple actions on the same card, each Undo referencing the feature selected for its own action', async () => {
      await renderWithLiveSuggestion(15, 'Loopable suggested copy.');
      postSelectedFeature('feature-a');

      fireEvent.click(screen.getByRole('button', { name: 'Replace all' }));
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

      // Selection moves on before the next action.
      postSelectedFeature('feature-b');
      fakeParent.postMessage.mockClear();
      fireEvent.click(screen.getByRole('button', { name: 'Add to top' }));

      expect(fakeParent.postMessage).toHaveBeenCalledWith(
        { type: 'INSERT_TEXT_INTO_FEATURE', mode: 'top', html: 'Loopable suggested copy.' },
        '*'
      );
      expect(screen.getByRole('button', { name: 'Keep' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();

      fakeParent.postMessage.mockClear();
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

      expect(fakeParent.postMessage).toHaveBeenCalledWith(
        { type: 'UNDO_TEXT_FEATURE', featureId: 'feature-b' },
        '*'
      );
    });
  });
});
