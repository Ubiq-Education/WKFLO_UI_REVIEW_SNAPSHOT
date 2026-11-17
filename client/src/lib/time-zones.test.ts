import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  buildTimeZoneOptions,
  formatDateTime,
  getGmtOffset,
  getSupportedTimeZones,
  isValidTimeZone,
  toTimeZoneOption,
} from './time-zones';

// Mid-October: London is on BST (+01:00), New York on EDT (-04:00), Kolkata is always +05:30.
const OCT = new Date('2026-10-15T13:05:00Z');
// Mid-January: London is back on GMT.
const JAN = new Date('2026-01-15T13:05:00Z');

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getSupportedTimeZones', () => {
  it('returns the runtime list and always includes UTC', () => {
    const zones = getSupportedTimeZones();
    expect(zones).toContain('UTC');
    expect(zones).toContain('Europe/London');
    expect(zones.length).toBeGreaterThan(100);
  });

  it('falls back to ["UTC"] when the runtime cannot enumerate time zones', () => {
    vi.spyOn(Intl, 'supportedValuesOf').mockImplementation(() => {
      throw new RangeError('unsupported');
    });
    expect(getSupportedTimeZones()).toEqual(['UTC']);
  });

  it('falls back to ["UTC"] when the runtime returns no time zones', () => {
    vi.spyOn(Intl, 'supportedValuesOf').mockReturnValue([]);
    expect(getSupportedTimeZones()).toEqual(['UTC']);
  });
});

describe('isValidTimeZone', () => {
  it.each(['UTC', 'Europe/London', 'America/New_York'])('accepts %s', (zone) => {
    expect(isValidTimeZone(zone)).toBe(true);
  });

  it.each(['', 'Not/AZone', 'Mars/Olympus_Mons'])('rejects %j', (zone) => {
    expect(isValidTimeZone(zone)).toBe(false);
  });
});

describe('getGmtOffset', () => {
  it('formats positive, negative, fractional and zero offsets as GMT±HH:MM', () => {
    expect(getGmtOffset('Europe/London', OCT)).toBe('GMT+01:00');
    expect(getGmtOffset('Europe/London', JAN)).toBe('GMT+00:00');
    expect(getGmtOffset('America/New_York', OCT)).toBe('GMT-04:00');
    expect(getGmtOffset('Asia/Kolkata', OCT)).toBe('GMT+05:30');
    expect(getGmtOffset('UTC', OCT)).toBe('GMT+00:00');
  });

  it('returns undefined for an unknown zone', () => {
    expect(getGmtOffset('Not/AZone', OCT)).toBeUndefined();
  });
});

describe('toTimeZoneOption / buildTimeZoneOptions', () => {
  it('labels options as "(GMT±HH:MM) Zone"', () => {
    expect(toTimeZoneOption('Europe/London', OCT)).toEqual({
      value: 'Europe/London',
      label: '(GMT+01:00) Europe/London',
    });
  });

  it('uses the bare id as the label when the offset is unknown', () => {
    expect(toTimeZoneOption('Not/AZone', OCT)).toEqual({ value: 'Not/AZone', label: 'Not/AZone' });
  });

  it('sorts west-to-east by offset, then by name', () => {
    const options = buildTimeZoneOptions(['Asia/Kolkata', 'UTC', 'Europe/London', 'America/New_York', 'Africa/Abidjan'], OCT);
    expect(options.map((o) => o.value)).toEqual([
      'America/New_York',
      'Africa/Abidjan',
      'UTC',
      'Europe/London',
      'Asia/Kolkata',
    ]);
  });
});

describe('formatDateTime', () => {
  it('formats in 24-hour time in the given zone', () => {
    expect(formatDateTime(OCT, 'Europe/London', '24h')).toBe('15 Oct 2026, 14:05');
  });

  it('formats in 12-hour time in the given zone', () => {
    expect(formatDateTime(OCT, 'Europe/London', '12h')).toBe('15 Oct 2026, 2:05 pm');
  });

  it('falls back to UTC for an unknown zone instead of throwing', () => {
    expect(formatDateTime(OCT, 'Not/AZone', '24h')).toBe('15 Oct 2026, 13:05');
  });
});
