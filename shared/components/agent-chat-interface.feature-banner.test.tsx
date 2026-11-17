import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AgentChatInterface, AgentConfig } from './agent-chat-interface';
import { FeatureContextService } from '../services/feature-context-service';
import { ChatMessagesProvider } from '../provider/chat-messages-provider';

function postSelectedFeature(featureId: string, featureType: string, featureName: string) {
  window.dispatchEvent(new MessageEvent('message', { data: { type: 'SELECTED_FEATURE', featureId, featureType, featureName } }));
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
};

// Task 7943: the Chat Widget (isWidget = true) shows the picked feature as the same pill as the
// Chat UI, directly above its textarea; the top "Targeting" banner is gone in both modes.
// Not previewMode: preview mode makes the composer non-interactive (pointer-events: none), and
// these tests click the pill's Remove button. baseAgent has no shareId/securityConfiguration, so
// no ChatService gets created and no network calls fire.
function renderInterface() {
  return render(
    <ChatMessagesProvider>
      <AgentChatInterface agent={baseAgent} isWidget />
    </ChatMessagesProvider>
  );
}

function renderChatUi() {
  return render(
    <ChatMessagesProvider>
      <AgentChatInterface agent={baseAgent} />
    </ChatMessagesProvider>
  );
}

describe('AgentChatInterface selected-feature pill (Chat Widget, isWidget = true) - Task 7943', () => {
  let originalParent: Window;
  let fakeParent: { postMessage: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    originalParent = window.parent;
    fakeParent = { postMessage: vi.fn() };
    // Simulate being embedded in an iframe so outbound messages (e.g. FEATURE_DESELECTED)
    // are observable — jsdom's default has window.parent === window, which postToParent
    // treats as "no real host", so it would otherwise no-op.
    Object.defineProperty(window, 'parent', { value: fakeParent, configurable: true });
  });

  afterEach(() => {
    Object.defineProperty(window, 'parent', { value: originalParent, configurable: true });
    FeatureContextService.resetInstance();
  });

  it('shows no pill and no banner when no feature has been selected', () => {
    renderInterface();
    expect(screen.queryByTestId('chat-selected-feature-pill')).not.toBeInTheDocument();
    expect(screen.queryByTestId('feature-banner')).not.toBeInTheDocument();
  });

  it('shows the pill directly above the textarea once SELECTED_FEATURE arrives, and no top banner', () => {
    renderInterface();

    act(() => {
      postSelectedFeature('42', 'Text', 'Homepage Hero');
    });

    expect(screen.queryByTestId('feature-banner')).not.toBeInTheDocument();
    expect(screen.queryByText('Targeting')).not.toBeInTheDocument();
    expect(screen.queryByTestId('chat-composer-box')).not.toBeInTheDocument();

    const pill = screen.getByTestId('chat-selected-feature-pill');
    expect(within(pill).getByTestId('ads-click-icon')).toBeInTheDocument();
    // Name only: the type is in the tooltip and the Remove button's accessible name.
    expect(pill).toHaveTextContent(/^Homepage Hero$/);
    expect(within(pill).getByTestId('chat-selected-feature-pill-name')).toHaveAttribute('title', 'Text: Homepage Hero');
    expect(within(pill).getByRole('button', { name: 'Remove feature Text: Homepage Hero' })).toHaveAttribute('title', 'Remove');

    // Directly above the textarea: the pill's next sibling holds the textarea.
    expect(pill.nextElementSibling).toContainElement(screen.getByRole('textbox'));
  });

  it('updates the pill for the newly selected feature when a second message arrives', () => {
    renderInterface();

    act(() => {
      postSelectedFeature('1', 'Text', 'Homepage Hero');
    });
    act(() => {
      postSelectedFeature('2', 'Unmapped', 'Pricing Table');
    });

    expect(screen.getByTestId('chat-selected-feature-pill')).toHaveTextContent(/^Pricing Table$/);
    expect(screen.getByTestId('chat-selected-feature-pill-name')).toHaveAttribute('title', 'Unmapped: Pricing Table');
  });

  it('clears the selection and stops sending feature headers when Remove is clicked', async () => {
    const user = userEvent.setup();
    renderInterface();

    act(() => {
      postSelectedFeature('42', 'Text', 'Homepage Hero');
    });
    expect(screen.getByTestId('chat-selected-feature-pill')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remove feature Text: Homepage Hero' }));

    expect(screen.queryByTestId('chat-selected-feature-pill')).not.toBeInTheDocument();
    expect(FeatureContextService.getInstance().getCurrent()).toBeNull();
    expect(fakeParent.postMessage).toHaveBeenCalledWith({ type: 'FEATURE_DESELECTED' }, '*');
  });

  it('stops updating after unmount, with no stale listener or act() warning', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { unmount } = renderInterface();

    unmount();
    postSelectedFeature('1', 'Text', 'Homepage Hero');

    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe('AgentChatInterface selected-feature pill (Chat UI, isWidget = false) - Task 7941', () => {
  let originalParent: Window;
  let fakeParent: { postMessage: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    originalParent = window.parent;
    fakeParent = { postMessage: vi.fn() };
    Object.defineProperty(window, 'parent', { value: fakeParent, configurable: true });
  });

  afterEach(() => {
    Object.defineProperty(window, 'parent', { value: originalParent, configurable: true });
    FeatureContextService.resetInstance();
  });

  it('shows no pill and no banner when no feature has been selected', () => {
    renderChatUi();
    expect(screen.queryByTestId('chat-selected-feature-pill')).not.toBeInTheDocument();
    expect(screen.queryByTestId('feature-banner')).not.toBeInTheDocument();
  });

  it('shows the picked feature as a pill inside the composer box instead of the top banner', () => {
    renderChatUi();

    act(() => {
      postSelectedFeature('42', 'Text', 'Homepage Hero');
    });

    expect(screen.queryByTestId('feature-banner')).not.toBeInTheDocument();
    expect(screen.queryByText('Targeting')).not.toBeInTheDocument();
    const pill = within(screen.getByTestId('chat-composer-box')).getByTestId('chat-selected-feature-pill');
    expect(within(pill).getByTestId('ads-click-icon')).toBeInTheDocument();
    // Name only: the type is in the tooltip and the Remove button's accessible name.
    expect(pill).toHaveTextContent(/^Homepage Hero$/);
    expect(within(pill).getByTestId('chat-selected-feature-pill-name')).toHaveAttribute('title', 'Text: Homepage Hero');
    expect(within(pill).getByRole('button', { name: 'Remove feature Text: Homepage Hero' })).toHaveAttribute('title', 'Remove');
  });

  it('updates the pill for the newly selected feature when a second message arrives', () => {
    renderChatUi();

    act(() => {
      postSelectedFeature('1', 'Text', 'Homepage Hero');
    });
    act(() => {
      postSelectedFeature('2', 'Unmapped', 'Pricing Table');
    });

    expect(screen.getByTestId('chat-selected-feature-pill')).toHaveTextContent(/^Pricing Table$/);
    expect(screen.getByTestId('chat-selected-feature-pill-name')).toHaveAttribute('title', 'Unmapped: Pricing Table');
  });

  it('dismisses the feature like the banner did when Remove is clicked', async () => {
    const user = userEvent.setup();
    renderChatUi();

    act(() => {
      postSelectedFeature('42', 'Text', 'Homepage Hero');
    });

    await user.click(screen.getByRole('button', { name: 'Remove feature Text: Homepage Hero' }));

    expect(screen.queryByTestId('chat-selected-feature-pill')).not.toBeInTheDocument();
    expect(FeatureContextService.getInstance().getCurrent()).toBeNull();
    expect(fakeParent.postMessage).toHaveBeenCalledWith({ type: 'FEATURE_DESELECTED' }, '*');
  });
});
