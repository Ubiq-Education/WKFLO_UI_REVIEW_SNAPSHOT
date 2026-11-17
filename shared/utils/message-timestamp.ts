import { toDisplayableDate } from './format-date-time';

/**
 * US 7974: the timestamp of a chat history entry. History timestamps are UTC ISO strings, or null
 * when the server has none (older entries, tool-call messages); those show no time rather than
 * the epoch or "now".
 */
export function toHistoryTimestamp(value: unknown): Date | undefined {
  return value instanceof Date || typeof value === 'string' ? toDisplayableDate(value) : undefined;
}

/**
 * US 7974: the timestamp of a live SignalR update - the server's own (so a bubble shows the same
 * time live and after a reload), or the client's clock when the update carries none (a backend
 * that doesn't send it yet).
 */
export function serverTimestampOrNow(value: unknown): Date {
  return toHistoryTimestamp(value) ?? new Date();
}
