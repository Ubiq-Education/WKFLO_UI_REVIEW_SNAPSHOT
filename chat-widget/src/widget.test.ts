import { describe, it, expect, vi, afterEach } from 'vitest';
import { deriveWidgetBaseUrl, WkfloWidget } from './widget';

// AgentChatInterface pulls in auth/SignalR/chat-service machinery that this test doesn't need —
// it only cares that widget.tsx's render() wires the right prop through. Mocking the component
// avoids loading that whole graph.
vi.mock('../../shared/components', () => ({
  AgentChatInterface: () => null,
}));

// chat-widget carries its own nested node_modules (react-dom included, for its standalone UMD
// build), separate from the root copy shared/ code resolves against. Actually mounting a React
// tree here (via the real createRoot) loads both copies at once and crashes with "Cannot read
// properties of null (reading 'useState')" — a duplicate-React-instance hook mismatch, not a bug
// in widget.tsx itself. Mocking createRoot to a no-op capture sidesteps rendering entirely: we
// only need to inspect the React element render() constructs (a plain props object), never
// execute it.
const { renderSpy } = vi.hoisted(() => ({ renderSpy: vi.fn() }));
vi.mock('react-dom/client', () => ({
  createRoot: () => ({ render: renderSpy, unmount: vi.fn() }),
}));

// Task 7030 hardening: a real-world PetraCMS misconfiguration (a missing
// AMAIS_WKFLO_WIDGET_CJS_URL in one local IIS Express launch profile) left the embed
// <script src="..."> tag empty. Per the URL spec, resolving an empty relative reference
// against the document's own base URL yields the document's own URL — so `script.src` (the
// property) silently resolved to the embedding page's own origin instead of wkflo_ui's real
// asset host, producing a plausible-looking but wrong baseUrl for image-expired.svg et al.
// deriveWidgetBaseUrl only trusts the resolved origin when it can confirm the script src
// actually points at the widget's own bundle file (wkflo-widget.umd.cjs).
describe('deriveWidgetBaseUrl (Task 7030 — PetraCMS empty-src hardening)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves the origin when the script src correctly points at wkflo-widget.umd.cjs', () => {
    const src = 'https://widgets.wkflo.example.com/assets/wkflo-widget.umd.cjs';
    expect(deriveWidgetBaseUrl(src, src)).toBe('https://widgets.wkflo.example.com');
  });

  it('resolves the origin for a relative attribute once the browser resolves .src to an absolute URL', () => {
    // getAttribute('src') can be a relative path; the .src *property* is what the browser
    // resolves to an absolute URL — deriveWidgetBaseUrl is given both, and must use the
    // resolved one to compute the origin.
    const attr = '/assets/wkflo-widget.umd.cjs';
    const resolved = 'https://widgets.wkflo.example.com/assets/wkflo-widget.umd.cjs';
    expect(deriveWidgetBaseUrl(attr, resolved)).toBe('https://widgets.wkflo.example.com');
  });

  it('falls back to empty string, without warning, when the src attribute is empty (the confirmed PetraCMS failure mode)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // This is the exact PetraCMS scenario: an empty src="" attribute resolves `.src` (the
    // property) to the embedding document's own URL rather than failing outright. An
    // altogether-absent/empty src attribute is treated as "not configured" rather than
    // "misconfigured" — it's caught by the earliest guard and doesn't warn (the pathname
    // guard below covers the case where a src IS present but wrong).
    const result = deriveWidgetBaseUrl('', 'https://school-site.example.com/some/cms/page');

    expect(result).toBe('');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('falls back to empty string, without warning, when the src attribute is null (no src at all)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = deriveWidgetBaseUrl(null, 'https://school-site.example.com/some/cms/page');

    expect(result).toBe('');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('falls back to empty string and warns when a non-empty src does not point at wkflo-widget.umd.cjs', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // A src attribute IS present here, but resolves to something other than the widget's own
    // bundle file — this is the case the pathname guard exists to catch defensively.
    const src = 'https://school-site.example.com/some/unrelated-script.js';
    const result = deriveWidgetBaseUrl(src, src);

    expect(result).toBe('');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain('AMAIS_WKFLO_WIDGET_CJS_URL');
  });

  it('falls back to empty string when the resolved src is not a parseable URL', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = deriveWidgetBaseUrl('not a url', 'not a url');

    expect(result).toBe('');
    // An unparseable URL never reaches the pathname check, so it doesn't warn either.
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

// Bug 7147: MSAL's loginPopup defaults redirectUri to window.location.href when none is passed
// (AuthService, shared/services/auth-service.ts). For a third-party-embedded widget that's the
// customer's own host page — cross-origin from wkflo_ui — which breaks the popup's hash
// monitoring and produces BrowserAuthError: hash_empty_error. widget.tsx's render() must reuse
// the already-derived, always-same-origin AgentConfig.baseUrl as the redirectUri passed to
// AgentChatInterface, instead of leaving it unset.
describe('WkfloWidget render() — redirectUri wiring (Bug 7147)', () => {
  afterEach(() => {
    renderSpy.mockClear();
    document.body.innerHTML = '';
  });

  const baseConfig = {
    tenantGuid: 'tenant-guid',
    shareId: 'share-1',
    agentName: 'Test Agent',
    primaryColor: '#3b82f6',
    bubbleStyle: 'rounded' as const,
    showDescription: true,
    chainOfThought: false,
    apiEndpoint: 'https://api.wkflo.example.com',
    isVoiceChatEnabled: false,
    securityConfiguration: {
      type: 'azure-ad' as const,
      azureAd: { clientId: 'client-id', tenantId: 'tenant-id', scopes: [] },
    },
  };

  // render()'s tree is <DataProvider><AgentChatInterface .../></DataProvider> — since render()
  // is mocked to a no-op capture (see above), these are plain unexecuted React elements; drill
  // into the single child to read the props actually passed to AgentChatInterface.
  function capturedRedirectUri(): string | undefined {
    expect(renderSpy).toHaveBeenCalledTimes(1);
    const dataProviderElement = renderSpy.mock.calls[0][0] as {
      props: { children: { props: { redirectUri?: string } } };
    };
    return dataProviderElement.props.children.props.redirectUri;
  }

  it('passes the derived baseUrl as redirectUri to AgentChatInterface', () => {
    const widget = new WkfloWidget({
      ...baseConfig,
      baseUrl: 'https://widgets.wkflo.example.com',
    });

    widget.show();

    expect(capturedRedirectUri()).toBe('https://widgets.wkflo.example.com');
  });

  it('passes undefined redirectUri when baseUrl could not be derived (degrades to the existing window.location.href fallback in AuthService)', () => {
    const widget = new WkfloWidget({
      ...baseConfig,
      baseUrl: '',
    });

    widget.show();

    expect(capturedRedirectUri()).toBeUndefined();
  });
});
