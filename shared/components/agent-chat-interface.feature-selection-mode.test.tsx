import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AgentChatInterface, AgentConfig } from './agent-chat-interface';
import { FeatureContextService } from '../services/feature-context-service';
import { AmaisCapabilitiesContextService } from '../services/amais-capabilities-context-service';
import { ChatMessagesProvider } from '../provider/chat-messages-provider';
import { ChatServiceFactory } from '../services/chat-service.factory';

// Mocked so the async-arrival test below can drive `getAgentSettings()` directly without
// spinning up a real SignalR connection or hitting the network.
vi.mock('../services/chat-service.factory', () => ({
  ChatServiceFactory: { createPublicChatService: vi.fn() },
}));

// Minimal stand-in for ChatService covering every method agent-chat-interface/use-chat call
// during mount — only `getAgentSettings` is meaningful to the tests using this.
function createFakeChatService(agentSettings: Promise<{ agentChatSettings: Partial<AgentConfig> }>) {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    getConnectionState: vi.fn().mockReturnValue('Disconnected'),
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
    onConnectionStatusChange: vi.fn().mockReturnValue(() => {}),
    readMessages: vi.fn().mockResolvedValue({ success: true, data: { data: [] } }),
    submitContactForm: vi.fn().mockResolvedValue({ success: true }),
    checkContactFormExists: vi.fn().mockResolvedValue({ exists: false }),
    rateMessage: vi.fn().mockResolvedValue({}),
    getAgentSettings: vi.fn().mockReturnValue(agentSettings),
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

function postSelectedFeature(featureId: string, featureType: string, featureName: string) {
  window.dispatchEvent(new MessageEvent('message', { data: { type: 'SELECTED_FEATURE', featureId, featureType, featureName } }));
}

function postAmaisCapabilities(selectFeature: boolean) {
  window.dispatchEvent(new MessageEvent('message', { data: { type: 'AMAIS_CAPABILITIES', capabilities: { selectFeature } } }));
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
  // Explicit static override (see canEnterFeatureSelectionMode in agent-chat-interface.tsx) —
  // most tests in this file exercise the click/enter/exit selection-mode cycle and don't care
  // about tag-gating itself, so default it on here (it also bypasses the iframe check, which
  // these tests don't need since fakeParent already simulates a real embed anyway).
  canSelectFeature: true,
};

// US 7503: in the Chat UI (isWidget = false, the default here) Select feature is an icon button
// named "Select feature"; selection mode shows as aria-pressed="true".
const featureButton = () => screen.getByRole('button', { name: 'Select feature' });
// Task 7941: in the Chat UI the picked feature shows as a pill in the composer box, not the banner.
const featurePill = () => screen.getByTestId('chat-selected-feature-pill');
const queryFeatureButton = () => screen.queryByRole('button', { name: 'Select feature' });

// Absent in every form, in a chat whose composer did render - so a renamed control can't make
// these checks pass by accident.
function expectNoFeatureControl() {
  expect(screen.getByRole('textbox')).toBeInTheDocument();
  expect(screen.getByTitle('More options')).toBeInTheDocument();
  expect(queryFeatureButton()).not.toBeInTheDocument();
  expect(screen.queryByTestId('chat-feature-select-button')).not.toBeInTheDocument();
  expect(screen.queryByTitle('Select a feature on the page')).not.toBeInTheDocument();
  expect(screen.queryByTestId('ads-click-icon')).not.toBeInTheDocument();
}

function renderInterface(agent: AgentConfig = baseAgent, requireRemoteConfig = false) {
  // Not previewMode: preview mode makes the input non-interactive (pointer-events: none),
  // and these tests need to actually click the feature-selection icon. baseAgent has no
  // shareId/securityConfiguration, so no ChatService gets created and no network calls fire.
  return render(
    <ChatMessagesProvider>
      <AgentChatInterface agent={agent} requireRemoteConfig={requireRemoteConfig} />
    </ChatMessagesProvider>
  );
}

describe('AgentChatInterface feature selection mode', () => {
  let originalParent: Window;
  let fakeParent: { postMessage: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    originalParent = window.parent;
    fakeParent = { postMessage: vi.fn() };
    Object.defineProperty(window, 'parent', { value: fakeParent, configurable: true });

    // Most tests below simulate a real iframe embed (fakeParent above) and exercise the
    // enter/exit/pick selection-mode mechanics, not the host-capability gate itself — so
    // default the host to having already confirmed the capability. The "host capability
    // gating" describe block further down overrides/omits this per-test to pin down the gate
    // itself.
    //
    // getInstance() must run before postAmaisCapabilities() here: a previous test's afterEach
    // may have called AmaisCapabilitiesContextService.resetInstance(), which tears down the
    // message listener, and no component has mounted yet in this test to recreate it via its
    // own getInstance() call — without this, the message below would be dispatched with
    // nothing listening and silently dropped.
    AmaisCapabilitiesContextService.getInstance();
    postAmaisCapabilities(true);

    // client/src/test-setup.ts replaces window.location with a plain object, which breaks
    // jsdom's origin-bound localStorage (used by session-manager.ts's getOrCreateSessionId,
    // reached only by the two async-settings tests below, which set a real shareId +
    // securityConfiguration). Stub a minimal in-memory localStorage so that path doesn't throw.
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
    FeatureContextService.resetInstance();
    AmaisCapabilitiesContextService.resetInstance();
  });

  it('posts ENTER_FEATURE_SELECTION_MODE and shows the active state when the icon is clicked', async () => {
    const user = userEvent.setup();
    renderInterface();

    await user.click(featureButton());

    expect(fakeParent.postMessage).toHaveBeenCalledWith({ type: 'ENTER_FEATURE_SELECTION_MODE' }, '*');
    expect(featureButton()).toHaveAttribute('aria-pressed', 'true');
  });

  it('posts EXIT_FEATURE_SELECTION_MODE when clicked again while active', async () => {
    const user = userEvent.setup();
    renderInterface();

    await user.click(featureButton());
    fakeParent.postMessage.mockClear();
    expect(featureButton()).toHaveAttribute('aria-pressed', 'true');
    await user.click(featureButton());

    expect(fakeParent.postMessage).toHaveBeenCalledWith({ type: 'EXIT_FEATURE_SELECTION_MODE' }, '*');
    expect(featureButton()).toHaveAttribute('aria-pressed', 'false');
  });

  it('auto-exits selection mode and posts EXIT_FEATURE_SELECTION_MODE once a feature is selected', async () => {
    const user = userEvent.setup();
    renderInterface();

    await user.click(featureButton());
    fakeParent.postMessage.mockClear();

    act(() => {
      postSelectedFeature('42', 'Text', 'Homepage Hero');
    });

    expect(fakeParent.postMessage).toHaveBeenCalledWith({ type: 'EXIT_FEATURE_SELECTION_MODE' }, '*');
    expect(featureButton()).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('chat-selected-feature-pill-name')).toHaveAttribute('title', 'Text: Homepage Hero');
  });

  it('supports a second full enter → pick → auto-exit cycle after the first', async () => {
    const user = userEvent.setup();
    renderInterface();

    // First cycle
    await user.click(featureButton());
    act(() => {
      postSelectedFeature('1', 'Text', 'Homepage Hero');
    });
    expect(featurePill()).toHaveTextContent('Homepage Hero');
    expect(featureButton()).toHaveAttribute('aria-pressed', 'false');

    // Second cycle — re-entering mode and picking a different feature
    fakeParent.postMessage.mockClear();
    await user.click(featureButton());
    expect(fakeParent.postMessage).toHaveBeenCalledWith({ type: 'ENTER_FEATURE_SELECTION_MODE' }, '*');

    act(() => {
      postSelectedFeature('2', 'Unmapped', 'Pricing Table');
    });

    expect(fakeParent.postMessage).toHaveBeenCalledWith({ type: 'EXIT_FEATURE_SELECTION_MODE' }, '*');
    expect(featureButton()).toHaveAttribute('aria-pressed', 'false');
    expect(featurePill()).toHaveTextContent('Pricing Table');
  });

  // The AMAIS_CAPABILITIES requirement applies unconditionally now — iframe-embed status no
  // longer carves out an exception. A bare top-level tab (dev/preview/direct-link) has no
  // host page that could ever send the message, so it now always stays hidden there too; see
  // the "host capability gating" describe block below for that case.
  it('keeps the feature-selection icon hidden when canSelectFeature is false, even when embedded in an iframe with the capability confirmed', () => {
    // fakeParent (from beforeEach) simulates a real iframe embed, and beforeEach already
    // posted AMAIS_CAPABILITIES{selectFeature: true} — canSelectFeature: false still hides
    // the button outright, e.g. a Share-page preview for an agent without the tag.
    renderInterface({ ...baseAgent, canSelectFeature: false });

    expectNoFeatureControl();
  });

  it('keeps the feature-selection icon hidden when canSelectFeature is omitted entirely', () => {
    renderInterface({ ...baseAgent, canSelectFeature: undefined });

    expectNoFeatureControl();
  });

  it('stops updating selection-mode state after unmount, with no stale listener or act() warning', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { unmount } = renderInterface();

    unmount();
    FeatureContextService.getInstance().enterSelectionMode();

    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('renders the feature-selection icon once canSelectFeature arrives asynchronously via getAgentSettings', async () => {
    const agentWithRemoteConfig: AgentConfig = {
      ...baseAgent,
      // No static canSelectFeature on the prop — only the (mocked) remote fetch supplies it.
      canSelectFeature: undefined,
      shareId: 'share-1',
      securityConfiguration: { type: 'none' },
    };

    vi.mocked(ChatServiceFactory.createPublicChatService).mockReturnValue(
      createFakeChatService(
        Promise.resolve({ agentChatSettings: { ...baseAgent, canSelectFeature: true } })
      ) as any
    );

    // requireRemoteConfig: true — the component renders null until the fetch resolves, which
    // is what forces the real remote-settings effect (loadAgentSettings) to actually run
    // instead of short-circuiting because remoteConfigStatus already defaults to 'ready'.
    renderInterface(agentWithRemoteConfig, true);

    await waitFor(() => {
      expect(featureButton()).toHaveAttribute('aria-pressed', 'false');
    });
  });

  it('keeps the feature-selection icon hidden when the asynchronously-fetched settings report canSelectFeature: false', async () => {
    const agentWithRemoteConfig: AgentConfig = {
      ...baseAgent,
      canSelectFeature: undefined,
      shareId: 'share-2',
      securityConfiguration: { type: 'none' },
    };

    const fakeChatService = createFakeChatService(
      Promise.resolve({ agentChatSettings: { ...baseAgent, canSelectFeature: false } })
    );
    vi.mocked(ChatServiceFactory.createPublicChatService).mockReturnValue(fakeChatService as any);

    renderInterface(agentWithRemoteConfig, true);

    // requireRemoteConfig renders null until the fetch resolves and remoteConfigStatus flips
    // to 'ready' — wait for that full render (rather than just the fetch call) before checking
    // the icon's absence, otherwise the assertion would trivially pass while still null.
    await screen.findByPlaceholderText(/^Ask Test Agent/);

    expect(fakeChatService.getAgentSettings).toHaveBeenCalled();
    expectNoFeatureControl();
  });

  it('lets a fetched remoteAgentSettings.canSelectFeature override a conflicting initial static agent.canSelectFeature once it resolves', async () => {
    // agentConfig's `{...agent, ...remoteAgentSettings}` spread must give the live fetch
    // priority over whatever static value was passed in up front (e.g. from a Share-page
    // preview) — this pins that priority down with a static/remote pair that actively
    // disagree, not just one where the static value is simply absent (unlike the two tests
    // above).
    const agentWithConflictingStaticValue: AgentConfig = {
      ...baseAgent,
      // Initial static value says "show it" — the live fetch below disagrees and must win.
      canSelectFeature: true,
      shareId: 'share-3',
      securityConfiguration: { type: 'none' },
    };

    const fakeChatService = createFakeChatService(
      Promise.resolve({ agentChatSettings: { ...baseAgent, canSelectFeature: false } })
    );
    vi.mocked(ChatServiceFactory.createPublicChatService).mockReturnValue(fakeChatService as any);

    // requireRemoteConfig: true, same reason as the tests above — otherwise remoteConfigStatus
    // defaults to 'ready' and the fetch never fires at all (see agent-chat-interface.tsx).
    renderInterface(agentWithConflictingStaticValue, true);

    await screen.findByPlaceholderText(/^Ask Test Agent/);

    // If the initial static `true` had won, the button would be visible here — it isn't,
    // proving the resolved remote `false` overrode it.
    expect(fakeChatService.getAgentSettings).toHaveBeenCalled();
    expectNoFeatureControl();
  });

  describe('selection-mode banner (US 7503)', () => {
    const queryModeBanner = () => screen.queryByTestId('chat-feature-selection-mode-banner');

    it('shows the banner while selecting and Cancel exits selection mode like clicking the icon again', async () => {
      const user = userEvent.setup();
      renderInterface();
      expect(queryModeBanner()).not.toBeInTheDocument();

      await user.click(featureButton());
      expect(screen.getByTestId('chat-feature-selection-mode-banner')).toHaveTextContent('Click a feature on the page');
      expect(screen.getByRole('status')).toHaveTextContent(/^Click a feature on the page$/);
      fakeParent.postMessage.mockClear();

      await user.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(fakeParent.postMessage).toHaveBeenCalledWith({ type: 'EXIT_FEATURE_SELECTION_MODE' }, '*');
      expect(FeatureContextService.getInstance().isSelectionModeActive()).toBe(false);
      expect(queryModeBanner()).not.toBeInTheDocument();
      expect(featureButton()).toHaveAttribute('aria-pressed', 'false');
      expect(screen.queryByTestId('feature-banner')).not.toBeInTheDocument();
    });

    it('goes away when a pick ends selection mode, and the picked feature shows as a pill in the composer', async () => {
      const user = userEvent.setup();
      renderInterface();

      await user.click(featureButton());
      expect(queryModeBanner()).toBeInTheDocument();

      act(() => {
        postSelectedFeature('42', 'Text', 'Homepage Hero');
      });

      expect(queryModeBanner()).not.toBeInTheDocument();
      expect(featureButton()).toHaveAttribute('aria-pressed', 'false');
      expect(screen.queryByTestId('feature-banner')).not.toBeInTheDocument();
      expect(featurePill()).toHaveTextContent(/^Homepage Hero$/);
      expect(screen.getByTestId('chat-selected-feature-pill-name')).toHaveAttribute('title', 'Text: Homepage Hero');
    });

    it('keeps the picked-feature pill when selecting again and cancelling', async () => {
      const user = userEvent.setup();
      renderInterface();
      act(() => {
        postSelectedFeature('42', 'Text', 'Homepage Hero');
      });

      await user.click(featureButton());
      expect(featurePill()).toHaveTextContent('Homepage Hero');
      expect(queryModeBanner()).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(queryModeBanner()).not.toBeInTheDocument();
      expect(featurePill()).toHaveTextContent('Homepage Hero');
      expect(FeatureContextService.getInstance().getCurrent()?.featureId).toBe('42');
    });

    it('keeps the composer border brand green while the picked feature is attached, until it is dismissed', async () => {
      const user = userEvent.setup();
      renderInterface();
      const box = () => screen.getByTestId('chat-composer-box');
      expect(box().style.border).toBe('1px solid rgb(209, 213, 219)');

      await user.click(featureButton());
      act(() => {
        postSelectedFeature('42', 'Text', 'Homepage Hero');
      });

      expect(featureButton()).toHaveAttribute('aria-pressed', 'false');
      expect(box().style.border).toBe('1px solid rgb(69, 177, 154)');

      await user.click(screen.getByRole('button', { name: 'Remove feature Text: Homepage Hero' }));

      expect(screen.queryByTestId('chat-selected-feature-pill')).not.toBeInTheDocument();
      expect(box().style.border).toBe('1px solid rgb(209, 213, 219)');
    });

    it('never shows the banner in the Chat Widget (isWidget = true)', async () => {
      const user = userEvent.setup();
      render(
        <ChatMessagesProvider>
          <AgentChatInterface agent={baseAgent} isWidget />
        </ChatMessagesProvider>
      );

      await user.click(screen.getByTitle('Select a feature on the page'));

      expect(FeatureContextService.getInstance().isSelectionModeActive()).toBe(true);
      expect(screen.getByTitle('Stop selecting')).toBeInTheDocument();
      expect(queryModeBanner()).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    });

    it('in the Chat Widget, a pick from the Select feature button shows the attached-feature pill (Task 7943)', async () => {
      const user = userEvent.setup();
      render(
        <ChatMessagesProvider>
          <AgentChatInterface agent={baseAgent} isWidget />
        </ChatMessagesProvider>
      );

      await user.click(screen.getByTitle('Select a feature on the page'));
      expect(fakeParent.postMessage).toHaveBeenCalledWith({ type: 'ENTER_FEATURE_SELECTION_MODE' }, '*');

      act(() => {
        postSelectedFeature('42', 'Text', 'Homepage Hero');
      });

      expect(FeatureContextService.getInstance().isSelectionModeActive()).toBe(false);
      expect(screen.getByTitle('Select a feature on the page')).toBeInTheDocument();
      expect(featurePill()).toHaveTextContent(/^Homepage Hero$/);
      expect(screen.queryByTestId('feature-banner')).not.toBeInTheDocument();
    });
  });

  describe('host capability gating', () => {
    // These cases pin down canEnterFeatureSelectionMode's AMAIS_CAPABILITIES logic directly,
    // independent of the beforeEach default (which posts AMAIS_CAPABILITIES{selectFeature:
    // true} so the rest of this file can focus on the enter/exit/pick mechanics instead). The
    // capability requirement is unconditional now — iframe-embed status no longer carves out
    // an exception, so a bare top-level tab (no host page that could ever send the message)
    // is treated the same as an embedded page whose host hasn't sent it: hidden.

    it('hides the button when not embedded in an iframe and canSelectFeature is true, with no capability message ever received', () => {
      Object.defineProperty(window, 'parent', { value: window, configurable: true });
      FeatureContextService.resetInstance();
      AmaisCapabilitiesContextService.resetInstance();

      renderInterface({ ...baseAgent, canSelectFeature: true });

      expectNoFeatureControl();
    });

    it('hides the button when embedded in an iframe and no AMAIS_CAPABILITIES message has arrived', () => {
      // fakeParent (from beforeEach) simulates a real iframe embed, but reset the
      // capabilities singleton right after so this test starts from the fail-closed default
      // (null) instead of the beforeEach's postAmaisCapabilities(true) call.
      AmaisCapabilitiesContextService.resetInstance();

      renderInterface({ ...baseAgent, canSelectFeature: true });

      expectNoFeatureControl();
    });

    it('shows the button when embedded in an iframe once AMAIS_CAPABILITIES{selectFeature: true} is received', () => {
      AmaisCapabilitiesContextService.resetInstance();
      renderInterface({ ...baseAgent, canSelectFeature: true });
      expectNoFeatureControl();

      act(() => {
        postAmaisCapabilities(true);
      });

      expect(featureButton()).toHaveAttribute('aria-pressed', 'false');
    });
  });
});
