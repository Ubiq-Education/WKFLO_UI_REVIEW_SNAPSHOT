import { describe, it, expect } from 'vitest';
import {
  STOPPED_MARKER_TEXT,
  buildStoppedMarkerMessage,
  isStoppedMarkerMetadata,
  parseStoppedAt,
  stoppedMarkerMessageId,
} from './stopped-marker';

// US 7502: one divider per Stop, whatever format its stoppedAt arrives in.
describe('stopped marker helpers', () => {
  it('reads the same instant from different ISO formats', () => {
    const expected = Date.UTC(2026, 9, 19, 10, 0, 0, 123);

    expect(parseStoppedAt('2026-10-19T10:00:00.1234567+00:00')).toBe(expected);
    expect(parseStoppedAt('2026-10-19T11:00:00.123+01:00')).toBe(expected);
    expect(parseStoppedAt('2026-10-19T10:00:00.123Z')).toBe(expected);
  });

  it('returns null for a missing or unreadable value', () => {
    expect(parseStoppedAt(undefined)).toBeNull();
    expect(parseStoppedAt('')).toBeNull();
    expect(parseStoppedAt('not a date')).toBeNull();
  });

  it('gives every format of the same Stop the same id', () => {
    expect(stoppedMarkerMessageId('2026-10-19T10:00:00.1234567+00:00'))
      .toBe(stoppedMarkerMessageId('2026-10-19T11:00:00.123+01:00'));
    expect(stoppedMarkerMessageId('2026-10-19T10:00:00Z'))
      .not.toBe(stoppedMarkerMessageId('2026-10-19T10:00:01Z'));
  });

  it('builds a divider entry with the exact copy', () => {
    const message = buildStoppedMarkerMessage('2026-10-19T10:00:00Z');

    expect(message).toMatchObject({
      id: stoppedMarkerMessageId('2026-10-19T10:00:00Z'),
      content: STOPPED_MARKER_TEXT,
      stoppedMarker: { stoppedAt: '2026-10-19T10:00:00Z' },
    });
    expect(STOPPED_MARKER_TEXT).toBe('Stopped. All agents cancelled.');
  });

  it('only matches isStoppedMarker === true', () => {
    expect(isStoppedMarkerMetadata({ isStoppedMarker: true })).toBe(true);
    expect(isStoppedMarkerMetadata({ isStoppedMarker: 'true' })).toBe(false);
    expect(isStoppedMarkerMetadata({ renderAsSystem: true })).toBe(false);
    expect(isStoppedMarkerMetadata(undefined)).toBe(false);
  });
});
