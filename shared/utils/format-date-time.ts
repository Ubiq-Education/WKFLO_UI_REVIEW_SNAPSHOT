/**
 * Tenant-aware date/time formatting shared by the main app and the chat widget.
 *
 * Everything is driven by explicit inputs (the tenant's IANA time zone, .NET-style date format and
 * 12h/24h time format) rather than the browser locale or zone, so every viewer sees the same text.
 * Built on Intl only: each whitelisted date pattern is assembled from `formatToParts` output with an
 * explicit per-pattern mapping (no generic token parser, no date library).
 */

export type TimeFormat = "12h" | "24h";

/**
 * Date patterns a tenant can pick. Stored and sent to/from the API as these exact .NET format
 * strings; the server validates against the same whitelist.
 */
export const DATE_FORMATS = [
  "dd/MM/yyyy",
  "MM/dd/yyyy",
  "yyyy-MM-dd",
  "dd-MM-yyyy",
  "MM-dd-yyyy",
  "MMM dd, yyyy",
  "MMMM dd, yyyy",
  "dd MMM, yyyy",
  "dd MMMM, yyyy",
  "ddd, MMMM dd, yyyy",
  "ddd, dd MMMM, yyyy",
] as const;

export type DateFormat = (typeof DATE_FORMATS)[number];

export const DEFAULT_DATE_FORMAT: DateFormat = "yyyy-MM-dd";
export const DEFAULT_TIME_FORMAT: TimeFormat = "24h";
export const DEFAULT_TIME_ZONE = "UTC";

/** The tenant settings the formatter needs. Missing or unknown values fall back to the defaults. */
export interface DateTimeFormatSettings {
  timeZone?: string | null;
  dateFormat?: string | null;
  timeFormat?: string | null;
}

export type DateTimeInput = Date | string | null | undefined;

// .NET's invariant/en-US month names, so the output matches what the server would render.
const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

interface DateParts {
  year: string; // 4 digits, zero padded (yyyy)
  month: number; // 1-12
  day: number; // 1-31
  weekday: string; // "Mon" (ddd)
  hour: number; // 0-23
  minute: number; // 0-59
}

const pad2 = (value: number) => String(value).padStart(2, "0");

// One explicit mapping per whitelisted pattern.
const DATE_PATTERNS: Record<DateFormat, (p: DateParts) => string> = {
  "dd/MM/yyyy": (p) => `${pad2(p.day)}/${pad2(p.month)}/${p.year}`,
  "MM/dd/yyyy": (p) => `${pad2(p.month)}/${pad2(p.day)}/${p.year}`,
  "yyyy-MM-dd": (p) => `${p.year}-${pad2(p.month)}-${pad2(p.day)}`,
  "dd-MM-yyyy": (p) => `${pad2(p.day)}-${pad2(p.month)}-${p.year}`,
  "MM-dd-yyyy": (p) => `${pad2(p.month)}-${pad2(p.day)}-${p.year}`,
  "MMM dd, yyyy": (p) => `${MONTHS_SHORT[p.month - 1]} ${pad2(p.day)}, ${p.year}`,
  "MMMM dd, yyyy": (p) => `${MONTHS_LONG[p.month - 1]} ${pad2(p.day)}, ${p.year}`,
  "dd MMM, yyyy": (p) => `${pad2(p.day)} ${MONTHS_SHORT[p.month - 1]}, ${p.year}`,
  "dd MMMM, yyyy": (p) => `${pad2(p.day)} ${MONTHS_LONG[p.month - 1]}, ${p.year}`,
  "ddd, MMMM dd, yyyy": (p) => `${p.weekday}, ${MONTHS_LONG[p.month - 1]} ${pad2(p.day)}, ${p.year}`,
  "ddd, dd MMMM, yyyy": (p) => `${p.weekday}, ${pad2(p.day)} ${MONTHS_LONG[p.month - 1]}, ${p.year}`,
};

const TIME_PATTERNS: Record<TimeFormat, (p: DateParts) => string> = {
  // HH:mm
  "24h": (p) => `${pad2(p.hour)}:${pad2(p.minute)}`,
  // h:mm tt
  "12h": (p) => `${p.hour % 12 || 12}:${pad2(p.minute)} ${p.hour < 12 ? "AM" : "PM"}`,
};

const DATE_FORMAT_SET: ReadonlySet<string> = new Set(DATE_FORMATS);

export function isDateFormat(value: unknown): value is DateFormat {
  return typeof value === "string" && DATE_FORMAT_SET.has(value);
}

export function isTimeFormat(value: unknown): value is TimeFormat {
  return value === "12h" || value === "24h";
}

export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

// Warn once per distinct bad value so a misconfigured tenant is visible without flooding the console.
const warned = new Set<string>();
function warnOnce(key: string, message: string) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(message);
}

/** Missing values silently use the default; unknown values use it too, with a one-off warning. */
export function resolveDateFormat(value: string | null | undefined): DateFormat {
  if (isDateFormat(value)) return value;
  if (value) warnOnce(`date:${value}`, `Unknown date format "${value}"; using ${DEFAULT_DATE_FORMAT}.`);
  return DEFAULT_DATE_FORMAT;
}

export function resolveTimeFormat(value: string | null | undefined): TimeFormat {
  if (isTimeFormat(value)) return value;
  if (value) warnOnce(`time:${value}`, `Unknown time format "${value}"; using ${DEFAULT_TIME_FORMAT}.`);
  return DEFAULT_TIME_FORMAT;
}

// Intl.DateTimeFormat construction is comparatively expensive and chat lists format many
// timestamps, so one formatter is kept per requested zone (invalid zones map to the UTC one).
const partsFormatters = new Map<string, Intl.DateTimeFormat>();

function createPartsFormatter(timeZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  });
}

function getPartsFormatter(timeZone: string | null | undefined): Intl.DateTimeFormat {
  const key = timeZone || DEFAULT_TIME_ZONE;
  let formatter = partsFormatters.get(key);
  if (!formatter) {
    try {
      formatter = createPartsFormatter(key);
    } catch {
      warnOnce(`zone:${key}`, `Unknown time zone "${key}"; using ${DEFAULT_TIME_ZONE}.`);
      formatter = partsFormatters.get(DEFAULT_TIME_ZONE) ?? createPartsFormatter(DEFAULT_TIME_ZONE);
      partsFormatters.set(DEFAULT_TIME_ZONE, formatter);
    }
    partsFormatters.set(key, formatter);
  }
  return formatter;
}

function getParts(date: Date, timeZone: string | null | undefined): DateParts {
  const values: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {};
  for (const part of getPartsFormatter(timeZone).formatToParts(date)) {
    values[part.type] = part.value;
  }
  return {
    year: (values.year ?? "").padStart(4, "0"),
    month: Number(values.month),
    day: Number(values.day),
    weekday: values.weekday ?? "",
    // Some engines render midnight as "24" even with h23.
    hour: Number(values.hour) % 24,
    minute: Number(values.minute),
  };
}

// An ISO date-time with no "Z" or "+hh:mm" offset, e.g. "2026-10-15T13:05:00" (a serialised .NET
// DateTime with an unspecified kind). `new Date()` would read it in the browser's own zone.
const OFFSETLESS_ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;

// More than three fractional-second digits, e.g. .NET's ".1234567".
const EXTRA_FRACTION_DIGITS = /(\.\d{3})\d+/;

function parseDate(value: string): Date {
  // .NET sends 7 fractional digits, which not every browser (e.g. Safari) parses: cut them to
  // milliseconds first. Server timestamps are UTC, so a missing zone designator means UTC.
  // Date-only strings already parse as UTC, and strings with an offset are unambiguous; both are
  // left alone.
  const normalized = value.trim().replace(EXTRA_FRACTION_DIGITS, "$1");
  return new Date(OFFSETLESS_ISO_DATE_TIME.test(normalized) ? `${normalized.replace(" ", "T")}Z` : normalized);
}

/**
 * Parses the input, returning undefined for anything that shouldn't be displayed: missing values,
 * unparseable strings and the .NET default `0001-01-01` (DateTime/DateTimeOffset.MinValue), which
 * is what a message without a stored timestamp can come back as.
 */
export function toDisplayableDate(value: DateTimeInput): Date | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const date = value instanceof Date ? value : parseDate(value);
  const time = date.getTime();
  if (Number.isNaN(time) || date.getUTCFullYear() <= 1) return undefined;
  return date;
}

/** The date only, e.g. "2026-10-15" for yyyy-MM-dd. Empty string for invalid/missing input. */
export function formatTenantDate(value: DateTimeInput, settings: DateTimeFormatSettings): string {
  const date = toDisplayableDate(value);
  if (!date) return "";
  return DATE_PATTERNS[resolveDateFormat(settings.dateFormat)](getParts(date, settings.timeZone));
}

/** The time only, e.g. "14:05" (24h) or "2:05 PM" (12h). Empty string for invalid/missing input. */
export function formatTenantTime(value: DateTimeInput, settings: DateTimeFormatSettings): string {
  const date = toDisplayableDate(value);
  if (!date) return "";
  return TIME_PATTERNS[resolveTimeFormat(settings.timeFormat)](getParts(date, settings.timeZone));
}

/** Date and time, e.g. "2026-10-15 14:05". Empty string for invalid/missing input. */
export function formatTenantDateTime(value: DateTimeInput, settings: DateTimeFormatSettings): string {
  const date = toDisplayableDate(value);
  if (!date) return "";
  const parts = getParts(date, settings.timeZone);
  const datePart = DATE_PATTERNS[resolveDateFormat(settings.dateFormat)](parts);
  return `${datePart} ${TIME_PATTERNS[resolveTimeFormat(settings.timeFormat)](parts)}`;
}

/**
 * Chat bubble timestamp: only the time when `value` falls on the same calendar day as `now` in the
 * tenant's zone, otherwise date and time. `now` is injectable for tests.
 */
export function formatChatTimestamp(
  value: DateTimeInput,
  settings: DateTimeFormatSettings,
  now: Date = new Date()
): string {
  const date = toDisplayableDate(value);
  if (!date) return "";
  const parts = getParts(date, settings.timeZone);
  const today = getParts(now, settings.timeZone);
  const time = TIME_PATTERNS[resolveTimeFormat(settings.timeFormat)](parts);
  const isToday = parts.year === today.year && parts.month === today.month && parts.day === today.day;
  return isToday ? time : `${DATE_PATTERNS[resolveDateFormat(settings.dateFormat)](parts)} ${time}`;
}

/**
 * Formats `date` in `timeZone` using the 12h/24h `timeFormat`, e.g. "15 Oct 2026, 14:05" or
 * "15 Oct 2026, 2:05 pm". Falls back to UTC if the zone is unknown to the browser.
 * Locale-styled (en-GB) and independent of the tenant date format; prefer formatTenantDateTime
 * for anything that should follow the tenant's settings.
 */
export function formatDateTime(date: Date, timeZone: string, timeFormat: TimeFormat): string {
  const options: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hourCycle: timeFormat === "12h" ? "h12" : "h23",
    timeZone: isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIME_ZONE,
  };
  return new Intl.DateTimeFormat("en-GB", options).format(date);
}
