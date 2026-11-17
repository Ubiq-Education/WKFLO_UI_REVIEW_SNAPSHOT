export interface SelectedFeature {
  featureId: string;
  featureType: string;
  featureName: string;
}

type Listener = (feature: SelectedFeature | null) => void;
type SelectionModeListener = (active: boolean) => void;

export class FeatureContextService {
  private static instance: FeatureContextService | null = null;
  private selectedFeature: SelectedFeature | null = null;
  private listeners = new Set<Listener>();
  private selectionModeActive = false;
  private selectionModeListeners = new Set<SelectionModeListener>();
  private handleMessage = (event: MessageEvent) => {
    const { type, featureId, featureType, featureName } = event.data as {
      type?: string;
      featureId?: unknown;
      featureType?: unknown;
      featureName?: unknown;
    };
    if (
      type !== 'SELECTED_FEATURE' ||
      typeof featureId !== 'string' ||
      typeof featureType !== 'string' ||
      typeof featureName !== 'string'
    ) return;

    this.selectedFeature = { featureId, featureType, featureName };
    this.listeners.forEach((listener) => listener(this.selectedFeature));

    // A pick fulfills the mode's purpose — turn it off automatically rather than making the
    // user click the icon a second time.
    if (this.selectionModeActive) {
      this.exitSelectionMode();
    }
  };

  private constructor() {
    window.addEventListener('message', this.handleMessage);
  }

  public static getInstance(): FeatureContextService {
    if (!FeatureContextService.instance) {
      FeatureContextService.instance = new FeatureContextService();
    }
    return FeatureContextService.instance;
  }

  public getCurrent(): SelectedFeature | null {
    return this.selectedFeature;
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public clearSelection(): void {
    this.selectedFeature = null;
    this.postToParent({ type: 'FEATURE_DESELECTED' });
    this.listeners.forEach((listener) => listener(null));
  }

  public isSelectionModeActive(): boolean {
    return this.selectionModeActive;
  }

  // Whether there's an actual host page to talk to. When this is false (not embedded in an
  // iframe — a static inline embed, an admin preview tab, a local test harness), every
  // outbound message no-ops, so UI that triggers one (the selection-mode icon, the dismiss
  // button) should hide/behave accordingly rather than offer a control that does nothing.
  public isEmbeddedInIframe(): boolean {
    return window !== window.parent;
  }

  public subscribeSelectionMode(listener: SelectionModeListener): () => void {
    this.selectionModeListeners.add(listener);
    return () => this.selectionModeListeners.delete(listener);
  }

  public enterSelectionMode(): void {
    this.selectionModeActive = true;
    this.postToParent({ type: 'ENTER_FEATURE_SELECTION_MODE' });
    this.selectionModeListeners.forEach((listener) => listener(true));
  }

  public exitSelectionMode(): void {
    this.selectionModeActive = false;
    this.postToParent({ type: 'EXIT_FEATURE_SELECTION_MODE' });
    this.selectionModeListeners.forEach((listener) => listener(false));
  }

  // Tells the host page (PetraCMS) to mutate the CKEditor instance for whichever feature is
  // currently selected on the page at click time — used by the text-suggestion card's "Add to
  // top"/"Add to bottom"/"Replace all" buttons. Deliberately takes no featureId: the host
  // resolves the target via its own live-tracked `selectedFeatureId`, exactly as it did before
  // US 6930 — MAISY's suggested text is meant to apply to whatever feature the admin currently
  // has selected, not necessarily the one the suggestion was originally generated for (a bug
  // introduced and then reverted during US 6930 — see undoTextFeature below for how Undo still
  // reliably targets the right feature without needing this call to pin one). `html` is the
  // suggested text; `mode` determines where/how the host applies it.
  public insertTextIntoFeature(mode: 'top' | 'bottom' | 'replace', html: string): void {
    this.postToParent({ type: 'INSERT_TEXT_INTO_FEATURE', mode, html });
  }

  // US 6930: reverts whichever of the three insertTextIntoFeature actions (top/bottom/replace)
  // most recently ran for a specific feature. Unlike insertTextIntoFeature, this one DOES need
  // an explicit featureId — the admin's selection may have moved on by the time Undo is clicked,
  // but the revert must still land on the feature that was actually mutated. Callers should pass
  // whatever `getCurrent()?.featureId` resolved to at the moment the corresponding
  // insertTextIntoFeature call was made (captured by agent-chat-interface.tsx's handlers), not
  // whatever is selected now. `featureId` matches `SelectedFeature.featureId` (both are ultimately
  // sourced from the same `data-feature-id` DOM attribute on the host page). The host stash this
  // reverts is keyed by featureId and overwritten by each new action, per Revision 2 of the plan.
  public undoTextFeature(featureId: string | null): void {
    // No feature was actually captured at apply-time (e.g. nothing was selected on the host
    // page when the action ran) — nothing to revert, so don't bother the host with it.
    if (featureId === null) return;
    this.postToParent({ type: 'UNDO_TEXT_FEATURE', featureId });
  }

  private postToParent(message: { type: string } & Record<string, unknown>): void {
    if (!this.isEmbeddedInIframe()) return;
    window.parent.postMessage(message, '*');
  }

  public static resetInstance(): void {
    if (FeatureContextService.instance) {
      window.removeEventListener('message', FeatureContextService.instance.handleMessage);
    }
    FeatureContextService.instance = null;
  }
}

// Attach the listener as soon as this module loads, rather than waiting for the first
// getInstance() caller (a component mount, or the first outgoing chat request) — the host
// page can post SELECTED_FEATURE the moment the iframe exists, before React has rendered
// anything, so the listener needs to be live as early as the widget's JS bundle can make it.
FeatureContextService.getInstance();
