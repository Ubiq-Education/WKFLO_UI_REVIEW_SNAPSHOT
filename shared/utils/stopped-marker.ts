import type { ChatMessage } from '../services/chat-service';

// US 7502: the "Stopped. All agents cancelled." divider shown where the user pressed Stop.
export const STOPPED_MARKER_TEXT = 'Stopped. All agents cancelled.';
// The Chat Widget (isWidget = true) talks to a single chatbot, so its divider just says "Stopped.".
export const STOPPED_MARKER_SHORT_TEXT = 'Stopped.';

// The backend flags its marker message (live ReceiveMessage and history) with this metadata key.
export function isStoppedMarkerMetadata(metadata: Record<string, any> | undefined | null): boolean {
  return metadata?.isStoppedMarker === true;
}

// Epoch milliseconds of a stoppedAt value, or null when it can't be read. The marker messages and
// ConversationStopped carry the same instant, but not always in the same format (offset vs "Z",
// 3 vs 7 fractional digits), so they are compared by time, not by text. Fractions are cut to
// milliseconds first: not every browser parses more than three digits.
export function parseStoppedAt(stoppedAt: string | undefined | null): number | null {
  if (!stoppedAt) return null;
  const normalized = stoppedAt.trim().replace(/(\.\d{3})\d+/, '$1');
  const time = Date.parse(normalized);
  return Number.isNaN(time) ? null : time;
}

// One id per Stop: every marker message and ConversationStopped of the same Stop map to it, so the
// shared message list (which merges entries by id) keeps a single divider.
export function stoppedMarkerMessageId(stoppedAt: string): string {
  const time = parseStoppedAt(stoppedAt);
  return `stopped-marker-${time ?? stoppedAt}`;
}

// The divider entry for a Stop that has no marker message (ConversationStopped when no agent was
// mid-turn), or before the marker arrives.
export function buildStoppedMarkerMessage(stoppedAt: string): ChatMessage {
  const time = parseStoppedAt(stoppedAt);
  return {
    id: stoppedMarkerMessageId(stoppedAt),
    type: 'system',
    content: STOPPED_MARKER_TEXT,
    timestamp: time !== null ? new Date(time) : new Date(),
    channelMessageType: 3,
    stoppedMarker: { stoppedAt },
  };
}
