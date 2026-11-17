import { describe, it, expect, afterEach, vi } from 'vitest';
import { AmaisCapabilitiesContextService } from './amais-capabilities-context-service';

function postAmaisCapabilities(data: Record<string, unknown>) {
  window.dispatchEvent(new MessageEvent('message', { data }));
}

describe('AmaisCapabilitiesContextService', () => {
  afterEach(() => {
    AmaisCapabilitiesContextService.resetInstance();
  });

  it('starts with no capabilities', () => {
    expect(AmaisCapabilitiesContextService.getInstance().getCurrent()).toBeNull();
  });

  it('stores the capabilities from an AMAIS_CAPABILITIES message', () => {
    const service = AmaisCapabilitiesContextService.getInstance();
    postAmaisCapabilities({ type: 'AMAIS_CAPABILITIES', capabilities: { selectFeature: true } });
    expect(service.getCurrent()).toEqual({ selectFeature: true });
  });

  it('ignores messages of a different type', () => {
    const service = AmaisCapabilitiesContextService.getInstance();
    postAmaisCapabilities({ type: 'AMAIS_ENDPOINTS', endpoints: [] });
    expect(service.getCurrent()).toBeNull();
  });

  it('ignores AMAIS_CAPABILITIES messages missing capabilities', () => {
    const service = AmaisCapabilitiesContextService.getInstance();
    postAmaisCapabilities({ type: 'AMAIS_CAPABILITIES' });
    expect(service.getCurrent()).toBeNull();
  });

  it('ignores AMAIS_CAPABILITIES messages with a non-object capabilities', () => {
    const service = AmaisCapabilitiesContextService.getInstance();
    postAmaisCapabilities({ type: 'AMAIS_CAPABILITIES', capabilities: 'true' });
    expect(service.getCurrent()).toBeNull();
  });

  it('ignores AMAIS_CAPABILITIES messages with a null capabilities', () => {
    const service = AmaisCapabilitiesContextService.getInstance();
    postAmaisCapabilities({ type: 'AMAIS_CAPABILITIES', capabilities: null });
    expect(service.getCurrent()).toBeNull();
  });

  it('ignores AMAIS_CAPABILITIES messages with a non-boolean selectFeature', () => {
    const service = AmaisCapabilitiesContextService.getInstance();
    postAmaisCapabilities({ type: 'AMAIS_CAPABILITIES', capabilities: { selectFeature: 'true' } });
    expect(service.getCurrent()).toBeNull();
  });

  it('ignores AMAIS_CAPABILITIES messages missing selectFeature', () => {
    const service = AmaisCapabilitiesContextService.getInstance();
    postAmaisCapabilities({ type: 'AMAIS_CAPABILITIES', capabilities: {} });
    expect(service.getCurrent()).toBeNull();
  });

  it('overwrites the previous capabilities when a second message arrives', () => {
    const service = AmaisCapabilitiesContextService.getInstance();
    postAmaisCapabilities({ type: 'AMAIS_CAPABILITIES', capabilities: { selectFeature: true } });
    postAmaisCapabilities({ type: 'AMAIS_CAPABILITIES', capabilities: { selectFeature: false } });
    expect(service.getCurrent()).toEqual({ selectFeature: false });
  });

  it('returns the same instance across getInstance calls', () => {
    expect(AmaisCapabilitiesContextService.getInstance()).toBe(AmaisCapabilitiesContextService.getInstance());
  });

  it('notifies subscribers when capabilities arrive', () => {
    const service = AmaisCapabilitiesContextService.getInstance();
    const listener = vi.fn();
    service.subscribe(listener);

    postAmaisCapabilities({ type: 'AMAIS_CAPABILITIES', capabilities: { selectFeature: true } });

    expect(listener).toHaveBeenCalledWith({ selectFeature: true });
  });

  it('stops notifying after unsubscribe', () => {
    const service = AmaisCapabilitiesContextService.getInstance();
    const listener = vi.fn();
    const unsubscribe = service.subscribe(listener);
    unsubscribe();

    postAmaisCapabilities({ type: 'AMAIS_CAPABILITIES', capabilities: { selectFeature: true } });

    expect(listener).not.toHaveBeenCalled();
  });

  it('immediately syncs a subscriber that joins after capabilities already arrived', () => {
    const service = AmaisCapabilitiesContextService.getInstance();
    postAmaisCapabilities({ type: 'AMAIS_CAPABILITIES', capabilities: { selectFeature: true } });

    // This is the actual bug 7199 root cause: React's useEffect(() => subscribe(...), [])
    // mounts asynchronously after first render, so a subscriber can genuinely join after the
    // singleton already resolved capabilities (confirmed live: the CMS answered and the widget
    // accepted the message with zero listeners registered yet). Without eagerly syncing here,
    // that subscriber never learns the answer, since no second AMAIS_CAPABILITIES message is
    // coming once requestCapabilities() has stopped retrying.
    const lateListener = vi.fn();
    service.subscribe(lateListener);

    expect(lateListener).toHaveBeenCalledWith({ selectFeature: true });
  });

  it('does not call a new subscriber when capabilities have not arrived yet', () => {
    const service = AmaisCapabilitiesContextService.getInstance();
    const listener = vi.fn();
    service.subscribe(listener);

    expect(listener).not.toHaveBeenCalled();
    expect(service.getCurrent()).toBeNull();
  });
});

describe('AmaisCapabilitiesContextService — active request on init', () => {
  afterEach(() => {
    AmaisCapabilitiesContextService.resetInstance();
    vi.restoreAllMocks();
  });

  it('requests capabilities from the parent when embedded in an iframe', () => {
    const postMessageSpy = vi.spyOn(window.parent, 'postMessage');
    vi.spyOn(window, 'parent', 'get').mockReturnValue({ postMessage: postMessageSpy } as unknown as Window);

    AmaisCapabilitiesContextService.getInstance();

    expect(postMessageSpy).toHaveBeenCalledWith({ type: 'REQUEST_AMAIS_CAPABILITIES' }, '*');
  });

  it('does not request capabilities when not embedded (window === window.parent)', () => {
    const postMessageSpy = vi.spyOn(window, 'postMessage');

    AmaisCapabilitiesContextService.getInstance();

    expect(postMessageSpy).not.toHaveBeenCalledWith({ type: 'REQUEST_AMAIS_CAPABILITIES' }, '*');
  });

  it('still resolves capabilities from a response even when embedded and the request itself throws', () => {
    vi.spyOn(window, 'parent', 'get').mockReturnValue({
      postMessage: () => {
        throw new Error('postMessage blocked (e.g. cross-origin sandbox restriction)');
      },
    } as unknown as Window);

    // Construction must not throw even though the outgoing request failed, and the passive
    // listener registered earlier in the constructor must still be live.
    const service = AmaisCapabilitiesContextService.getInstance();
    postAmaisCapabilities({ type: 'AMAIS_CAPABILITIES', capabilities: { selectFeature: true } });
    expect(service.getCurrent()).toEqual({ selectFeature: true });
  });
});

describe('AmaisCapabilitiesContextService — request retries', () => {
  afterEach(() => {
    AmaisCapabilitiesContextService.resetInstance();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function mockEmbedded() {
    const postMessageSpy = vi.fn();
    vi.spyOn(window, 'parent', 'get').mockReturnValue({ postMessage: postMessageSpy } as unknown as Window);
    return postMessageSpy;
  }

  // Must stay in sync with CAPABILITIES_REQUEST_RETRY_DELAYS_MS in
  // amais-capabilities-context-service.ts (not exported, so duplicated here deliberately).
  const RETRY_DELAYS_MS = [250, 750, 1500, 3000, 6000, 12000];

  it('retries on a backoff — covers the symmetric race where the CMS listener is not registered yet on the first attempt', () => {
    vi.useFakeTimers();
    const postMessageSpy = mockEmbedded();

    AmaisCapabilitiesContextService.getInstance();
    expect(postMessageSpy).toHaveBeenCalledTimes(1);

    RETRY_DELAYS_MS.forEach((delay, index) => {
      vi.advanceTimersByTime(delay);
      expect(postMessageSpy).toHaveBeenCalledTimes(index + 2);
    });

    // Bounded: no further retries once the fixed delay schedule is exhausted.
    vi.advanceTimersByTime(60_000);
    expect(postMessageSpy).toHaveBeenCalledTimes(RETRY_DELAYS_MS.length + 1);
  });

  it('stops retrying as soon as a response arrives', () => {
    vi.useFakeTimers();
    const postMessageSpy = mockEmbedded();

    AmaisCapabilitiesContextService.getInstance();
    expect(postMessageSpy).toHaveBeenCalledTimes(1);

    postAmaisCapabilities({ type: 'AMAIS_CAPABILITIES', capabilities: { selectFeature: true } });

    vi.advanceTimersByTime(60_000);
    expect(postMessageSpy).toHaveBeenCalledTimes(1);
  });
});
