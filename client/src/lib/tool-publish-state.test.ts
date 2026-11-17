import { describe, it, expect } from 'vitest';
import { getToolPublishState, withDraftUpdatedNow } from './tool-publish-state';

describe('getToolPublishState', () => {
  it('is unpublished when the tool was never published, whatever its dates', () => {
    expect(getToolPublishState({ isPublished: false, lastUpdatedOn: null, lastPublishedOn: null })).toBe('unpublished');
    expect(
      getToolPublishState({ isPublished: false, lastUpdatedOn: '2026-10-02T10:00:00Z', lastPublishedOn: '2026-10-01T10:00:00Z' })
    ).toBe('unpublished');
  });

  it('is published when the draft was not updated after the last publish', () => {
    expect(
      getToolPublishState({ isPublished: true, lastUpdatedOn: '2026-10-01T09:00:00Z', lastPublishedOn: '2026-10-01T10:00:00Z' })
    ).toBe('published');
  });

  it('is changed when the draft was updated after the last publish', () => {
    expect(
      getToolPublishState({ isPublished: true, lastUpdatedOn: '2026-10-01T10:00:00.001Z', lastPublishedOn: '2026-10-01T10:00:00Z' })
    ).toBe('changed');
  });

  it('treats equal timestamps as published, also across time zone offsets', () => {
    expect(
      getToolPublishState({ isPublished: true, lastUpdatedOn: '2026-10-01T10:00:00Z', lastPublishedOn: '2026-10-01T10:00:00Z' })
    ).toBe('published');
    expect(
      getToolPublishState({ isPublished: true, lastUpdatedOn: '2026-10-01T12:00:00+02:00', lastPublishedOn: '2026-10-01T10:00:00Z' })
    ).toBe('published');
  });

  it('is published when a date is missing or unreadable', () => {
    expect(getToolPublishState({ isPublished: true, lastUpdatedOn: null, lastPublishedOn: '2026-10-01T10:00:00Z' })).toBe('published');
    expect(getToolPublishState({ isPublished: true, lastUpdatedOn: '2026-10-01T10:00:00Z', lastPublishedOn: null })).toBe('published');
    expect(getToolPublishState({ isPublished: true, lastUpdatedOn: 'not a date', lastPublishedOn: '2026-10-01T10:00:00Z' })).toBe('published');
  });
});

describe('withDraftUpdatedNow', () => {
  it('stamps the current time as the draft update time', () => {
    const now = Date.parse('2026-10-05T10:00:00Z');
    const tool = { isPublished: true, lastUpdatedOn: null, lastPublishedOn: '2026-10-01T10:00:00Z' };
    const updated = withDraftUpdatedNow(tool, now);
    expect(updated.lastUpdatedOn).toBe('2026-10-05T10:00:00.000Z');
    expect(getToolPublishState(updated)).toBe('changed');
  });

  it('never stamps a time before the last publish, so the change always shows', () => {
    const behindClock = Date.parse('2026-10-01T09:00:00Z');
    const tool = { isPublished: true, lastUpdatedOn: null, lastPublishedOn: '2026-10-01T10:00:00Z' };
    expect(getToolPublishState(withDraftUpdatedNow(tool, behindClock))).toBe('changed');
  });
});
