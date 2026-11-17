import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act, within } from '@testing-library/react';
import { ChatMessages } from './chat-messages';
import { ChatMessage } from '../services/chat-service';
import { AgentConfig } from './agent-chat-interface';
import { FeatureContextService } from '../services/feature-context-service';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Simulates the host page (PetraCMS) telling the iframe which feature is currently selected —
// the same SELECTED_FEATURE relay FeatureContextService listens for in production.
// TextSuggestionCard reads this directly (via FeatureContextService.getInstance()), not through
// ChatMessages props, so the resulting setState happens outside any React event handler — wrap
// in act() so it's flushed to the DOM before the next assertion runs.
function postSelectedFeature(featureId: string, featureType = 'Text', featureName = 'Some Feature') {
  act(() => {
    window.dispatchEvent(new MessageEvent('message', {
      data: { type: 'SELECTED_FEATURE', featureId, featureType, featureName },
    }));
  });
}

function deselectFeature() {
  act(() => {
    FeatureContextService.getInstance().clearSelection();
  });
}

// Task #6740: the bot avatar next to a message should resolve PER MESSAGE — a subagent's own
// configured WKFlo icon (message.chatbotIconUrl, stamped on the message by the backend) takes
// precedence over the host agent's icon, which is otherwise the fallback for every message in
// the conversation (as it was before this change).
const baseAgent: AgentConfig = {
  tenantGuid: 'tenant-guid',
  agentName: 'Host Agent',
  primaryColor: '#000000',
  bubbleStyle: 'rounded',
  showDescription: false,
  chainOfThought: false,
  apiEndpoint: 'https://api.example.com',
  isVoiceChatEnabled: false,
  chatbotIconPath: 'https://static.staging.wkflo.ai/tenant-a/1/host-agent-icon.png',
};

function buildMessage(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id: 'msg-1',
    type: 'assistant',
    content: 'Hello from the agent',
    timestamp: new Date(),
    channelMessageType: 1,
    ...overrides,
  };
}

function renderMessages(
  messages: ChatMessage[],
  agent: AgentConfig = baseAgent,
  getAuthHeaders?: () => Promise<Record<string, string>>,
  isWidget?: boolean
) {
  return render(
    <ChatMessages
      messages={messages}
      agent={agent}
      isLoading={false}
      typingIndicators={[]}
      authError={null}
      messagesContainerRef={{ current: null }}
      isAuthenticated={true}
      getAuthHeaders={getAuthHeaders}
      onSubmitContactForm={async () => {}}
      onSkipContactForm={() => {}}
      onAddTextSuggestionToTop={() => null}
      onAddTextSuggestionToBottom={() => null}
      onReplaceAllWithTextSuggestion={() => null}
      onKeepTextSuggestion={() => {}}
      onUndoTextSuggestion={() => {}}
      isWidget={isWidget}
    />
  );
}

describe('ChatMessages — per-message bot avatar (chatbotIconUrl)', () => {
  it('renders the message-specific chatbotIconUrl instead of the host agent icon when present', () => {
    renderMessages([
      buildMessage({
        agentId: 42,
        agentName: 'Vera',
        chatbotIconUrl: 'https://static.staging.wkflo.ai/tenant-a/42/vera-icon.png',
      }),
    ]);

    const avatar = screen.getByTestId('chat-message-bot-avatar');
    const img = avatar.querySelector('img') as HTMLImageElement;
    expect(img).toBeTruthy();
    expect(img.src).toBe('https://static.staging.wkflo.ai/tenant-a/42/vera-icon.png');
  });

  // Visual feedback follow-up: the icon must fill the round parent (no inset gap), be clipped
  // to the circle, and preserve its own aspect ratio (no stretching) instead of being forced
  // into a fixed w-9/h-9 box inside the w-10/h-10 parent.
  it('sizes the icon to fill the round parent and preserves aspect ratio via object-cover', () => {
    renderMessages([
      buildMessage({
        chatbotIconUrl: 'https://static.staging.wkflo.ai/tenant-a/42/vera-icon.png',
      }),
    ]);

    const avatar = screen.getByTestId('chat-message-bot-avatar');
    // Belt-and-suspenders with rounded-full: clips the image to the circle even if the source
    // isn't already perfectly square/round.
    expect(avatar.className).toContain('overflow-hidden');
    expect(avatar.className).toContain('rounded-full');

    const img = avatar.querySelector('img') as HTMLImageElement;
    expect(img.className).toContain('w-full');
    expect(img.className).toContain('h-full');
    expect(img.className).toContain('object-cover');
  });

  it('falls back to the host agent icon when the message has no chatbotIconUrl', () => {
    renderMessages([buildMessage({})]);

    const avatar = screen.getByTestId('chat-message-bot-avatar');
    const img = avatar.querySelector('img') as HTMLImageElement;
    expect(img).toBeTruthy();
    expect(img.src).toBe('https://static.staging.wkflo.ai/tenant-a/1/host-agent-icon.png');
  });

  it('falls back to the generic Bot glyph when neither the message nor the host agent has an icon', () => {
    renderMessages([buildMessage({})], { ...baseAgent, chatbotIconPath: undefined });

    const avatar = screen.getByTestId('chat-message-bot-avatar');
    expect(avatar.querySelector('img')).toBeNull();
    const botIcon = avatar.querySelector('svg') as SVGElement;
    expect(botIcon).toBeTruthy();
    // US 7551: the generic agent icon is the AI sparkle.
    expect(botIcon).toHaveAttribute('data-testid', 'ai-sparkle-icon');
    // Fallback glyph sizing is intentionally untouched by the fill/crop fix above — Bot has its
    // own baked-in padding, so it stays smaller than the near-fill image case.
    expect(botIcon.getAttribute('class')).toContain('w-6');
    expect(botIcon.getAttribute('class')).toContain('h-6');
  });

  it('resolves a different icon per message within the same conversation (multi-agent hand-off)', () => {
    renderMessages([
      buildMessage({
        id: 'msg-1',
        agentId: 1,
        agentName: 'Vera',
        chatbotIconUrl: 'https://static.staging.wkflo.ai/tenant-a/1/vera-icon.png',
      }),
      buildMessage({
        id: 'msg-2',
        agentId: 2,
        agentName: 'Other Agent',
        // No icon configured for this agent — falls back to the host icon, not Vera's.
      }),
    ]);

    const avatars = screen.getAllByTestId('chat-message-bot-avatar');
    expect(avatars).toHaveLength(2);

    const firstImg = avatars[0].querySelector('img') as HTMLImageElement;
    expect(firstImg.src).toBe('https://static.staging.wkflo.ai/tenant-a/1/vera-icon.png');

    const secondImg = avatars[1].querySelector('img') as HTMLImageElement;
    expect(secondImg.src).toBe('https://static.staging.wkflo.ai/tenant-a/1/host-agent-icon.png');
  });
});

// Task #6795: the text-suggestion card shown when MAISY calls suggest_text_edit for a
// selected text feature.
describe('ChatMessages — text suggestion card', () => {
  it('renders the suggested text and the three action buttons', () => {
    renderMessages([
      buildMessage({
        content: '',
        textSuggestion: {
          featureId: 42,
          suggestedText: 'This is the suggested copy.',
        },
      }),
    ]);

    expect(screen.getByText('This is the suggested copy.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add to top' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add to bottom' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Replace all' })).toBeTruthy();
  });

  // Task #7087 regression: suggestedText used to be rendered as a raw escaped JSX text child,
  // so HTML from the backend showed up as literal "<strong>...</strong>" tags instead of
  // formatted content. It must now go through the same isTextValidHtml/renderHtmlWithImages
  // pipeline every other message uses.
  it('renders HTML in the suggested text instead of showing escaped tags (Task 7087)', () => {
    renderMessages([
      buildMessage({
        content: '',
        textSuggestion: {
          featureId: 42,
          suggestedText: '<strong>Bold suggestion</strong>',
        },
      }),
    ]);

    // If this regressed to plain-text rendering, the literal tag characters would be
    // present as text and there would be no real <strong> element.
    expect(screen.queryByText('<strong>Bold suggestion</strong>')).toBeNull();
    const strong = screen.getByText('Bold suggestion');
    expect(strong.tagName).toBe('STRONG');
  });

  // Task #7087: rendering the suggestion as real HTML means it must be sanitized the same as
  // any other message — a naive tag-name whitelist alone wouldn't strip a dangerous attribute
  // or a <script> tag from otherwise "valid" tag names.
  it('sanitizes unsafe HTML in the suggested text (Task 7087)', () => {
    renderMessages([
      buildMessage({
        content: '',
        textSuggestion: {
          featureId: 42,
          suggestedText: '<div onclick="window.__pwned = true">Click me</div><script>window.__pwned = true</script>',
        },
      }),
    ]);

    const div = screen.getByText('Click me');
    expect(div.getAttribute('onclick')).toBeNull();
    expect(document.querySelector('script')).toBeNull();
    expect((window as unknown as { __pwned?: boolean }).__pwned).toBeUndefined();
  });
});

// US 6930 (Revision 2): any of the three initial actions must offer a way back — a Keep/Undo
// prompt — and both Keep and Undo must loop back to the original three-button view rather than
// ending in a terminal state, so the admin can keep applying further actions to the same card.
//
// US 6930 bug fix: the three action handlers return the featureId that was actually targeted
// (whatever's currently selected on the host page at click time — resolved upstream in
// agent-chat-interface.tsx, opaque to ChatMessages/TextSuggestionCard), and the card must carry
// that value forward to onUndo if Undo is clicked, rather than any id baked into the message.
describe('ChatMessages — text suggestion card Keep/Undo loop (US 6930)', () => {
  // These tests exercise the proposed <-> applied loop, not the selection-gating behavior
  // (covered separately below) — a feature must be selected for the "proposed" buttons to be
  // clickable at all now that US 6930 gates them on FeatureContextService.getCurrent(). Posted
  // inside renderSuggestionCard, after mount, so the (possibly freshly re-created, see
  // afterEach below) singleton's message listener is guaranteed to already be attached.
  afterEach(() => {
    FeatureContextService.resetInstance();
  });

  function buildSuggestionMessage() {
    return buildMessage({
      content: '',
      textSuggestion: {
        featureId: 42,
        suggestedText: 'This is the suggested copy.',
      },
    });
  }

  function renderSuggestionCard(overrides: {
    onAddTextSuggestionToTop?: () => string | null;
    onAddTextSuggestionToBottom?: () => string | null;
    onReplaceAllWithTextSuggestion?: () => string | null;
    onKeepTextSuggestion?: () => void;
    onUndoTextSuggestion?: (message: ChatMessage, featureId: string | null) => void;
  } = {}) {
    const result = render(
      <ChatMessages
        messages={[buildSuggestionMessage()]}
        agent={baseAgent}
        isLoading={false}
        typingIndicators={[]}
        authError={null}
        messagesContainerRef={{ current: null }}
        isAuthenticated={true}
        onSubmitContactForm={async () => {}}
        onSkipContactForm={() => {}}
        onAddTextSuggestionToTop={overrides.onAddTextSuggestionToTop ?? (() => null)}
        onAddTextSuggestionToBottom={overrides.onAddTextSuggestionToBottom ?? (() => null)}
        onReplaceAllWithTextSuggestion={overrides.onReplaceAllWithTextSuggestion ?? (() => null)}
        onKeepTextSuggestion={overrides.onKeepTextSuggestion ?? (() => {})}
        onUndoTextSuggestion={overrides.onUndoTextSuggestion ?? (() => {})}
      />
    );
    // Posted after mount so it always reaches a live listener (the singleton may have just
    // been freshly re-created by this render, after a previous test's resetInstance()).
    postSelectedFeature('some-feature');
    return result;
  }

  it.each([
    ['Add to top', 'onAddTextSuggestionToTop'] as const,
    ['Add to bottom', 'onAddTextSuggestionToBottom'] as const,
    ['Replace all', 'onReplaceAllWithTextSuggestion'] as const,
  ])('swaps to Keep/Undo after %s is clicked, and calls its handler', (buttonName, propName) => {
    const handler = vi.fn(() => null);
    renderSuggestionCard({ [propName]: handler });

    fireEvent.click(screen.getByRole('button', { name: buttonName }));

    expect(handler).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Add to top' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add to bottom' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Replace all' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Keep' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy();
  });

  it('clicking Undo calls the Undo handler with the featureId the action reported, and loops back to the three original buttons', () => {
    const onReplaceAllWithTextSuggestion = vi.fn(() => 'feature-live-selection');
    const onUndoTextSuggestion = vi.fn();
    renderSuggestionCard({ onReplaceAllWithTextSuggestion, onUndoTextSuggestion });

    fireEvent.click(screen.getByRole('button', { name: 'Replace all' }));
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

    expect(onUndoTextSuggestion).toHaveBeenCalledTimes(1);
    expect(onUndoTextSuggestion.mock.calls[0][1]).toBe('feature-live-selection');
    expect(screen.queryByRole('button', { name: 'Keep' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Add to top' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add to bottom' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Replace all' })).toBeTruthy();
  });

  it('passes null to onUndo when the action reported no currently-selected feature', () => {
    const onReplaceAllWithTextSuggestion = vi.fn(() => null);
    const onUndoTextSuggestion = vi.fn();
    renderSuggestionCard({ onReplaceAllWithTextSuggestion, onUndoTextSuggestion });

    fireEvent.click(screen.getByRole('button', { name: 'Replace all' }));
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

    expect(onUndoTextSuggestion.mock.calls[0][1]).toBeNull();
  });

  it('clicking Keep calls the Keep handler and loops back to the three original buttons', () => {
    const onKeepTextSuggestion = vi.fn();
    renderSuggestionCard({ onKeepTextSuggestion });

    fireEvent.click(screen.getByRole('button', { name: 'Add to bottom' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }));

    expect(onKeepTextSuggestion).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Keep' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Add to top' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add to bottom' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Replace all' })).toBeTruthy();
  });

  it('supports looping through multiple actions on the same card, each carrying its own captured featureId (Replace on feature A, Undo, then Add to top on feature B)', () => {
    const onReplaceAllWithTextSuggestion = vi.fn(() => 'feature-a');
    const onUndoTextSuggestion = vi.fn();
    const onAddTextSuggestionToTop = vi.fn(() => 'feature-b');
    renderSuggestionCard({ onReplaceAllWithTextSuggestion, onUndoTextSuggestion, onAddTextSuggestionToTop });

    fireEvent.click(screen.getByRole('button', { name: 'Replace all' }));
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add to top' }));
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

    expect(onReplaceAllWithTextSuggestion).toHaveBeenCalledTimes(1);
    expect(onAddTextSuggestionToTop).toHaveBeenCalledTimes(1);
    expect(onUndoTextSuggestion).toHaveBeenCalledTimes(2);
    // Selection moved between the two actions (the admin selected feature B on the host page in
    // between) — each Undo must reference the feature its own action actually targeted.
    expect(onUndoTextSuggestion.mock.calls[0][1]).toBe('feature-a');
    expect(onUndoTextSuggestion.mock.calls[1][1]).toBe('feature-b');
  });
});

// US 6930: the three "proposed" actions only make sense once a text feature is actually
// selected on the host page (apply targets "whatever's currently selected" — see
// agent-chat-interface.tsx). TextSuggestionCard reads FeatureContextService directly rather
// than through a ChatMessages prop, so these tests drive it via the same SELECTED_FEATURE
// postMessage relay the host page uses in production.
describe('ChatMessages — text suggestion card selection gating (US 6930)', () => {
  afterEach(() => {
    FeatureContextService.resetInstance();
  });

  function renderSuggestionCardNoSelection() {
    return render(
      <ChatMessages
        messages={[buildMessage({
          content: '',
          textSuggestion: { featureId: 42, suggestedText: 'This is the suggested copy.' },
        })]}
        agent={baseAgent}
        isLoading={false}
        typingIndicators={[]}
        authError={null}
        messagesContainerRef={{ current: null }}
        isAuthenticated={true}
        onSubmitContactForm={async () => {}}
        onSkipContactForm={() => {}}
        onAddTextSuggestionToTop={() => null}
        onAddTextSuggestionToBottom={() => null}
        onReplaceAllWithTextSuggestion={() => null}
        onKeepTextSuggestion={() => {}}
        onUndoTextSuggestion={() => {}}
      />
    );
  }

  it('disables all three proposed buttons and shows the warning caption when nothing is selected', () => {
    renderSuggestionCardNoSelection();

    expect(screen.getByRole('button', { name: 'Add to top' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add to bottom' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Replace all' })).toBeDisabled();
    expect(screen.getByText('Select a text feature on the page to apply this suggestion.')).toBeTruthy();
    expect(screen.queryByText('Replace all overwrites the entire text block.')).toBeNull();
  });

  it('enables the three proposed buttons and shows the normal caption once a selection arrives', () => {
    renderSuggestionCardNoSelection();

    postSelectedFeature('feature-1');

    expect(screen.getByRole('button', { name: 'Add to top' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Add to bottom' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Replace all' })).toBeEnabled();
    expect(screen.getByText('Replace all overwrites the entire text block.')).toBeTruthy();
    expect(screen.queryByText('Select a text feature on the page to apply this suggestion.')).toBeNull();
  });

  it('toggles live as the selection changes while the card is on screen (select, deselect, reselect)', () => {
    renderSuggestionCardNoSelection();
    expect(screen.getByRole('button', { name: 'Replace all' })).toBeDisabled();

    postSelectedFeature('feature-1');
    expect(screen.getByRole('button', { name: 'Replace all' })).toBeEnabled();

    deselectFeature();
    expect(screen.getByRole('button', { name: 'Replace all' })).toBeDisabled();

    postSelectedFeature('feature-2');
    expect(screen.getByRole('button', { name: 'Replace all' })).toBeEnabled();
  });

  it('does not gate Keep/Undo on selection — both remain usable with nothing selected', () => {
    const onReplaceAllWithTextSuggestion = vi.fn(() => 'feature-captured-at-apply-time');
    const onUndoTextSuggestion = vi.fn();
    render(
      <ChatMessages
        messages={[buildMessage({
          content: '',
          textSuggestion: { featureId: 42, suggestedText: 'This is the suggested copy.' },
        })]}
        agent={baseAgent}
        isLoading={false}
        typingIndicators={[]}
        authError={null}
        messagesContainerRef={{ current: null }}
        isAuthenticated={true}
        onSubmitContactForm={async () => {}}
        onSkipContactForm={() => {}}
        onAddTextSuggestionToTop={() => null}
        onAddTextSuggestionToBottom={() => null}
        onReplaceAllWithTextSuggestion={onReplaceAllWithTextSuggestion}
        onKeepTextSuggestion={() => {}}
        onUndoTextSuggestion={onUndoTextSuggestion}
      />
    );

    // Applies while a feature is selected...
    postSelectedFeature('feature-x');
    fireEvent.click(screen.getByRole('button', { name: 'Replace all' }));

    // ...then the admin deselects everything on the host page before deciding.
    deselectFeature();

    const undoButton = screen.getByRole('button', { name: 'Undo' });
    const keepButton = screen.getByRole('button', { name: 'Keep' });
    expect(undoButton).toBeEnabled();
    expect(keepButton).toBeEnabled();

    fireEvent.click(undoButton);

    expect(onUndoTextSuggestion).toHaveBeenCalledTimes(1);
    expect(onUndoTextSuggestion.mock.calls[0][1]).toBe('feature-captured-at-apply-time');
    // Looped back to proposed with nothing selected — the three buttons are visible again but
    // correctly disabled, not missing entirely.
    expect(screen.getByRole('button', { name: 'Add to top' })).toBeDisabled();
  });
});

// Task #7030: an authenticated (protected) asset URL whose underlying file was deleted or
// whose share link expired must surface image-expired.svg — not the generic "Image
// unavailable" placeholder that DownloadableImage previously rendered unconditionally for any
// auth-required source once its fetch failed, which made the onError fallback wired up below
// unreachable dead code.
describe('ChatMessages — expired/deleted asset image fallback (Task 7030)', () => {
  const getAuthHeaders = async () => ({ Authorization: 'Bearer test-token' });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('falls back to the caller-provided image-expired.svg, resolved against agent.baseUrl, instead of the generic placeholder', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('404 Not Found')));

    renderMessages(
      [buildMessage({ fileUrl: 'https://api.example.com/api/v1/asset/expired-guid' })],
      { ...baseAgent, baseUrl: 'https://wkflo.example.com' },
      getAuthHeaders
    );

    const img = await waitFor(() => screen.getByAltText('Uploaded image') as HTMLImageElement);

    // The generic "Image unavailable" placeholder must never win once the caller supplies its
    // own onError handler — that unconditional early return was the dead-code bug.
    expect(screen.queryByText('Image unavailable')).toBeNull();

    // Simulates the browser's own (unauthenticated) request for the protected src failing —
    // exactly what happens once the authenticated fetch above has already failed.
    fireEvent.error(img);

    expect(img.src).toBe('https://wkflo.example.com/assets/image-expired.svg');
    expect(img.alt).toBe('Image no longer available');
  });

  it('resolves the fallback as a root-relative path when the agent has no baseUrl (standalone main app)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('404 Not Found')));

    renderMessages(
      [buildMessage({ fileUrl: 'https://api.example.com/api/v1/asset/expired-guid' })],
      baseAgent,
      getAuthHeaders
    );

    const img = await waitFor(() => screen.getByAltText('Uploaded image') as HTMLImageElement);

    fireEvent.error(img);

    // No agent.baseUrl was supplied, so the root-relative path resolves against jsdom's
    // default test origin — same behavior as before this fix for the standalone main app.
    expect(img.src).toBe(`${window.location.origin}/assets/image-expired.svg`);
  });
});

// Task #7030 (corrected root cause): the backend does NOT return a failing fileUrl for a
// deleted/expired uploaded image. It returns a perfectly successful message whose `content`
// and/or a `contentItems` entry (named "Text Content", status "success"/200) is literally the
// sentinel string "[Image no longer available — the uploaded image has expired]". Without
// recognizing that sentinel, the UI just rendered it as plain chat text instead of showing the
// image-expired.svg placeholder.
describe('ChatMessages — expired image sentinel from content/contentItems (Task 7030)', () => {
  const sentinel = '[Image no longer available — the uploaded image has expired]';

  it('renders the image-expired.svg fallback (baseUrl-aware) instead of the literal sentinel text when it is the message content', () => {
    renderMessages(
      [buildMessage({ content: sentinel })],
      { ...baseAgent, baseUrl: 'https://wkflo.example.com' }
    );

    expect(screen.queryByText(sentinel)).toBeNull();
    const img = screen.getByAltText('Image no longer available') as HTMLImageElement;
    expect(img.src).toBe('https://wkflo.example.com/assets/image-expired.svg');
  });

  it('renders the fallback when the sentinel lives in a contentItems entry and content is empty', () => {
    renderMessages([
      buildMessage({
        content: '',
        contentItems: [
          {
            name: 'Text Content',
            data: "\n FileName: 'BlackForest-Germany-GettyImages-147180370.webp'\n FileType: 'image/webp'",
            status: 'success',
            statusCode: 200,
          },
          {
            name: 'Text Content',
            data: sentinel,
            status: 'success',
            statusCode: 200,
          },
        ],
      }),
    ]);

    // Message would otherwise have been dropped by the empty-content/no-file filter — the
    // contentItems-carried sentinel must still be enough to render it.
    const img = screen.getByAltText('Image no longer available') as HTMLImageElement;
    expect(img.src).toBe(`${window.location.origin}/assets/image-expired.svg`);
  });

  it('does not misfire on ordinary assistant prose that merely mentions image availability', () => {
    renderMessages([
      buildMessage({ content: 'Sorry, the image is no longer available right now.' }),
    ]);

    expect(screen.getByText('Sorry, the image is no longer available right now.')).toBeTruthy();
    expect(screen.queryByAltText('Image no longer available')).toBeNull();
  });
});

// US 7078: a spun-up agent's generated/edited image is sent by the backend with
// `type: 'user'` (Anthropic rejects an image content block inside an assistant turn) but flagged
// `metadata.renderAsSystem: true` so it still renders like an agent/system message — left-aligned,
// bot avatar, agent-style bubble — instead of the real-user right-aligned styling. See PLAN.md.
describe('ChatMessages — renderAsSystem-flagged User-role messages render as system-styled (US 7078)', () => {
  it('renders a User-role message with metadata.renderAsSystem left-aligned, with the bot avatar and agent-style bubble', () => {
    const { container } = renderMessages([
      buildMessage({
        type: 'user',
        content: 'Here is the generated image',
        metadata: { renderAsSystem: true },
      }),
    ]);

    // Left-aligned like an agent message, not right-aligned like a real user message.
    const row = container.querySelector('.flex.gap-2') as HTMLElement;
    expect(row.className).toContain('justify-start');
    expect(row.className).not.toContain('justify-end');

    // Bot avatar is shown (suppressed for real user messages).
    expect(screen.getByTestId('chat-message-bot-avatar')).toBeTruthy();

    // Agent-style bubble, not the user bubble color/class.
    const bubble = container.querySelector('.wkflo-chat-bubble') as HTMLElement;
    expect(bubble.className).toContain('wkflo-chat-bubble--agent');
    expect(bubble.className).not.toContain('wkflo-chat-bubble--user');
    expect(bubble.style.backgroundColor).not.toBe(baseAgent.primaryColor);
  });

  it('leaves a plain real User-role message (no renderAsSystem) unaffected — right-aligned, no avatar, user bubble color', () => {
    const { container } = renderMessages([
      buildMessage({
        type: 'user',
        content: 'Hello there',
      }),
    ]);

    const row = container.querySelector('.flex.gap-2') as HTMLElement;
    expect(row.className).toContain('justify-end');
    expect(row.className).not.toContain('justify-start');

    expect(screen.queryByTestId('chat-message-bot-avatar')).toBeNull();

    const bubble = container.querySelector('.wkflo-chat-bubble') as HTMLElement;
    expect(bubble.className).toContain('wkflo-chat-bubble--user');
    expect(bubble.className).not.toContain('wkflo-chat-bubble--agent');
  });
});

// Task #7297: a synthetic history entry pushed from a SubagentActivityUpdate SignalR event —
// reports a subagent starting/finishing work, rendered with the subagent's own avatar/name.
describe('ChatMessages — subagent activity card (Task #7297)', () => {
  it('renders the subagent name, action, and a "Working…" status while started', () => {
    renderMessages([
      buildMessage({
        type: 'tool',
        content: '',
        subAgentActivity: {
          chatId: 'chat-1',
          agentId: 7,
          agentName: 'Research Agent',
          chatbotIconUrl: 'https://static.staging.wkflo.ai/tenant-a/7/research-agent-icon.png',
          action: 'Looking up enrollment data',
          status: 'started',
        },
      }),
    ]);

    expect(screen.getByText('Research Agent')).toBeTruthy();
    expect(screen.getByText('Looking up enrollment data')).toBeTruthy();
    expect(screen.getByText('Working…')).toBeTruthy();

    // Uses the same per-message avatar plumbing as any other agent message.
    const avatar = screen.getByTestId('chat-message-bot-avatar');
    const img = avatar.querySelector('img') as HTMLImageElement;
    expect(img.src).toBe('https://static.staging.wkflo.ai/tenant-a/7/research-agent-icon.png');
  });

  it('renders a "Done" status once the subagent completes', () => {
    renderMessages([
      buildMessage({
        type: 'tool',
        content: '',
        subAgentActivity: {
          chatId: 'chat-1',
          agentId: 7,
          agentName: 'Research Agent',
          action: 'Looking up enrollment data',
          status: 'completed',
        },
      }),
    ]);

    expect(screen.getByText('Done')).toBeTruthy();
  });

  it('renders a "Failed" status when the subagent invocation fails', () => {
    renderMessages([
      buildMessage({
        type: 'tool',
        content: '',
        subAgentActivity: {
          chatId: 'chat-1',
          agentId: 7,
          agentName: 'Research Agent',
          action: 'Looking up enrollment data',
          status: 'failed',
        },
      }),
    ]);

    expect(screen.getByText('Failed')).toBeTruthy();
  });

  it('does not render a plain tool-execution message without subAgentActivity (existing behavior unaffected)', () => {
    renderMessages([
      buildMessage({
        type: 'tool',
        content: '✓ Successfully executed some_tool',
        contentItems: [{ name: 'some_tool', status: 'completed' }],
      }),
    ]);

    expect(screen.queryByTestId('chat-message-subagent-activity')).toBeNull();
    expect(screen.queryByText('✓ Successfully executed some_tool')).toBeNull();
  });
});

// US 7575: "Ask for permission" card in the shared chat / widget.
describe('ChatMessages — tool approval card', () => {
  const toolApproval = {
    chatId: 'session-1',
    sessionId: 'session-1',
    approvalId: 'approval-1',
    agentName: 'Vera',
    toolName: 'Docs server',
    functionName: 'create_doc',
    expiresAtUtc: new Date(Date.now() + 60_000).toISOString(),
    status: 'Pending' as const,
  };

  it('renders the card for a message carrying toolApproval and routes the answer with that message', () => {
    const onToolApprovalDecision = vi.fn().mockResolvedValue({ success: true });
    const message = buildMessage({ id: 'tool-approval-approval-1', type: 'system', content: '', channelMessageType: 4, toolApproval });
    render(
      <ChatMessages
        messages={[message]}
        agent={baseAgent}
        isLoading={false}
        typingIndicators={[]}
        authError={null}
        messagesContainerRef={{ current: null }}
        isAuthenticated={true}
        onSubmitContactForm={async () => {}}
        onSkipContactForm={() => {}}
        onAddTextSuggestionToTop={() => null}
        onAddTextSuggestionToBottom={() => null}
        onReplaceAllWithTextSuggestion={() => null}
        onKeepTextSuggestion={() => {}}
        onUndoTextSuggestion={() => {}}
        onToolApprovalDecision={onToolApprovalDecision}
      />
    );

    expect(screen.getByTestId('tool-approval-card')).toHaveTextContent('Vera wants to use create_doc from Docs server');
    fireEvent.click(screen.getByRole('button', { name: 'Deny' }));
    expect(onToolApprovalDecision).toHaveBeenCalledWith(message, 'Deny');
  });
});

// Bug 7722: sub-agent runs can stop on a tool approval - every status gets its own label/icon,
// and a status this client doesn't know never shows as "Done".
describe('ChatMessages — subagent activity statuses (Bug 7722)', () => {
  function renderActivity(status: string) {
    renderMessages([
      buildMessage({
        type: 'tool',
        content: '',
        subAgentActivity: {
          chatId: 'chat-1',
          agentId: 7,
          agentName: 'Research Agent',
          action: 'Creating the document',
          status: status as never,
        },
      }),
    ]);
    return screen.getByTestId('chat-message-subagent-activity');
  }

  it.each([
    ['started', 'Working…', 'wrench'],
    ['awaiting_approval', 'Waiting for approval', 'hand'],
    ['resumed', 'Working… (approved)', 'wrench'],
    ['completed', 'Done', 'wrench'],
    ['failed', 'Failed', 'wrench'],
    ['denied', 'Denied', 'ban'],
    ['expired', 'Expired', 'clock'],
    ['cancelled', 'Cancelled', 'ban'],
  ])('renders %s as "%s" with the %s icon', (status, label, icon) => {
    const card = renderActivity(status);

    expect(screen.getByTestId('subagent-activity-status')).toHaveTextContent(label);
    expect(card.querySelector(`[data-icon="${icon}"]`)).not.toBeNull();
  });

  it('shows Waiting for approval in amber', () => {
    renderActivity('awaiting_approval');
    expect(screen.getByTestId('subagent-activity-status').className).toContain('bg-amber-100');
  });

  it('shows Denied in red', () => {
    renderActivity('denied');
    expect(screen.getByTestId('subagent-activity-status').className).toContain('bg-red-100');
  });

  it('shows an unknown status neutrally, never as "Done"', () => {
    renderActivity('something_new');

    const badge = screen.getByTestId('subagent-activity-status');
    expect(badge).toHaveTextContent('Status unavailable');
    expect(badge).not.toHaveTextContent('Done');
    expect(badge.className).toContain('bg-gray-100');
  });
});

// Task 7851: long unbroken content (tool-call JSON, URLs, IDs with no spaces) used to set the
// bubble's minimum width and stretch it past the chat panel. Only `overflow-wrap: anywhere`
// lowers that minimum, and every flex item on the way down needs min-width: 0.
describe('ChatMessages — long unbroken content wraps inside the bubble (Task 7851)', () => {
  const LONG_TOKEN = `{"designId":"${'D'.repeat(400)}","url":"https://example.com/${'x'.repeat(400)}"}`;

  it('constrains the bubble and its content for a message with a very long unbroken string', () => {
    renderMessages([
      buildMessage({ type: 'system', channelMessageType: 3, content: LONG_TOKEN }),
    ]);

    const content = screen.getByText(LONG_TOKEN);
    const bubbleContent = content.closest('.bubble-content') as HTMLElement;
    expect(bubbleContent.className).toContain('min-w-0');
    expect(bubbleContent.className).toContain('wrap-anywhere');

    const bubble = content.closest('.wkflo-chat-bubble') as HTMLElement;
    expect(bubble.className).toContain('min-w-0');
    expect(bubble.className).toContain('max-w-full');
    expect(bubble.className).toContain('wrap-anywhere');
    // Not fit-content: that let the bubble grow to the long string's width.
    expect(bubble.style.maxWidth).toBe('100%');

    expect((bubble.closest('.wkflo-chat-bubble-size') as HTMLElement).className).toContain('min-w-0');
  });

  it('renders a code block inside the constrained bubble content', () => {
    const { container } = renderMessages([
      buildMessage({ content: `<pre><code>${LONG_TOKEN}</code></pre>` }),
    ]);

    const pre = container.querySelector('pre') as HTMLElement;
    expect(pre).toBeTruthy();
    const bubbleContent = pre.closest('.bubble-content') as HTMLElement;
    expect(bubbleContent.className).toContain('wrap-anywhere');
    expect((pre.closest('.wkflo-chat-bubble') as HTMLElement).style.maxWidth).toBe('100%');
  });

  it('styles bubbles and code blocks to wrap in the shared stylesheet (app and widget)', () => {
    const css = readFileSync(resolve(__dirname, '../styles/chat-components.css'), 'utf8').replace(/\r\n/g, '\n');
    const rule = (selector: string) => {
      const start = css.indexOf(`${selector} {`);
      expect(start, `missing rule ${selector}`).toBeGreaterThanOrEqual(0);
      return css.slice(start, css.indexOf('}', start));
    };

    expect(rule('  pre')).toMatch(/overflow-x-auto/);
    expect(rule('  pre')).toMatch(/max-w-full/);
    expect(rule('  pre')).toMatch(/whitespace-pre-wrap/);
    expect(rule('  pre')).toMatch(/wrap-anywhere/);
    expect(rule('.wkflo-chat-bubble .bubble-content')).toMatch(/overflow-wrap: anywhere/);
    expect(rule('.wkflo-widget-root .wkflo-chat-bubble')).toMatch(/overflow-wrap: anywhere/);
    expect(rule('.wkflo-widget-root .wkflo-chat-bubble')).toMatch(/min-width: 0/);
  });
});

// Bug 7872: <img>s embedded in an HTML message body fall back to the same agent.baseUrl-aware
// image-expired.svg as the message's own fileUrl/file images.
describe('ChatMessages — broken image inside an HTML message (Bug 7872)', () => {
  it('swaps the embedded image to image-expired.svg resolved against agent.baseUrl', () => {
    renderMessages(
      [buildMessage({ content: '<p>Your design:</p><img src="https://example.com/thumb.png?sig=old" alt="Design thumbnail">' })],
      { ...baseAgent, baseUrl: 'https://wkflo.example.com' }
    );

    const img = screen.getByAltText('Design thumbnail') as HTMLImageElement;
    fireEvent.error(img);

    expect(img.src).toBe('https://wkflo.example.com/assets/image-expired.svg');
    expect(img.alt).toBe('Image no longer available');
  });
});

// US 7502: the Stop marker renders as the full-width divider, never as an agent bubble.
describe('ChatMessages — Stop divider', () => {
  const liveDivider = buildMessage({
    id: 'stopped-marker-1',
    type: 'system',
    content: 'Stopped. All agents cancelled.',
    channelMessageType: 3,
    stoppedMarker: { stoppedAt: '2026-10-19T10:00:00Z' },
  });

  it('renders the divider below the partial text', () => {
    renderMessages([buildMessage({ id: 'reply-1', content: 'Partial answer' }), liveDivider]);

    const divider = screen.getByText('Stopped. All agents cancelled.');
    expect(divider.closest('[role="separator"], [aria-hidden="true"]')).toBeNull();
    const partial = screen.getByText('Partial answer');
    expect(partial.compareDocumentPosition(divider) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('never renders the marker as a bubble with an avatar', () => {
    renderMessages([liveDivider]);

    expect(screen.getAllByText('Stopped. All agents cancelled.')).toHaveLength(1);
    expect(screen.queryByTestId('chat-message-bot-avatar')).toBeNull();
    expect(document.querySelector('.wkflo-chat-bubble')).toBeNull();
  });

  it('shows the full text in the Chat UI (isWidget = false)', () => {
    renderMessages([liveDivider], baseAgent, undefined, false);

    expect(within(screen.getByTestId('stopped-divider')).getByText('Stopped. All agents cancelled.')).toBeInTheDocument(); // US 7974: the label, beside its timestamp
  });

  it('shows just "Stopped." in the Chat Widget, whatever the marker content says', () => {
    renderMessages([buildMessage({ id: 'reply-1', content: 'Partial answer' }), liveDivider], baseAgent, undefined, true);

    const divider = screen.getByTestId('stopped-divider');
    expect(within(divider).getByText('Stopped.')).toBeInTheDocument(); // US 7974: the label, beside its timestamp
    expect(screen.queryByText('Stopped. All agents cancelled.')).not.toBeInTheDocument();
    const partial = screen.getByText('Partial answer');
    expect(partial.compareDocumentPosition(divider) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('renders the divider even without content', () => {
    renderMessages([{ ...liveDivider, content: '' }]);

    const text = screen.getByText('Stopped. All agents cancelled.');
    expect(screen.getByTestId('stopped-divider')).toContainElement(text);
    expect(text.closest('[role="separator"], [aria-hidden="true"]')).toBeNull();
  });
});

// US 7959: a chat runtime error entry (the assistant failed while answering) or tool warning.
describe('ChatMessages — chat runtime error entry', () => {
  const errorMessage = (overrides: Partial<ChatMessage> = {}): ChatMessage => buildMessage({
    id: 'error-1',
    content: 'The assistant took too long to reply. Please try again.',
    channelMessageType: 3,
    agentName: 'Research Agent',
    chatbotIconUrl: 'https://static.staging.wkflo.ai/tenant-a/7/research-agent.png',
    chatError: { code: 'WKFLOAI1102', severity: 'error', isTerminal: true, turnId: 'turn-1' },
    ...overrides,
  });

  function renderWithRating(messages: ChatMessage[]) {
    return render(
      <ChatMessages
        messages={messages}
        agent={baseAgent}
        isLoading={false}
        typingIndicators={[]}
        authError={null}
        messagesContainerRef={{ current: null }}
        isAuthenticated={true}
        onRateMessage={() => {}}
        onSubmitContactForm={async () => {}}
        onSkipContactForm={() => {}}
        onAddTextSuggestionToTop={() => null}
        onAddTextSuggestionToBottom={() => null}
        onReplaceAllWithTextSuggestion={() => null}
        onKeepTextSuggestion={() => {}}
        onUndoTextSuggestion={() => {}}
      />
    );
  }

  it('shows the friendly text as an error with the failing agent, without rating or copy', () => {
    renderWithRating([errorMessage({ messageId: 'should-not-matter' })]);

    const entry = screen.getByTestId('chat-message-error');
    expect(entry.getAttribute('data-severity')).toBe('error');
    expect(entry.getAttribute('role')).toBe('alert');
    expect(entry.textContent).toContain('The assistant took too long to reply. Please try again.');
    expect(screen.getByText('Research Agent')).toBeTruthy();
    expect(screen.getByAltText('Chatbot icon').getAttribute('src')).toBe('https://static.staging.wkflo.ai/tenant-a/7/research-agent.png');
    expect(screen.queryByTitle('Copy message')).toBeNull();
    expect(screen.queryByTitle('Thumbs up')).toBeNull();
    expect(screen.queryByTitle('Thumbs down')).toBeNull();
  });

  it('shows a tool warning in the warning style', () => {
    renderWithRating([errorMessage({
      content: "A tool this assistant uses isn't available right now.",
      chatError: { code: 'WKFLOAI1112', severity: 'warning', isTerminal: false },
    })]);

    const entry = screen.getByTestId('chat-message-error');
    expect(entry.getAttribute('data-severity')).toBe('warning');
    expect(entry.getAttribute('role')).toBe('status');
  });

  it('falls back to the host agent name and icon', () => {
    renderWithRating([errorMessage({ agentName: undefined, chatbotIconUrl: undefined })]);

    expect(screen.getByText('Host Agent')).toBeTruthy();
    expect(screen.getByAltText('Chatbot icon').getAttribute('src')).toBe(baseAgent.chatbotIconPath);
  });

  it('shows the friendly text of a failed sub-agent run with an error code', () => {
    renderMessages([
      buildMessage({
        type: 'tool',
        content: '',
        subAgentActivity: {
          chatId: 'chat-1',
          agentId: 7,
          agentName: 'Research Agent',
          action: 'Looking up data',
          status: 'failed',
          errorCode: 'WKFLOAI1108',
        },
      }),
    ]);

    expect(screen.getByTestId('subagent-activity-error').textContent)
      .toBe("The assistant's AI service isn't available right now. Please try again later.");
  });
});

// Task 8215: an image the agent returns has no text of its own. The backend no longer sends its
// "FileName/FileType" label to the chat (older backends still do), so the bubble shows only the image.
describe('ChatMessages — image returned by the agent (Task 8215)', () => {
  const returnedImage = (content: string) => buildMessage({
    type: 'user',
    content,
    channelMessageType: 3,
    fileUrl: 'https://blob.example.com/chat-images/edited.png?sas',
    metadata: { renderAsSystem: true },
  });

  it('shows no text row or Info icon under the image when the message has no text', () => {
    const { container } = renderMessages([returnedImage('')]);

    expect(screen.getByAltText('Uploaded image')).toBeTruthy();
    expect(container.querySelector('.bubble-content')).toBeNull();
    expect(container.querySelector('.lucide-info')).toBeNull();
  });

  it('hides the FileName/FileType label an older backend still sends', () => {
    const { container } = renderMessages([returnedImage("FileName: 'edited.png'\nFileType: 'image/png'")]);

    expect(screen.queryByText(/FileName:/)).toBeNull();
    expect(container.querySelector('.bubble-content')).toBeNull();
  });

  it('still shows real text that comes with the image', () => {
    renderMessages([returnedImage('Here is the edited version')]);

    expect(screen.getByText('Here is the edited version')).toBeTruthy();
  });
});

// Task 8215: the same for an image the user uploaded (a plain user message with a fileUrl).
describe('ChatMessages — image uploaded by the user (Task 8215)', () => {
  const uploadedImage = (content: string) => buildMessage({
    type: 'user',
    content,
    fileUrl: 'https://blob.example.com/chat-images/photo.png?sas',
  });

  it('shows the image without a text row when the message has no text', () => {
    const { container } = renderMessages([uploadedImage('')]);

    expect(screen.getByAltText('Uploaded image')).toBeTruthy();
    expect(container.querySelector('.bubble-content')).toBeNull();
  });

  it('hides the upload label an older backend still sends', () => {
    const { container } = renderMessages([uploadedImage("\n FileName: 'photo.png'\n FileType: 'image/png'")]);

    expect(screen.queryByText(/FileName:/)).toBeNull();
    expect(container.querySelector('.bubble-content')).toBeNull();
  });
});

// US 8159: where the Agents bar is shown, it carries "Thinking" and the sub-agent progress.
describe('ChatMessages — status in the Agents bar (US 8159)', () => {
  function renderBarMode(messages: ChatMessage[], typing: Array<{ agentId?: number; agentName?: string }> = []) {
    return render(
      <ChatMessages
        messages={messages}
        agent={baseAgent}
        isLoading={false}
        typingIndicators={typing}
        authError={null}
        messagesContainerRef={{ current: null }}
        isAuthenticated={true}
        onSubmitContactForm={async () => {}}
        onSkipContactForm={() => {}}
        onAddTextSuggestionToTop={() => null}
        onAddTextSuggestionToBottom={() => null}
        onReplaceAllWithTextSuggestion={() => null}
        onKeepTextSuggestion={() => {}}
        onUndoTextSuggestion={() => {}}
        statusInAgentsBar
      />
    );
  }

  const activity = (status: string, extra: Record<string, unknown> = {}) => buildMessage({
    id: `activity-${status}`,
    type: 'tool',
    content: '',
    subAgentActivity: {
      chatId: 'chat-1', agentId: 7, agentName: 'Research Agent', action: 'image-edit-requested', status: status as never, ...extra,
    },
  });

  it('hides the Thinking bubble', () => {
    renderBarMode([], [{ agentId: 1, agentName: 'Host Agent' }]);
    expect(screen.queryByText('Thinking')).toBeNull();
  });

  it.each(['started', 'resumed', 'completed', 'awaiting_approval'])('hides the %s sub-agent card', (status) => {
    renderBarMode([activity(status)]);
    expect(screen.queryByTestId('chat-message-subagent-activity')).toBeNull();
  });

  it.each(['failed', 'denied', 'expired', 'cancelled'])('keeps the %s sub-agent card', (status) => {
    renderBarMode([activity(status)]);
    expect(screen.getAllByTestId('chat-message-subagent-activity')).toHaveLength(1);
  });

  it('keeps the friendly error text of a failed run', () => {
    renderBarMode([activity('failed', { errorCode: 'WKFLOAI1101' })]);
    expect(screen.getByTestId('subagent-activity-error')).toBeInTheDocument();
  });

  it('keeps the cards without the flag (Chat Widget)', () => {
    renderMessages([activity('started')]);
    expect(screen.getByTestId('chat-message-subagent-activity')).toBeInTheDocument();
  });

  it('keeps ordinary messages', () => {
    renderBarMode([buildMessage({})]);
    expect(screen.getByText('Hello from the agent')).toBeInTheDocument();
  });
});
