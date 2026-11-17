import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import ChatUI from './chat-ui';
import { ChatMessagesProvider } from '@shared/provider/chat-messages-provider';
import { DataContext, initialState } from '@shared/models/chat-models';
import { AmaisCapabilitiesContextService } from '@shared/services/amais-capabilities-context-service';

function renderChatUI(ui: React.ReactElement) {
  return render(<ChatMessagesProvider>{ui}</ChatMessagesProvider>);
}

// Scopes to the header's icon container specifically — previewMode also seeds a sample
// conversation whose bot avatar reuses the same resolved icon (alt="Chatbot icon" too), so
// a bare getByAltText would match more than one element once both messages and header render.
function getHeaderIcon(): HTMLImageElement {
  const container = screen.getByTestId('chatbot-icon-container');
  const img = container.querySelector('img');
  if (!img) {
    throw new Error('Expected an <img> inside the header icon container, found none.');
  }
  return img as HTMLImageElement;
}

// Regression test for US 6563 follow-up: bubbleIconPath/chatbotIconPath/cssUrl were never
// threaded from the settings pages through ChatUI -> AgentChatInterface, so the live chat
// preview never reflected either a manually-typed URL or a freshly uploaded icon (it only
// ever showed whatever was fetched once from the backend on mount). previewMode=true lets us
// exercise the prop-threading + AgentChatInterface's resolvedBubbleIconPath/chatbotIconPath
// precedence (agentConfig value over the one-time-fetched context fallback) without needing
// to stand up a real ChatService/SignalR connection — that machinery is untouched by this fix
// and is skipped entirely in preview mode.
describe('ChatUI — bubble/chatbot icon live preview wiring', () => {
  const baseProps = {
    tenantGuid: 'tenant-guid',
    agentName: 'Test Agent',
    apiEndpoint: 'https://api.example.com',
    previewMode: true,
    isWidget: false,
    isVoiceChatEnabled: false,
  } as const;

  it('renders the header icon from an initial bubbleIconPath/chatbotIconPath prop', () => {
    renderChatUI(
      <ChatUI
        {...baseProps}
        bubbleIconPath="https://static.staging.wkflo.ai/tenant-a/1/bubble.png"
        chatbotIconPath="https://static.staging.wkflo.ai/tenant-a/1/chatbot.png"
      />
    );

    // bubbleIconPath takes precedence over chatbotIconPath in the header, matching
    // chat-header.tsx's existing `agent.bubbleIconPath?.trim() || agent.chatbotIconPath` logic.
    expect(getHeaderIcon().src).toBe('https://static.staging.wkflo.ai/tenant-a/1/bubble.png');
  });

  it('updates the live preview icon immediately when the prop changes — no save/reload needed', () => {
    const { rerender } = renderChatUI(
      <ChatUI {...baseProps} bubbleIconPath="https://static.staging.wkflo.ai/tenant-a/1/old.png" />
    );

    expect(getHeaderIcon().src).toBe('https://static.staging.wkflo.ai/tenant-a/1/old.png');

    // Simulates both a manually-typed URL edit and a freshly uploaded icon — both write into
    // the same chatSettings.bubbleIconPath state in the parent page, which is a plain prop
    // re-render here.
    rerender(
      <ChatMessagesProvider>
        <ChatUI {...baseProps} bubbleIconPath="https://static.staging.wkflo.ai/tenant-a/1/new-upload.png" />
      </ChatMessagesProvider>
    );

    expect(getHeaderIcon().src).toBe('https://static.staging.wkflo.ai/tenant-a/1/new-upload.png');
  });

  it('shows the default bot icon when no icon path is set at all', () => {
    renderChatUI(<ChatUI {...baseProps} />);
    expect(screen.queryByAltText('Chatbot icon')).not.toBeInTheDocument();
  });

  // Visual polish follow-up: the header/launcher icons rendered as a tiny image floating in a
  // mostly-empty circle. chat-header.tsx's container is w-8 h-8 (32px) — the icon went
  // w-4 h-4 (16px, 50% fill) -> w-6 h-6 (24px, 75% fill) in e681e61, then per further user
  // feedback that 75% still read as "too small" in the actual rendered widget, -> w-7 h-7
  // (28px, ~87.5% fill), then (task #6740 follow-up) -> w-full h-full with object-cover so it
  // fills the round container completely (no inset gap), is clipped to the circle, and
  // preserves its own aspect ratio instead of stretching. This only applies to a real
  // uploaded/custom image — see the separate "default Bot glyph" describe block below for why
  // the fallback icon stayed smaller.
  it('renders the header icon filling its 32px round container', () => {
    renderChatUI(
      <ChatUI {...baseProps} chatbotIconPath="https://static.staging.wkflo.ai/tenant-a/1/chatbot.png" />
    );

    expect(screen.getByTestId('chatbot-icon-container').className).toContain('overflow-hidden');

    const icon = getHeaderIcon();
    expect(icon.className).toContain('w-full');
    expect(icon.className).toContain('h-full');
    expect(icon.className).toContain('object-cover');
  });

  // The floating launcher button (isMinimized) is a 64px circle (.wkflo-widget-minimized in
  // shared/styles/chat-components.css) — its icon went w-7 h-7 (28px, ~44% fill) -> w-12 h-12
  // (48px, 75% fill) in e681e61, then -> w-14 h-14 (56px, ~87.5% fill) per further feedback,
  // then (task #6740 follow-up) -> w-full h-full with object-cover so it fills its round
  // wrapper completely, is clipped to the circle, and preserves its own aspect ratio instead
  // of stretching. The crop is scoped to an inner wrapper (not .wkflo-widget-minimized itself)
  // so the "expandable" indicator dot — a sibling near the button's edge — never gets clipped.
  it('renders the floating launcher icon filling its 64px round wrapper, without clipping the indicator dot', () => {
    const { container } = renderChatUI(
      <ChatUI
        {...baseProps}
        isWidget={true}
        isMinimized={true}
        bubbleIconPath="https://static.staging.wkflo.ai/tenant-a/1/bubble.png"
      />
    );

    const launcherIcon = screen.getByAltText('Chat bubble icon') as HTMLImageElement;
    expect(launcherIcon.className).toContain('w-full');
    expect(launcherIcon.className).toContain('h-full');
    expect(launcherIcon.className).toContain('object-cover');

    // The icon's immediate wrapper (not the outer .wkflo-widget-minimized button) does the
    // clipping, so the indicator dot below stays unclipped.
    const iconClipWrapper = launcherIcon.parentElement as HTMLElement;
    expect(iconClipWrapper.className).toContain('overflow-hidden');
    expect(iconClipWrapper.className).toContain('rounded-full');

    const indicatorDot = container.querySelector('.bg-green-500');
    expect(indicatorDot).toBeTruthy();
  });

  // Pill-style launcher badge (.wkflo-widget-launcher-icon, 40px) — its icon went
  // w-7 h-7 (28px, 70% fill) -> w-8 h-8 (32px, 80% fill) in e681e61, then -> w-9 h-9
  // (36px, 90% fill) per further feedback, then (task #6740 follow-up) -> w-full h-full with
  // object-cover so it fills the badge completely and preserves its own aspect ratio; the
  // badge itself (.wkflo-widget-launcher-icon) gained overflow: hidden in chat-components.css
  // to clip it to the circle (no indicator dot lives inside this badge, unlike the plain
  // circle launcher above, so no extra wrapper is needed here).
  it('renders the pill launcher icon filling its 40px badge', () => {
    renderChatUI(
      <ChatUI
        {...baseProps}
        isWidget={true}
        isMinimized={true}
        launcherStyle="pill"
        bubbleIconPath="https://static.staging.wkflo.ai/tenant-a/1/bubble.png"
      />
    );

    const launcherIcon = screen.getByAltText('Chat bubble icon') as HTMLImageElement;
    expect(launcherIcon.className).toContain('w-full');
    expect(launcherIcon.className).toContain('h-full');
    expect(launcherIcon.className).toContain('object-cover');
    expect(launcherIcon.closest('.wkflo-widget-launcher-icon')).toBeTruthy();
  });

  // Bot avatar next to each assistant message (chat-messages.tsx, 40px container) — its icon
  // went w-6 h-6 (24px, 60% fill) -> w-8 h-8 (32px, 80% fill) in e681e61, then -> w-9 h-9
  // (36px, 90% fill) per further feedback, then (task #6740 follow-up) -> w-full h-full with
  // object-cover so it fills the round parent completely (no inset gap), is clipped to the
  // circle, and preserves its own aspect ratio instead of stretching. previewMode seeds a
  // sample conversation with assistant replies, each rendering a bot avatar.
  it('renders the message-list bot avatar icon filling its 40px round container', () => {
    renderChatUI(
      <ChatUI {...baseProps} chatbotIconPath="https://static.staging.wkflo.ai/tenant-a/1/chatbot.png" />
    );

    const avatars = screen.getAllByTestId('chat-message-bot-avatar');
    expect(avatars.length).toBeGreaterThan(0);
    expect(avatars[0].className).toContain('overflow-hidden');
    const avatarIcon = avatars[0].querySelector('img') as HTMLImageElement;
    expect(avatarIcon).toBeTruthy();
    expect(avatarIcon.className).toContain('w-full');
    expect(avatarIcon.className).toContain('h-full');
    expect(avatarIcon.className).toContain('object-cover');
  });
});

// ADO #6823 / #6938 follow-up: the MD app's own Share-page previews (chat-ui.tsx /
// chat-widget.tsx under client/src/pages/agents/share/) never render <ChatUI> inside a real
// <iframe> (the only <iframe> markup there is inline text in the "Embed Code" box).
// `canSelectFeature` threads a static value for exactly that case straight through to
// AgentConfig, but it is no longer sufficient on its own: AgentChatInterface's
// canEnterFeatureSelectionMode gate always also requires a host-confirmed AMAIS_CAPABILITIES
// postMessage (see shared/services/amais-capabilities-context-service.ts), and nothing in a
// Share-page preview context ever sends that message — so the button now stays hidden there
// regardless of canSelectFeature, unless a test simulates the postMessage arriving.
// Absent in every form, in a chat whose composer did render - so a renamed control can't make
// these checks pass by accident.
function expectNoFeatureControl() {
  expect(screen.getByRole('textbox')).toBeInTheDocument();
  expect(screen.getByTitle('More options')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Select feature' })).not.toBeInTheDocument();
  expect(screen.queryByTestId('chat-feature-select-button')).not.toBeInTheDocument();
  expect(screen.queryByTitle('Select a feature on the page')).not.toBeInTheDocument();
  expect(screen.queryByTestId('ads-click-icon')).not.toBeInTheDocument();
}

describe('ChatUI — canSelectFeature threading', () => {
  const baseProps = {
    tenantGuid: 'tenant-guid',
    agentName: 'Test Agent',
    apiEndpoint: 'https://api.example.com',
    isWidget: false,
    isVoiceChatEnabled: false,
  } as const;

  afterEach(() => {
    AmaisCapabilitiesContextService.resetInstance();
  });

  it('does not render the "Select feature" button when canSelectFeature=true but no AMAIS_CAPABILITIES message has been received', () => {
    renderChatUI(<ChatUI {...baseProps} canSelectFeature={true} />);

    expectNoFeatureControl();
  });

  it('renders the "Select feature" button once AMAIS_CAPABILITIES{selectFeature: true} is received, even without a real iframe around it', () => {
    renderChatUI(<ChatUI {...baseProps} canSelectFeature={true} />);
    expectNoFeatureControl();

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', { data: { type: 'AMAIS_CAPABILITIES', capabilities: { selectFeature: true } } })
      );
    });

    expect(screen.getByRole('button', { name: 'Select feature' })).toBeInTheDocument();
  });

  it('does not render the "Select feature" button when canSelectFeature is omitted, even with the capability confirmed', () => {
    // getInstance() must run before dispatching here: a previous test's afterEach may have
    // called resetInstance(), tearing down the message listener, and no component has
    // mounted yet to recreate it — without this, the message would be dispatched with
    // nothing listening and silently dropped, since it's posted before renderChatUI below.
    AmaisCapabilitiesContextService.getInstance();
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', { data: { type: 'AMAIS_CAPABILITIES', capabilities: { selectFeature: true } } })
      );
    });
    renderChatUI(<ChatUI {...baseProps} />);

    expectNoFeatureControl();
  });

  it('does not render the "Select feature" button when canSelectFeature=false is passed explicitly, even with the capability confirmed', () => {
    AmaisCapabilitiesContextService.getInstance();
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', { data: { type: 'AMAIS_CAPABILITIES', capabilities: { selectFeature: true } } })
      );
    });
    renderChatUI(<ChatUI {...baseProps} canSelectFeature={false} />);

    expectNoFeatureControl();
  });
});

// Follow-up design feedback: once the image case was enlarged to ~85-90% fill (e681e61 /
// 639f08b), the generic Lucide <Bot> fallback glyph (shown when no custom icon is set) looked
// oversized/chunky at that same size — glyphs like Bot have their own baked-in internal
// padding, unlike a real uploaded photo/logo, so blowing them up the same amount reads worse,
// not better. Each of the 4 spots now gives the <img> and the <Bot> fallback separate size
// classes: the image keeps the enlarged size, the fallback glyph goes back to roughly its
// original (pre-e681e61) size.
describe('ChatUI — default Bot glyph fallback stays at its original, smaller size', () => {
  const baseProps = {
    tenantGuid: 'tenant-guid',
    agentName: 'Test Agent',
    apiEndpoint: 'https://api.example.com',
    previewMode: true,
    isWidget: false,
    isVoiceChatEnabled: false,
  } as const;

  it('header fallback Bot glyph is w-4 h-4 (original size) in its 32px container', () => {
    renderChatUI(<ChatUI {...baseProps} />);

    const iconContainer = screen.getByTestId('chatbot-icon-container');
    expect(iconContainer.querySelector('img')).not.toBeInTheDocument();
    const botIcon = iconContainer.querySelector('svg') as SVGElement;
    expect(botIcon).toBeTruthy();
    // US 7551: the default glyph is the AI sparkle.
    expect(botIcon).toHaveAttribute('data-testid', 'ai-sparkle-icon');
    expect(botIcon.getAttribute('class')).toContain('w-4');
    expect(botIcon.getAttribute('class')).toContain('h-4');
  });

  it('message-list bot avatar fallback Bot glyph is w-6 h-6 (original size) in its 40px container', () => {
    renderChatUI(<ChatUI {...baseProps} />);

    const avatars = screen.getAllByTestId('chat-message-bot-avatar');
    expect(avatars.length).toBeGreaterThan(0);
    expect(avatars[0].querySelector('img')).toBeNull();
    const botIcon = avatars[0].querySelector('svg') as SVGElement;
    expect(botIcon).toBeTruthy();
    expect(botIcon).toHaveAttribute('data-testid', 'ai-sparkle-icon');
    expect(botIcon.getAttribute('class')).toContain('w-6');
    expect(botIcon.getAttribute('class')).toContain('h-6');
  });

  it('circle launcher fallback Bot glyph is w-7 h-7 (original size) in its 64px circle', () => {
    const { container } = renderChatUI(
      <ChatUI {...baseProps} isWidget={true} isMinimized={true} />
    );

    expect(screen.queryByAltText('Chat bubble icon')).not.toBeInTheDocument();
    const botIcon = container.querySelector('svg') as SVGElement;
    expect(botIcon).toBeTruthy();
    expect(botIcon).toHaveAttribute('data-testid', 'ai-sparkle-icon');
    expect(botIcon.getAttribute('class')).toContain('w-7');
    expect(botIcon.getAttribute('class')).toContain('h-7');
  });

  it('pill launcher fallback Bot glyph is w-7 h-7 (original size) in its 40px badge', () => {
    const { container } = renderChatUI(
      <ChatUI {...baseProps} isWidget={true} isMinimized={true} launcherStyle="pill" />
    );

    expect(screen.queryByAltText('Chat bubble icon')).not.toBeInTheDocument();
    const badge = container.querySelector('.wkflo-widget-launcher-icon') as HTMLElement;
    expect(badge).toBeTruthy();
    const botIcon = badge.querySelector('svg') as SVGElement;
    expect(botIcon).toBeTruthy();
    expect(botIcon).toHaveAttribute('data-testid', 'ai-sparkle-icon');
    expect(botIcon.getAttribute('class')).toContain('w-7');
    expect(botIcon.getAttribute('class')).toContain('h-7');
  });
});

// Regression coverage: clearing the "Bubble Icon URL"/"Chatbot Icon URL" text input in
// advanced-chat-settings-panel.tsx must show the default Bot icon live, with no save/reload
// needed — CMS-side investigation confirmed no explicit "Remove" button is needed in
// wkflo_ui specifically because clearing the text field is already sufficient, AS LONG AS the
// resolution logic actually honors an explicit empty string. It didn't: agent-chat-interface.tsx's
// resolvedBubbleIconPath/chatbotIconPath used a plain `||` fallback to
// context.agentChatSettings (a value fetched once from the backend and cached), which can't
// distinguish "not provided" from "explicitly cleared to empty" — so once that one-time fetch
// had already picked up a previously-saved icon, clearing the field lived on top of a stale
// non-empty context value and the old icon kept showing. Fixed by only falling back to
// context when agentConfig's own field is undefined, never when it's an explicit ''.
describe('ChatUI — clearing an icon shows the default Bot icon (no stale value leaks through)', () => {
  const baseProps = {
    tenantGuid: 'tenant-guid',
    agentName: 'Test Agent',
    apiEndpoint: 'https://api.example.com',
    previewMode: true,
    isWidget: false,
    isVoiceChatEnabled: false,
  } as const;

  it('shows the Bot fallback immediately after the icon prop is cleared to "" — no reload needed', () => {
    const { rerender } = renderChatUI(
      <ChatUI {...baseProps} bubbleIconPath="https://static.staging.wkflo.ai/tenant-a/1/bubble.png" />
    );

    expect(getHeaderIcon()).toBeTruthy();

    // Simulates the user clearing the text input: formSettings.bubbleIconPath becomes '',
    // which flows straight through as a plain prop re-render here.
    rerender(
      <ChatMessagesProvider>
        <ChatUI {...baseProps} bubbleIconPath="" />
      </ChatMessagesProvider>
    );

    expect(screen.queryByAltText('Chatbot icon')).not.toBeInTheDocument();
  });

  it('an explicit "" wins over a stale context.agentChatSettings icon fetched earlier in the session', () => {
    // Simulates AgentChatInterface's one-time backend fetch (loadAgentSettings) having already
    // populated the shared DataContext with a previously-saved, non-empty icon BEFORE the user
    // cleared the field in this session — the exact staleness window this bug lived in.
    const contextWithStaleIcon = {
      ...initialState,
      agentChatSettings: {
        ...initialState.agentChatSettings,
        chatbotIconPath: 'https://static.staging.wkflo.ai/tenant-a/1/STALE-previously-saved-icon.png',
      },
      updateState: () => {},
    };

    render(
      <DataContext.Provider value={contextWithStaleIcon}>
        <ChatMessagesProvider>
          <ChatUI {...baseProps} chatbotIconPath="" />
        </ChatMessagesProvider>
      </DataContext.Provider>
    );

    // Must show the Bot fallback, not the stale context icon.
    expect(screen.queryByAltText('Chatbot icon')).not.toBeInTheDocument();
  });

  it('still falls back to context.agentChatSettings when the icon prop is genuinely omitted (undefined)', () => {
    // Distinguishes "explicitly cleared" from "not specified at all" — a widget script embed
    // that omits data-chatbot-icon-path entirely (bubbleIconPath/chatbotIconPath left
    // undefined, per chat-widget/src/widget.tsx) should still show whatever WKFlo has saved.
    const contextWithSavedIcon = {
      ...initialState,
      agentChatSettings: {
        ...initialState.agentChatSettings,
        chatbotIconPath: 'https://static.staging.wkflo.ai/tenant-a/1/saved-icon.png',
      },
      updateState: () => {},
    };

    render(
      <DataContext.Provider value={contextWithSavedIcon}>
        <ChatMessagesProvider>
          <ChatUI {...baseProps} />
        </ChatMessagesProvider>
      </DataContext.Provider>
    );

    expect(getHeaderIcon().src).toBe('https://static.staging.wkflo.ai/tenant-a/1/saved-icon.png');
  });

  it('does not crash and falls back correctly when the icon prop is `null` (a never-configured backend record)', () => {
    // AgentChatSetting.BubbleIconPath/ChatbotIconPath are plain nullable C# strings, so a
    // never-configured agent's chat-setting/ui|widget response can genuinely come back as
    // `null` rather than ''. chatSettingsFromResult passes that straight through (no `|| ''`
    // coercion), so ChatUI can receive a literal `null` here — must be treated the same as
    // "not provided" (fall back, don't crash on .trim()).
    render(
      <ChatMessagesProvider>
        <ChatUI {...baseProps} bubbleIconPath={null as unknown as string} />
      </ChatMessagesProvider>
    );

    expect(screen.queryByAltText('Chatbot icon')).not.toBeInTheDocument();
  });
});
