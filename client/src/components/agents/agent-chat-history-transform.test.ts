import { describe, it, expect } from 'vitest';
import { transformHistoryMessages } from './agent-chat-history-transform';
import { ChatMessage } from '@shared/services/chat-service';

const SENTINEL = '[Image no longer available — the uploaded image has expired]';

function historyMessage(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id: 'msg-1',
    type: 'assistant',
    content: '',
    timestamp: new Date('2026-08-01T00:00:00Z'),
    channelMessageType: 1,
    ...overrides,
  };
}

describe('transformHistoryMessages — expired image sentinel (Task 7030, "Test Agent" tab)', () => {
  it('does not turn the sentinel contentItems entry into a generic checkmark tool message', () => {
    const result = transformHistoryMessages([
      historyMessage({
        content: '',
        contentItems: [
          {
            name: 'Text Content',
            data: "\n FileName: 'photo.webp'\n FileType: 'image/webp'",
            status: 'success',
            statusCode: 200,
          },
          {
            name: 'Text Content',
            data: SENTINEL,
            status: 'success',
            statusCode: 200,
          },
        ],
      }),
    ]);

    // No synthetic 'tool' message should carry the sentinel as its data, nor should any message
    // render the generic "✓ Successfully executed Text Content" line for it.
    const toolMessagesWithSentinel = result.filter(
      (m) => m.type === 'tool' && m.contentItems?.some((c) => c.data === SENTINEL)
    );
    expect(toolMessagesWithSentinel).toHaveLength(0);
  });

  it('produces a non-tool message carrying the sentinel in contentItems, with empty content (not the literal bracketed text)', () => {
    const result = transformHistoryMessages([
      historyMessage({
        content: '',
        contentItems: [
          {
            name: 'Text Content',
            data: "\n FileName: 'photo.webp'\n FileType: 'image/webp'",
            status: 'success',
            statusCode: 200,
          },
          {
            name: 'Text Content',
            data: SENTINEL,
            status: 'success',
            statusCode: 200,
          },
        ],
      }),
    ]);

    const fallbackMessage = result.find(
      (m) => m.type !== 'tool' && m.contentItems?.some((c) => c.data === SENTINEL)
    );
    expect(fallbackMessage).toBeTruthy();
    expect(fallbackMessage!.content).not.toContain('Image no longer available');
    expect(fallbackMessage!.fileUrl).toBeFalsy();
    expect(fallbackMessage!.file).toBeFalsy();
  });

  it('still emits the FileName info item as its own tool message, unaffected by the sentinel fix', () => {
    const result = transformHistoryMessages([
      historyMessage({
        content: '',
        contentItems: [
          {
            name: 'Text Content',
            data: "\n FileName: 'photo.webp'\n FileType: 'image/webp'",
            status: 'success',
            statusCode: 200,
          },
          {
            name: 'Text Content',
            data: SENTINEL,
            status: 'success',
            statusCode: 200,
          },
        ],
      }),
    ]);

    const fileInfoToolMessage = result.find(
      (m) => m.type === 'tool' && m.contentItems?.[0]?.data?.includes('FileName')
    );
    expect(fileInfoToolMessage).toBeTruthy();
    expect(fileInfoToolMessage!.content).toBe('✓ Successfully executed Text Content');
  });

  it('handles the sentinel when the raw history entry itself is type "tool" (rare, but the plain-content push excludes msg.type === "tool")', () => {
    const result = transformHistoryMessages([
      historyMessage({
        type: 'tool',
        content: '',
        contentItems: [
          { name: 'Text Content', data: SENTINEL, status: 'success', statusCode: 200 },
        ],
      }),
    ]);

    const fallbackMessage = result.find((m) => m.contentItems?.some((c) => c.data === SENTINEL));
    expect(fallbackMessage).toBeTruthy();
    expect(fallbackMessage!.type).not.toBe('tool');
  });

  it('regression: a normal (non-sentinel) contentItems entry on an assistant message still becomes a tool message', () => {
    const result = transformHistoryMessages([
      historyMessage({
        content: '',
        contentItems: [
          { name: 'search_web', data: 'Searched for "hours of operation"', status: 'success', statusCode: 200 },
        ],
      }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('tool');
    expect(result[0].content).toBe('✓ Successfully executed search_web');
  });

  it('regression: a plain assistant message with content and no contentItems is passed through unchanged', () => {
    const result = transformHistoryMessages([
      historyMessage({ content: 'Hello from the agent', contentItems: undefined }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('Hello from the agent');
    expect(result[0].type).toBe('assistant');
  });
});

// US 7575: the admin test chat re-renders a persisted tool-approval request as its card.
describe('transformHistoryMessages — tool approval (US 7575)', () => {
  it('turns a ToolApproval Forms-channel entry into a single approval-card message', () => {
    const result = transformHistoryMessages([
      historyMessage({
        id: 'server-id',
        type: 'system',
        channelMessageType: 4,
        metadata: {
          formType: 'ToolApproval',
          data: JSON.stringify({
            approvalId: 'approval-1',
            sessionId: 'session-1',
            toolName: 'Docs server',
            functionName: 'create_doc',
            expiresAtUtc: '2026-08-01T00:10:00Z',
            status: 'Approved',
            decision: 'AllowOnce',
          }),
        },
      }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('tool-approval-approval-1');
    expect(result[0].toolApproval).toMatchObject({ status: 'Approved', decision: 'AllowOnce', functionName: 'create_doc' });
    expect(result[0].timestamp).toBeInstanceOf(Date);
  });
});

// US 7502: a reopened chat shows the Stop divider where the user pressed Stop.
describe('transformHistoryMessages — Stop marker', () => {
  const marker = historyMessage({
    id: 'assistant-0f0e',
    messageId: '0f0e',
    content: 'Stopped. All agents cancelled.',
    channelMessageType: 3,
    agentId: 1,
    agentName: 'MAISY',
    timestamp: '2026-10-19T10:00:00.1234567+00:00' as unknown as Date,
    metadata: { renderAsSystem: 'True', isStoppedMarker: true, stoppedAt: '2026-10-19T10:00:00.1234567+00:00' },
  });

  it('turns the persisted marker into one divider entry after the partial text', () => {
    const result = transformHistoryMessages([
      historyMessage({ id: 'assistant-1', content: 'Partial answer' }),
      marker,
    ]);

    expect(result).toHaveLength(2);
    expect(result[0].content).toBe('Partial answer');
    expect(result[0].stoppedMarker).toBeUndefined();
    expect(result[1].stoppedMarker).toEqual({ stoppedAt: '2026-10-19T10:00:00.1234567+00:00' });
    // A system entry, though the backend stored it as an assistant message.
    expect(result[1].type).toBe('system');
    expect(result[1].timestamp).toBeInstanceOf(Date);
  });

  it('keeps a Metadata message that is not a marker as before', () => {
    const result = transformHistoryMessages([
      historyMessage({ content: 'Some metadata', channelMessageType: 3, metadata: { renderAsSystem: true } }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].stoppedMarker).toBeUndefined();
    expect(result[0].content).toBe('Some metadata');
  });
});

// US 7974: history timestamps are UTC ISO strings, or null when the server has none.
describe('transformHistoryMessages — timestamps (US 7974)', () => {
  // The raw history carries strings/null, although ChatMessage types the field as a Date.
  const withRawTimestamp = (timestamp: string | null) =>
    historyMessage({ content: 'An answer', timestamp: timestamp as unknown as Date });

  it('parses the UTC timestamp, also one without a zone designator', () => {
    const [withZone] = transformHistoryMessages([withRawTimestamp('2026-10-21T08:30:00+00:00')]);
    const [withoutZone] = transformHistoryMessages([withRawTimestamp('2026-10-21T08:30:00')]);

    expect(withZone.timestamp?.toISOString()).toBe('2026-10-21T08:30:00.000Z');
    expect(withZone.rawTimestamp).toBe('2026-10-21T08:30:00+00:00');
    expect(withoutZone.timestamp?.toISOString()).toBe('2026-10-21T08:30:00.000Z');
  });

  it.each([null, '0001-01-01T00:00:00+00:00', 'not a date'])('leaves no timestamp for %p', (timestamp) => {
    const [message] = transformHistoryMessages([withRawTimestamp(timestamp)]);

    expect(message.content).toBe('An answer');
    expect(message.timestamp).toBeUndefined();
  });
});

// Task 8215: an image the agent returned comes back from history with the image in fileUrl and
// empty content (the backend keeps its FileName/FileType label for the model only).
describe('transformHistoryMessages — image returned by the agent (Task 8215)', () => {
  const fileUrl = 'https://blob.example.com/chat-images/edited.png?sas';
  const label = "FileName: 'edited.png'\nFileType: 'image/png'";
  const labelItem = { name: 'Text Content', data: label, status: 'success', statusCode: 200 };

  it('keeps a user-type returned image with empty content after a reload', () => {
    const result = transformHistoryMessages([
      historyMessage({ type: 'user', content: '', fileUrl, channelMessageType: 3, contentItems: [labelItem] }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].fileUrl).toBe(fileUrl);
    expect(result[0].content).toBe('');
  });

  it('keeps renderAsSystem so the returned image stays on the agent side after a reload', () => {
    const [message] = transformHistoryMessages([
      historyMessage({ type: 'user', content: '', fileUrl, channelMessageType: 3, metadata: { renderAsSystem: true } }),
    ]);

    expect(message.metadata?.renderAsSystem).toBe(true);
  });

  it('does not turn the label of an assistant-role returned image into a tool line', () => {
    const result = transformHistoryMessages([
      historyMessage({ type: 'assistant', content: '', fileUrl, channelMessageType: 3, contentItems: [labelItem] }),
    ]);

    expect(result.filter((m) => m.type === 'tool')).toHaveLength(0);
    expect(result).toHaveLength(1);
    expect(result[0].fileUrl).toBe(fileUrl);
  });
});

describe('transformHistoryMessages — image uploaded by the user (Task 8215)', () => {
  it('keeps an uploaded image with empty content after a reload', () => {
    const fileUrl = 'https://blob.example.com/chat-images/photo.png?sas';
    const result = transformHistoryMessages([historyMessage({ type: 'user', content: '', fileUrl })]);

    expect(result).toHaveLength(1);
    expect(result[0].fileUrl).toBe(fileUrl);
  });
});
