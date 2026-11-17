import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
  DATE_FORMATS,
  DEFAULT_DATE_FORMAT,
  formatChatTimestamp,
  formatTenantDate,
  formatTenantDateTime,
  formatTenantTime,
  isDateFormat,
  resolveDateFormat,
  resolveTimeFormat,
  toDisplayableDate,
  type DateFormat,
} from './format-date-time';

// Thursday 15 October 2026, 13:05 UTC - 14:05 in London (BST, +01:00).
const OCT_UTC = '2026-10-15T13:05:00Z';
// A single-digit day and month, to check zero padding.
const MAR_UTC = '2026-03-05T09:07:00Z';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('formatTenantDate', () => {
  it.each<[DateFormat, string, string]>([
    ['dd/MM/yyyy', '15/10/2026', '05/03/2026'],
    ['MM/dd/yyyy', '10/15/2026', '03/05/2026'],
    ['yyyy-MM-dd', '2026-10-15', '2026-03-05'],
    ['dd-MM-yyyy', '15-10-2026', '05-03-2026'],
    ['MM-dd-yyyy', '10-15-2026', '03-05-2026'],
    ['MMM dd, yyyy', 'Oct 15, 2026', 'Mar 05, 2026'],
    ['MMMM dd, yyyy', 'October 15, 2026', 'March 05, 2026'],
    ['dd MMM, yyyy', '15 Oct, 2026', '05 Mar, 2026'],
    ['dd MMMM, yyyy', '15 October, 2026', '05 March, 2026'],
    ['ddd, MMMM dd, yyyy', 'Thu, October 15, 2026', 'Thu, March 05, 2026'],
    ['ddd, dd MMMM, yyyy', 'Thu, 15 October, 2026', 'Thu, 05 March, 2026'],
  ])('formats %s', (dateFormat, october, march) => {
    expect(formatTenantDate(OCT_UTC, { timeZone: 'Europe/London', dateFormat })).toBe(october);
    expect(formatTenantDate(MAR_UTC, { timeZone: 'Europe/London', dateFormat })).toBe(march);
  });

  it('covers every whitelisted pattern', () => {
    for (const dateFormat of DATE_FORMATS) {
      expect(formatTenantDate(OCT_UTC, { timeZone: 'UTC', dateFormat })).not.toBe('');
    }
  });

  it('uses the calendar date in the tenant zone, not UTC', () => {
    // 23:30 UTC on the 15th is already 08:30 on Friday the 16th in Tokyo (+09:00)...
    expect(formatTenantDate('2026-10-15T23:30:00Z', { timeZone: 'Asia/Tokyo', dateFormat: 'ddd, dd MMMM, yyyy' })).toBe(
      'Fri, 16 October, 2026'
    );
    // ...and still the 15th in New York (-04:00).
    expect(formatTenantDate('2026-10-16T01:30:00Z', { timeZone: 'America/New_York', dateFormat: 'yyyy-MM-dd' })).toBe(
      '2026-10-15'
    );
  });

  it('accepts a Date as well as an ISO string', () => {
    expect(formatTenantDate(new Date(OCT_UTC), { timeZone: 'UTC', dateFormat: 'dd/MM/yyyy' })).toBe('15/10/2026');
  });
});

describe('formatTenantTime', () => {
  it('formats 24-hour time as HH:mm in the tenant zone', () => {
    expect(formatTenantTime(OCT_UTC, { timeZone: 'Europe/London', timeFormat: '24h' })).toBe('14:05');
    expect(formatTenantTime(MAR_UTC, { timeZone: 'Europe/London', timeFormat: '24h' })).toBe('09:07');
    expect(formatTenantTime('2026-10-15T23:00:00Z', { timeZone: 'Europe/London', timeFormat: '24h' })).toBe('00:00');
  });

  it('formats 12-hour time as h:mm AM/PM in the tenant zone', () => {
    expect(formatTenantTime(OCT_UTC, { timeZone: 'Europe/London', timeFormat: '12h' })).toBe('2:05 PM');
    expect(formatTenantTime(MAR_UTC, { timeZone: 'Europe/London', timeFormat: '12h' })).toBe('9:07 AM');
    expect(formatTenantTime('2026-10-15T00:00:00Z', { timeZone: 'UTC', timeFormat: '12h' })).toBe('12:00 AM');
    expect(formatTenantTime('2026-10-15T12:00:00Z', { timeZone: 'UTC', timeFormat: '12h' })).toBe('12:00 PM');
  });

  it('handles fractional offsets', () => {
    expect(formatTenantTime(OCT_UTC, { timeZone: 'Asia/Kolkata', timeFormat: '24h' })).toBe('18:35');
  });

  it('applies daylight saving transitions', () => {
    // London springs forward at 01:00 UTC on 29 March 2026 (GMT -> BST).
    expect(formatTenantTime('2026-03-29T00:59:00Z', { timeZone: 'Europe/London' })).toBe('00:59');
    expect(formatTenantTime('2026-03-29T01:00:00Z', { timeZone: 'Europe/London' })).toBe('02:00');
    // New York falls back at 06:00 UTC on 1 November 2026, so 01:30 local happens twice.
    expect(formatTenantDateTime('2026-11-01T05:30:00Z', { timeZone: 'America/New_York' })).toBe('2026-11-01 01:30');
    expect(formatTenantDateTime('2026-11-01T06:30:00Z', { timeZone: 'America/New_York' })).toBe('2026-11-01 01:30');
    expect(formatTenantDateTime('2026-11-01T07:30:00Z', { timeZone: 'America/New_York' })).toBe('2026-11-01 02:30');
  });
});

describe('formatTenantDateTime', () => {
  it('joins the tenant date and time formats', () => {
    expect(
      formatTenantDateTime(OCT_UTC, { timeZone: 'Europe/London', dateFormat: 'MMM dd, yyyy', timeFormat: '12h' })
    ).toBe('Oct 15, 2026 2:05 PM');
    expect(formatTenantDateTime(OCT_UTC, { timeZone: 'Europe/London', dateFormat: 'dd/MM/yyyy', timeFormat: '24h' })).toBe(
      '15/10/2026 14:05'
    );
  });

  it('uses UTC, yyyy-MM-dd and 24h when settings are missing', () => {
    expect(formatTenantDateTime(OCT_UTC, {})).toBe('2026-10-15 13:05');
    expect(formatTenantDateTime(OCT_UTC, { timeZone: null, dateFormat: null, timeFormat: null })).toBe('2026-10-15 13:05');
  });

  it('falls back to UTC for an invalid time zone and warns once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(formatTenantDateTime(OCT_UTC, { timeZone: 'Not/AZone', dateFormat: 'dd/MM/yyyy' })).toBe('15/10/2026 13:05');
    expect(formatTenantTime(OCT_UTC, { timeZone: 'Not/AZone' })).toBe('13:05');

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('Not/AZone');
  });

  it('falls back to yyyy-MM-dd for an unknown date format and warns once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(formatTenantDateTime(OCT_UTC, { timeZone: 'UTC', dateFormat: 'd/M/yy' })).toBe('2026-10-15 13:05');
    expect(formatTenantDate(OCT_UTC, { timeZone: 'UTC', dateFormat: 'd/M/yy' })).toBe('2026-10-15');

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('d/M/yy');
  });

  it('falls back to 24h for an unknown time format and warns once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(formatTenantTime(OCT_UTC, { timeZone: 'UTC', timeFormat: '24H' })).toBe('13:05');
    expect(formatTenantTime(OCT_UTC, { timeZone: 'UTC', timeFormat: '24H' })).toBe('13:05');

    expect(warn).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['an empty string', ''],
    ['an unparseable string', 'not a date'],
    ['an invalid Date', new Date(Number.NaN)],
    ['the .NET MinValue (0001-01-01)', '0001-01-01T00:00:00+00:00'],
    ['the .NET MinValue without an offset', '0001-01-01T00:00:00'],
  ])('returns an empty string for %s', (_label, value) => {
    const settings = { timeZone: 'Europe/London', dateFormat: 'dd/MM/yyyy', timeFormat: '12h' };
    expect(formatTenantDateTime(value, settings)).toBe('');
    expect(formatTenantDate(value, settings)).toBe('');
    expect(formatTenantTime(value, settings)).toBe('');
    expect(formatChatTimestamp(value, settings)).toBe('');
  });
});

describe('formatChatTimestamp', () => {
  const settings = { timeZone: 'Europe/London', dateFormat: 'dd MMM, yyyy', timeFormat: '24h' } as const;
  const now = new Date('2026-10-15T20:00:00Z');

  it('shows only the time for a message sent today', () => {
    expect(formatChatTimestamp(OCT_UTC, settings, now)).toBe('14:05');
  });

  it('shows the date and time for an older message', () => {
    expect(formatChatTimestamp('2026-10-14T13:05:00Z', settings, now)).toBe('14 Oct, 2026 14:05');
    expect(formatChatTimestamp('2025-10-15T13:05:00Z', settings, now)).toBe('15 Oct, 2025 14:05');
  });

  it('decides "today" in the tenant zone, not UTC', () => {
    // 14:30 UTC is 23:30 on the 15th in Tokyo, but "now" (15:30 UTC) is already the 16th there.
    const tokyo = { timeZone: 'Asia/Tokyo', dateFormat: 'yyyy-MM-dd', timeFormat: '24h' };
    const tokyoNow = new Date('2026-10-15T15:30:00Z');
    expect(formatChatTimestamp('2026-10-15T14:30:00Z', tokyo, tokyoNow)).toBe('2026-10-15 23:30');
    // In UTC both instants fall on the 15th.
    expect(formatChatTimestamp('2026-10-15T14:30:00Z', { ...tokyo, timeZone: 'UTC' }, tokyoNow)).toBe('14:30');
  });

  it('defaults "now" to the current time', () => {
    expect(formatChatTimestamp(new Date(), { timeZone: 'UTC', timeFormat: '24h' })).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe('Intl formatter cache', () => {
  it('builds one formatter per time zone, however many timestamps are formatted', () => {
    const RealDateTimeFormat = Intl.DateTimeFormat;
    const spy = vi
      .spyOn(Intl, 'DateTimeFormat')
      .mockImplementation(function (...args: ConstructorParameters<typeof Intl.DateTimeFormat>) {
        return new RealDateTimeFormat(...args);
      } as unknown as typeof Intl.DateTimeFormat);

    for (let minute = 0; minute < 20; minute++) {
      formatTenantDateTime(`2026-10-15T13:${String(minute).padStart(2, '0')}:00Z`, { timeZone: 'Pacific/Chatham' });
    }

    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('format helpers', () => {
  it('recognises only whitelisted date formats', () => {
    expect(isDateFormat('dd/MM/yyyy')).toBe(true);
    expect(isDateFormat('DD/MM/YYYY')).toBe(false);
    expect(isDateFormat(undefined)).toBe(false);
  });

  it('resolves missing values to the defaults without warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(resolveDateFormat(undefined)).toBe(DEFAULT_DATE_FORMAT);
    expect(resolveDateFormat('')).toBe('yyyy-MM-dd');
    expect(resolveTimeFormat(null)).toBe('24h');
    expect(resolveDateFormat('MMMM dd, yyyy')).toBe('MMMM dd, yyyy');
    expect(resolveTimeFormat('12h')).toBe('12h');

    expect(warn).not.toHaveBeenCalled();
  });

  it('parses ISO strings with offsets to the same instant', () => {
    expect(toDisplayableDate('2026-10-15T14:05:00+01:00')?.toISOString()).toBe('2026-10-15T13:05:00.000Z');
  });
});

describe('ISO strings without a zone designator', () => {
  const originalTz = process.env.TZ;

  beforeEach(() => {
    // Simulate a browser that is not on UTC (Node applies TZ changes at runtime).
    process.env.TZ = 'America/Los_Angeles';
  });

  afterEach(() => {
    process.env.TZ = originalTz;
  });

  it('runs these tests in a non-UTC local zone', () => {
    expect(new Date('2026-10-15T13:05:00Z').getTimezoneOffset()).not.toBe(0);
  });

  it.each([
    '2026-10-15T13:05:00',
    '2026-10-15T13:05',
    '2026-10-15T13:05:00.1234567',
    '2026-10-15 13:05:00',
  ])('treats %s as UTC, independent of the browser zone', (value) => {
    const settings = { timeZone: 'Europe/London', dateFormat: 'yyyy-MM-dd', timeFormat: '24h' };
    expect(formatTenantDateTime(value, settings)).toBe(formatTenantDateTime('2026-10-15T13:05:00Z', settings));
    expect(formatTenantDateTime(value, settings)).toBe('2026-10-15 14:05');
  });

  it('leaves strings that already carry a zone alone', () => {
    expect(toDisplayableDate('2026-10-15T13:05:00Z')?.toISOString()).toBe('2026-10-15T13:05:00.000Z');
    expect(toDisplayableDate('2026-10-15T13:05:00-07:00')?.toISOString()).toBe('2026-10-15T20:05:00.000Z');
    expect(toDisplayableDate('2026-10-15T13:05:00+0100')?.toISOString()).toBe('2026-10-15T12:05:00.000Z');
  });

  it('leaves date-only strings alone (they already parse as UTC midnight)', () => {
    expect(toDisplayableDate('2026-10-15')?.toISOString()).toBe('2026-10-15T00:00:00.000Z');
  });

  it('still hides an offset-less .NET MinValue', () => {
    expect(toDisplayableDate('0001-01-01T00:00:00')).toBeUndefined();
  });
});

// US 7974 (PR review): .NET sends 7 fractional-second digits, which not every browser parses.
describe('toDisplayableDate with more than three fractional digits', () => {
  it.each([
    ['an offset', '2026-10-19T10:00:00.1234567+00:00', '2026-10-19T10:00:00.123+00:00'],
    ['Z', '2026-10-19T10:00:00.1234567Z', '2026-10-19T10:00:00.123Z'],
    ['no zone designator (UTC)', '2026-10-19T10:00:00.1234567', '2026-10-19T10:00:00.123'],
  ])('reads the same instant as the 3-digit form, with %s', (_label, sevenDigits, threeDigits) => {
    expect(toDisplayableDate(sevenDigits)?.toISOString()).toBe('2026-10-19T10:00:00.123Z');
    expect(toDisplayableDate(sevenDigits)?.getTime()).toBe(toDisplayableDate(threeDigits)?.getTime());
  });

  it('also cuts the fraction when parsing goes through the chat formatter', () => {
    expect(formatTenantDateTime('2026-10-19T10:00:00.1234567+00:00', { timeZone: 'UTC' })).toBe('2026-10-19 10:00');
  });
});
