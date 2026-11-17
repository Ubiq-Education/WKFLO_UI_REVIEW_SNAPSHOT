import { describe, it, expect } from 'vitest';
import { buildChatErrorMessage, isChatErrorMetadata, readChatError } from './chat-runtime-error';
import type { MessageUpdate } from '../services/signalr-service';

// US 7959: the live failed-turn marker becomes a chat entry with friendly text only.
describe('chat runtime error helpers', () => {
  it('recognises the marker by isError and a string errorCode', () => {
    expect(isChatErrorMetadata({ isError: true, errorCode: 'WKFLOAI1101' })).toBe(true);
    expect(isChatErrorMetadata({ isError: true })).toBe(false);
    expect(isChatErrorMetadata({ isError: 'true', errorCode: 'WKFLOAI1101' })).toBe(false);
    expect(isChatErrorMetadata({ isStoppedMarker: true })).toBe(false);
    expect(isChatErrorMetadata(undefined)).toBe(false);
    expect(isChatErrorMetadata(null)).toBe(false);
  });

  it('reads severity and isTerminal', () => {
    expect(readChatError({ errorCode: 'WKFLOAI1102', severity: 'error', isTerminal: true, turnId: 't1' }))
      .toEqual({ code: 'WKFLOAI1102', detailCode: undefined, severity: 'error', isTerminal: true, turnId: 't1' });
    expect(readChatError({ errorCode: 'WKFLOAI1116', severity: 'error', isTerminal: false }).isTerminal).toBe(false);
    // A warning is never terminal; an error without isTerminal is.
    expect(readChatError({ errorCode: 'WKFLOAI1112', severity: 'warning', isTerminal: true })).toMatchObject({ severity: 'warning', isTerminal: false });
    expect(readChatError({ errorCode: 'WKFLOAI1101' })).toMatchObject({ severity: 'error', isTerminal: true });
    expect(readChatError({ errorCode: 'WKFLOAI1111', detailCode: 'WKFLOAI0303' }).detailCode).toBe('WKFLOAI0303');
  });

  const update = (metadata: Record<string, unknown>, overrides: Partial<MessageUpdate> = {}, id = 'marker-1'): MessageUpdate => ({
    chatId: 'session-1',
    message: {
      id,
      type: 'assistant',
      content: 'Sorry, something went wrong while answering. Please try again.',
      timestamp: '2026-10-21T10:00:00Z',
      channelMessageType: 3,
      metadata: { renderAsSystem: true, isError: true, severity: 'error', isTerminal: true, turnId: 'turn-1', ...metadata },
    },
    ...overrides,
  });

  it('builds an assistant entry with the friendly text, keyed by the marker id', () => {
    const message = buildChatErrorMessage(update(
      { errorCode: 'WKFLOAI1103', failedAt: '2026-10-21T10:00:00.1234567Z', error: 'raw backend text' },
      { agentId: 3, agentName: 'Planner', chatbotIconUrl: 'https://cdn.example/p.png' },
    ));

    expect(message).toMatchObject({
      id: 'marker-1',
      type: 'assistant',
      content: 'The assistant is busy right now. Please wait a moment and try again.',
      channelMessageType: 3,
      agentId: 3,
      agentName: 'Planner',
      chatbotIconUrl: 'https://cdn.example/p.png',
      chatError: { code: 'WKFLOAI1103', severity: 'error', isTerminal: true, turnId: 'turn-1' },
    });
    // US 7974: the marker message's own server timestamp wins over metadata.failedAt.
    expect(message.timestamp?.toISOString()).toBe('2026-10-21T10:00:00.000Z');
    expect(message.metadata).toBeUndefined();
    expect(message.messageId).toBeUndefined();
  });

  it('falls back to the ChatTurnFailed text for an unknown code, not the marker content', () => {
    expect(buildChatErrorMessage(update({ errorCode: 'WKFLOAI1999' })).content)
      .toBe('Something went wrong while answering. Please try again.');
  });

  it('takes the agent from the metadata when the envelope has none', () => {
    const message = buildChatErrorMessage(update({ errorCode: 'WKFLOAI1101', agentId: 9, agentName: 'Writer', chatbotIconUrl: 'https://cdn.example/w.png' }));

    expect(message).toMatchObject({ agentId: 9, agentName: 'Writer', chatbotIconUrl: 'https://cdn.example/w.png' });
  });

  it('derives a stable id when the marker has none', () => {
    const first = buildChatErrorMessage(update({ errorCode: 'WKFLOAI1112', severity: 'warning', agentId: 9 }, {}, ''));
    const again = buildChatErrorMessage(update({ errorCode: 'WKFLOAI1112', severity: 'warning', agentId: 9 }, {}, ''));
    const other = buildChatErrorMessage(update({ errorCode: 'WKFLOAI1113', severity: 'warning', agentId: 9 }, {}, ''));

    expect(first.id).toBe(again.id);
    expect(first.id).not.toBe(other.id);
  });

  // US 7974: the marker message's server timestamp first, then failedAt, then the client clock.
  const withTimestamp = (timestamp: string | null | undefined, failedAt?: string) => {
    const base = update({ errorCode: 'WKFLOAI1101', ...(failedAt !== undefined ? { failedAt } : {}) });
    return { ...base, message: { ...base.message, timestamp } };
  };

  it("uses the marker message's server timestamp first", () => {
    const message = buildChatErrorMessage(withTimestamp('2026-10-21T10:00:05.1234567+00:00', '2026-10-21T10:00:00Z'));

    expect(message.timestamp?.toISOString()).toBe('2026-10-21T10:00:05.123Z');
  });

  it.each([undefined, null, 'not a date', '0001-01-01T00:00:00+00:00'])(
    'uses failedAt when the message timestamp is %p',
    (timestamp) => {
      const message = buildChatErrorMessage(withTimestamp(timestamp, '2026-10-21T10:00:00.1234567Z'));

      expect(message.timestamp?.toISOString()).toBe('2026-10-21T10:00:00.123Z');
    }
  );

  it('uses the current time when neither the message timestamp nor failedAt is readable', () => {
    const before = Date.now();
    const message = buildChatErrorMessage(withTimestamp(undefined, 'not a date'));
    const withoutEither = buildChatErrorMessage(withTimestamp(null));

    expect(message.timestamp!.getTime()).toBeGreaterThanOrEqual(before);
    expect(withoutEither.timestamp!.getTime()).toBeGreaterThanOrEqual(before);
  });
});
