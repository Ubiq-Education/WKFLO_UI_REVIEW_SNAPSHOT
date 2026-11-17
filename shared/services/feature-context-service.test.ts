import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FeatureContextService } from './feature-context-service';

function postSelectedFeature(data: Record<string, unknown>) {
  window.dispatchEvent(new MessageEvent('message', { data }));
}

describe('FeatureContextService', () => {
  afterEach(() => {
    FeatureContextService.resetInstance();
  });

  it('starts with no selected feature', () => {
    expect(FeatureContextService.getInstance().getCurrent()).toBeNull();
  });

  it('stores the feature from a SELECTED_FEATURE message', () => {
    const service = FeatureContextService.getInstance();
    postSelectedFeature({ type: 'SELECTED_FEATURE', featureId: '42', featureType: 'Text', featureName: 'Homepage Hero' });
    expect(service.getCurrent()).toEqual({ featureId: '42', featureType: 'Text', featureName: 'Homepage Hero' });
  });

  it('notifies subscribers when a feature is selected', () => {
    const service = FeatureContextService.getInstance();
    const listener = vi.fn();
    service.subscribe(listener);

    postSelectedFeature({ type: 'SELECTED_FEATURE', featureId: '7', featureType: 'Text', featureName: 'Homepage Hero' });

    expect(listener).toHaveBeenCalledWith({ featureId: '7', featureType: 'Text', featureName: 'Homepage Hero' });
  });

  it('stops notifying after unsubscribe', () => {
    const service = FeatureContextService.getInstance();
    const listener = vi.fn();
    const unsubscribe = service.subscribe(listener);
    unsubscribe();

    postSelectedFeature({ type: 'SELECTED_FEATURE', featureId: '7', featureType: 'Text', featureName: 'Homepage Hero' });

    expect(listener).not.toHaveBeenCalled();
  });

  it('ignores messages of a different type', () => {
    const service = FeatureContextService.getInstance();
    postSelectedFeature({ type: 'PAGE_PATH', path: '/foo' });
    expect(service.getCurrent()).toBeNull();
  });

  it('ignores malformed SELECTED_FEATURE messages (wrong-typed featureId)', () => {
    const service = FeatureContextService.getInstance();
    postSelectedFeature({ type: 'SELECTED_FEATURE', featureId: 42, featureType: 'Text', featureName: 'Homepage Hero' });
    expect(service.getCurrent()).toBeNull();
  });

  it('ignores messages with a wrong-typed featureType', () => {
    const service = FeatureContextService.getInstance();
    postSelectedFeature({ type: 'SELECTED_FEATURE', featureId: '42', featureType: 42, featureName: 'Homepage Hero' });
    expect(service.getCurrent()).toBeNull();
  });

  it('ignores messages missing featureName', () => {
    const service = FeatureContextService.getInstance();
    postSelectedFeature({ type: 'SELECTED_FEATURE', featureId: '42', featureType: 'Text' });
    expect(service.getCurrent()).toBeNull();
  });

  it('ignores messages with a wrong-typed featureName', () => {
    const service = FeatureContextService.getInstance();
    postSelectedFeature({ type: 'SELECTED_FEATURE', featureId: '42', featureType: 'Text', featureName: 42 });
    expect(service.getCurrent()).toBeNull();
  });

  it('accepts an empty-string featureId/featureName as a valid selection', () => {
    const service = FeatureContextService.getInstance();
    postSelectedFeature({ type: 'SELECTED_FEATURE', featureId: '', featureType: 'Text', featureName: '' });
    expect(service.getCurrent()).toEqual({ featureId: '', featureType: 'Text', featureName: '' });
  });

  it('overwrites the previous selection when a second message arrives', () => {
    const service = FeatureContextService.getInstance();
    postSelectedFeature({ type: 'SELECTED_FEATURE', featureId: '1', featureType: 'Text', featureName: 'Homepage Hero' });
    postSelectedFeature({ type: 'SELECTED_FEATURE', featureId: '2', featureType: 'Text', featureName: 'Pricing Table' });
    expect(service.getCurrent()).toEqual({ featureId: '2', featureType: 'Text', featureName: 'Pricing Table' });
  });

  it('returns the same instance across getInstance calls', () => {
    expect(FeatureContextService.getInstance()).toBe(FeatureContextService.getInstance());
  });

  it('clears the current selection', () => {
    const service = FeatureContextService.getInstance();
    postSelectedFeature({ type: 'SELECTED_FEATURE', featureId: '42', featureType: 'Text', featureName: 'Homepage Hero' });

    service.clearSelection();

    expect(service.getCurrent()).toBeNull();
  });

  it('notifies subscribers with null when the selection is cleared', () => {
    const service = FeatureContextService.getInstance();
    postSelectedFeature({ type: 'SELECTED_FEATURE', featureId: '42', featureType: 'Text', featureName: 'Homepage Hero' });
    const listener = vi.fn();
    service.subscribe(listener);

    service.clearSelection();

    expect(listener).toHaveBeenCalledWith(null);
  });

  describe('outbound messages to the host page', () => {
    let originalParent: Window;
    let fakeParent: { postMessage: ReturnType<typeof vi.fn> };

    beforeEach(() => {
      originalParent = window.parent;
      fakeParent = { postMessage: vi.fn() };
      // Simulate being embedded in an iframe — jsdom's default has window.parent === window,
      // which is what a non-iframe embed looks like, so most tests here need a real "host".
      Object.defineProperty(window, 'parent', { value: fakeParent, configurable: true });
    });

    afterEach(() => {
      Object.defineProperty(window, 'parent', { value: originalParent, configurable: true });
    });

    it('is inactive by default', () => {
      expect(FeatureContextService.getInstance().isSelectionModeActive()).toBe(false);
    });

    it('isEmbeddedInIframe() is true when embedded in an iframe', () => {
      expect(FeatureContextService.getInstance().isEmbeddedInIframe()).toBe(true);
    });

    it('isEmbeddedInIframe() is false when not actually embedded in an iframe', () => {
      Object.defineProperty(window, 'parent', { value: window, configurable: true });
      expect(FeatureContextService.getInstance().isEmbeddedInIframe()).toBe(false);
    });

    it('posts ENTER_FEATURE_SELECTION_MODE and flips active on enterSelectionMode()', () => {
      const service = FeatureContextService.getInstance();
      service.enterSelectionMode();

      expect(service.isSelectionModeActive()).toBe(true);
      expect(fakeParent.postMessage).toHaveBeenCalledWith({ type: 'ENTER_FEATURE_SELECTION_MODE' }, '*');
    });

    it('posts EXIT_FEATURE_SELECTION_MODE and flips inactive on exitSelectionMode()', () => {
      const service = FeatureContextService.getInstance();
      service.enterSelectionMode();
      fakeParent.postMessage.mockClear();

      service.exitSelectionMode();

      expect(service.isSelectionModeActive()).toBe(false);
      expect(fakeParent.postMessage).toHaveBeenCalledWith({ type: 'EXIT_FEATURE_SELECTION_MODE' }, '*');
    });

    it('notifies selection-mode subscribers on enter and exit', () => {
      const service = FeatureContextService.getInstance();
      const listener = vi.fn();
      service.subscribeSelectionMode(listener);

      service.enterSelectionMode();
      expect(listener).toHaveBeenLastCalledWith(true);

      service.exitSelectionMode();
      expect(listener).toHaveBeenLastCalledWith(false);
    });

    it('stops notifying selection-mode subscribers after unsubscribe', () => {
      const service = FeatureContextService.getInstance();
      const listener = vi.fn();
      const unsubscribe = service.subscribeSelectionMode(listener);
      unsubscribe();

      service.enterSelectionMode();

      expect(listener).not.toHaveBeenCalled();
    });

    it('auto-exits selection mode when a feature is selected while active', () => {
      const service = FeatureContextService.getInstance();
      service.enterSelectionMode();
      fakeParent.postMessage.mockClear();

      postSelectedFeature({ type: 'SELECTED_FEATURE', featureId: '42', featureType: 'Text', featureName: 'Homepage Hero' });

      expect(service.isSelectionModeActive()).toBe(false);
      expect(fakeParent.postMessage).toHaveBeenCalledWith({ type: 'EXIT_FEATURE_SELECTION_MODE' }, '*');
    });

    it('does not post EXIT_FEATURE_SELECTION_MODE for a stray SELECTED_FEATURE when selection mode was never entered', () => {
      const service = FeatureContextService.getInstance();

      postSelectedFeature({ type: 'SELECTED_FEATURE', featureId: '42', featureType: 'Text', featureName: 'Homepage Hero' });

      expect(fakeParent.postMessage).not.toHaveBeenCalled();
    });

    it('does not post to parent when not actually embedded in an iframe', () => {
      // Restore the jsdom default (window.parent === window) for this one test.
      Object.defineProperty(window, 'parent', { value: window, configurable: true });
      const postMessageSpy = vi.spyOn(window, 'postMessage');

      FeatureContextService.getInstance().enterSelectionMode();

      expect(postMessageSpy).not.toHaveBeenCalled();
      postMessageSpy.mockRestore();
    });

    it('posts FEATURE_DESELECTED when clearSelection() is called', () => {
      const service = FeatureContextService.getInstance();
      postSelectedFeature({ type: 'SELECTED_FEATURE', featureId: '42', featureType: 'Text', featureName: 'Homepage Hero' });
      fakeParent.postMessage.mockClear();

      service.clearSelection();

      expect(fakeParent.postMessage).toHaveBeenCalledWith({ type: 'FEATURE_DESELECTED' }, '*');
    });

    it('does not post FEATURE_DESELECTED when not actually embedded in an iframe', () => {
      Object.defineProperty(window, 'parent', { value: window, configurable: true });
      const postMessageSpy = vi.spyOn(window, 'postMessage');
      const service = FeatureContextService.getInstance();
      postSelectedFeature({ type: 'SELECTED_FEATURE', featureId: '42', featureType: 'Text', featureName: 'Homepage Hero' });

      service.clearSelection();

      expect(postMessageSpy).not.toHaveBeenCalled();
      postMessageSpy.mockRestore();
    });

    // US 6930 bug fix: insertTextIntoFeature must NOT carry a featureId — that regressed
    // apply-time targeting to always hit the suggestion's original feature instead of whatever
    // the admin currently has selected on the host page (the host resolves that itself via its
    // own live-tracked selectedFeatureId). undoTextFeature is the one that needs an explicit
    // featureId, since Undo must still hit the feature that was actually mutated even if the
    // admin's selection has moved on by the time Undo is clicked — see doc comments.
    it('posts INSERT_TEXT_INTO_FEATURE with only mode and html — no featureId', () => {
      const service = FeatureContextService.getInstance();

      service.insertTextIntoFeature('replace', '<p>New copy</p>');

      expect(fakeParent.postMessage).toHaveBeenCalledWith(
        { type: 'INSERT_TEXT_INTO_FEATURE', mode: 'replace', html: '<p>New copy</p>' },
        '*'
      );
    });

    it('posts INSERT_TEXT_INTO_FEATURE for the "top" and "bottom" modes too, with no featureId', () => {
      const service = FeatureContextService.getInstance();

      service.insertTextIntoFeature('top', '<p>Top copy</p>');
      expect(fakeParent.postMessage).toHaveBeenCalledWith(
        { type: 'INSERT_TEXT_INTO_FEATURE', mode: 'top', html: '<p>Top copy</p>' },
        '*'
      );

      service.insertTextIntoFeature('bottom', '<p>Bottom copy</p>');
      expect(fakeParent.postMessage).toHaveBeenCalledWith(
        { type: 'INSERT_TEXT_INTO_FEATURE', mode: 'bottom', html: '<p>Bottom copy</p>' },
        '*'
      );
    });

    it('does not post INSERT_TEXT_INTO_FEATURE when not actually embedded in an iframe', () => {
      Object.defineProperty(window, 'parent', { value: window, configurable: true });
      const postMessageSpy = vi.spyOn(window, 'postMessage');

      FeatureContextService.getInstance().insertTextIntoFeature('replace', '<p>New copy</p>');

      expect(postMessageSpy).not.toHaveBeenCalled();
      postMessageSpy.mockRestore();
    });

    it('posts UNDO_TEXT_FEATURE with the given (string) featureId on undoTextFeature()', () => {
      const service = FeatureContextService.getInstance();

      service.undoTextFeature('42');

      expect(fakeParent.postMessage).toHaveBeenCalledWith(
        { type: 'UNDO_TEXT_FEATURE', featureId: '42' },
        '*'
      );
    });

    it('does not post UNDO_TEXT_FEATURE when featureId is null (nothing was captured at apply-time)', () => {
      const service = FeatureContextService.getInstance();

      service.undoTextFeature(null);

      expect(fakeParent.postMessage).not.toHaveBeenCalled();
    });

    it('does not post UNDO_TEXT_FEATURE when not actually embedded in an iframe', () => {
      Object.defineProperty(window, 'parent', { value: window, configurable: true });
      const postMessageSpy = vi.spyOn(window, 'postMessage');

      FeatureContextService.getInstance().undoTextFeature('42');

      expect(postMessageSpy).not.toHaveBeenCalled();
      postMessageSpy.mockRestore();
    });
  });
});
