export interface AmaisCapabilities {
  selectFeature: boolean;
}

type Listener = (capabilities: AmaisCapabilities | null) => void;

// Delays (ms) between REQUEST_AMAIS_CAPABILITIES retries, given no response yet. The CMS's own
// <script> tag now loads before the assistant <iframe> in the markup (see
// _AmaisAssistantScript.cshtml) specifically so its postMessage listener is registered before
// the iframe's navigation even starts — but live testing against a real CMS instance still
// showed occasional slow/failed handshakes beyond the original short window (dev-server hiccups,
// host page under heavier load, etc.), so this stays a longer-tailed safety net rather than
// assuming the markup fix alone makes a single quick retry burst sufficient. Bounded, not
// infinite: still gives up (button stays hidden, fail-closed) if every attempt goes unanswered.
const CAPABILITIES_REQUEST_RETRY_DELAYS_MS = [250, 750, 1500, 3000, 6000, 12000];

export class AmaisCapabilitiesContextService {
  private static instance: AmaisCapabilitiesContextService | null = null;
  private capabilities: AmaisCapabilities | null = null;
  private listeners = new Set<Listener>();
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private handleMessage = (event: MessageEvent) => {
    const { type, capabilities } = event.data as { type?: string; capabilities?: unknown };
    if (
      type !== 'AMAIS_CAPABILITIES' ||
      typeof capabilities !== 'object' ||
      capabilities === null ||
      typeof (capabilities as { selectFeature?: unknown }).selectFeature !== 'boolean'
    ) return;

    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.capabilities = capabilities as AmaisCapabilities;
    this.listeners.forEach((listener) => listener(this.capabilities));
  };

  // Asks the host for capabilities, rather than only ever waiting on the one-shot
  // AMAIS_CAPABILITIES push the CMS fires from the iframe's 'load' event (see
  // wkflo-assistant-messages.js's pushAmaisEndpointsOnLoad). Mirrors the REQUEST_PAGE_PATH/
  // PAGE_PATH pattern already used by PageContextService for the same class of
  // parent-derived-data race. Retries on a short backoff until a response arrives (see
  // CAPABILITIES_REQUEST_RETRY_DELAYS_MS above) since either side of this handshake can be the
  // slower one to finish loading, not just the iframe.
  private requestCapabilities(attempt: number): void {
    if (this.capabilities !== null) return;
    try {
      window.parent.postMessage({ type: 'REQUEST_AMAIS_CAPABILITIES' }, '*');
    } catch {
      // A failed request must not break anything — the passive listener still works, and the
      // fallback load-triggered push (or a future message) can still get through.
    }

    const delay = CAPABILITIES_REQUEST_RETRY_DELAYS_MS[attempt];
    if (delay !== undefined) {
      this.retryTimer = setTimeout(() => this.requestCapabilities(attempt + 1), delay);
    }
  }

  private constructor() {
    window.addEventListener('message', this.handleMessage);

    // Only meaningful when actually embedded; a direct/non-iframe context has no parent to ask.
    if (window !== window.parent) {
      this.requestCapabilities(0);
    }
  }

  public static getInstance(): AmaisCapabilitiesContextService {
    if (!AmaisCapabilitiesContextService.instance) {
      AmaisCapabilitiesContextService.instance = new AmaisCapabilitiesContextService();
    }
    return AmaisCapabilitiesContextService.instance;
  }

  public getCurrent(): AmaisCapabilities | null {
    return this.capabilities;
  }

  // Immediately syncs a new subscriber with whatever capabilities are already known, rather
  // than only ever notifying on the *next* AMAIS_CAPABILITIES message. Without this, a
  // subscriber that mounts after capabilities already resolved (a real, confirmed-live race:
  // React's useEffect(() => subscribe(...), []) runs asynchronously after first render, and the
  // active REQUEST_AMAIS_CAPABILITIES request can round-trip in well under a millisecond once
  // the CMS answers) is stuck on its stale initial getCurrent() read forever — the singleton
  // already has the answer, nothing ever tells the late subscriber, and no second
  // AMAIS_CAPABILITIES message is coming to save it once requestCapabilities() has stopped
  // retrying. Confirmed via live instrumentation: capabilities were accepted onto the singleton
  // with listenerCount 0, and the component's subsequent state read stayed null forever after.
  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    if (this.capabilities !== null) {
      listener(this.capabilities);
    }
    return () => this.listeners.delete(listener);
  }

  public static resetInstance(): void {
    if (AmaisCapabilitiesContextService.instance) {
      window.removeEventListener('message', AmaisCapabilitiesContextService.instance.handleMessage);
      if (AmaisCapabilitiesContextService.instance.retryTimer !== null) {
        clearTimeout(AmaisCapabilitiesContextService.instance.retryTimer);
      }
    }
    AmaisCapabilitiesContextService.instance = null;
  }
}

// Attach the listener as soon as this module loads, rather than waiting for the first
// getInstance() caller (a component mount, or the first outgoing chat request) — the CMS
// host page pushes AMAIS_CAPABILITIES once the Maisy iframe finishes loading, which can
// happen before React has rendered anything, so the listener needs to be live as early as
// the widget's JS bundle can make it.
AmaisCapabilitiesContextService.getInstance();
