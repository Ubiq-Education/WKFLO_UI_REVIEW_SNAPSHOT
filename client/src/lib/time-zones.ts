// Intl helpers that the chat widget also needs live in the shared module; re-exported so existing
// imports from "@/lib/time-zones" keep working.
export { formatDateTime, isValidTimeZone } from "@shared/utils/format-date-time";

export interface TimeZoneOption {
  /** IANA id, e.g. "Europe/London" - this is what gets persisted. */
  value: string;
  /** Display label, e.g. "(GMT+01:00) Europe/London". */
  label: string;
}

// Used when the browser can't enumerate its time zones (Intl.supportedValuesOf is ES2022).
export const FALLBACK_TIME_ZONES: readonly string[] = ["UTC"];

/**
 * Every IANA time zone the browser knows about. "UTC" is always included: some engines (e.g. V8)
 * leave it out of supportedValuesOf, but it's the server-side default so it must be selectable.
 */
export function getSupportedTimeZones(): string[] {
  let zones: string[] = [];
  try {
    zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  } catch {
    zones = [];
  }
  if (zones.length === 0) return [...FALLBACK_TIME_ZONES];
  return zones.includes("UTC") ? zones : ["UTC", ...zones];
}

const OFFSET_PATTERN = /^GMT([+-])(\d{2}):(\d{2})$/;

/**
 * The zone's GMT offset at `date`, normalised to "GMT+HH:MM" (Intl renders a zero offset as plain
 * "GMT"). Returns undefined for unknown zones or engines without "longOffset" support.
 */
export function getGmtOffset(timeZone: string, date: Date): string | undefined {
  try {
    const part = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
      .formatToParts(date)
      .find((p) => p.type === "timeZoneName")?.value;
    if (!part) return undefined;
    if (part === "GMT") return "GMT+00:00";
    return OFFSET_PATTERN.test(part) ? part : undefined;
  } catch {
    return undefined;
  }
}

function offsetToMinutes(offset: string | undefined): number {
  const match = offset ? OFFSET_PATTERN.exec(offset) : null;
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === "-" ? -minutes : minutes;
}

function describeTimeZone(timeZone: string, date: Date): { option: TimeZoneOption; minutes: number } {
  const offset = getGmtOffset(timeZone, date);
  return {
    option: { value: timeZone, label: offset ? `(${offset}) ${timeZone}` : timeZone },
    minutes: offsetToMinutes(offset),
  };
}

export function toTimeZoneOption(timeZone: string, date: Date): TimeZoneOption {
  return describeTimeZone(timeZone, date).option;
}

/** Options sorted west-to-east by current offset, then alphabetically. */
export function buildTimeZoneOptions(timeZones: readonly string[], date: Date): TimeZoneOption[] {
  return timeZones
    .map((timeZone) => describeTimeZone(timeZone, date))
    .sort((a, b) => a.minutes - b.minutes || a.option.value.localeCompare(b.option.value))
    .map(({ option }) => option);
}

// Building ~420 formatters is not free, and the list only changes across DST boundaries, so it is
// computed once per page load.
let cachedOptions: TimeZoneOption[] | undefined;

export function getTimeZoneOptions(): TimeZoneOption[] {
  cachedOptions ??= buildTimeZoneOptions(getSupportedTimeZones(), new Date());
  return cachedOptions;
}
