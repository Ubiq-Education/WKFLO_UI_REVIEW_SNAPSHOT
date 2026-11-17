import { describe, it, expect } from 'vitest';
import { hydrateFormsMetadata } from './hydrate-forms-metadata';
import { ChatMessage } from '../services/chat-service';

function buildMessage(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id: 'msg-1',
    type: 'assistant',
    content: '',
    timestamp: new Date(),
    channelMessageType: 4,
    ...overrides,
  };
}

describe('hydrateFormsMetadata', () => {
  it('parses a TextSuggestion form envelope into message.textSuggestion', () => {
    const payload = { featureId: 42, suggestedText: 'Suggested copy.', featureName: 'About Us' };
    const message = buildMessage({
      metadata: { formType: 'TextSuggestion', data: JSON.stringify(payload) },
    });

    const result = hydrateFormsMetadata(message);

    expect(result.textSuggestion).toEqual(payload);
    // Everything else on the message must pass through untouched.
    expect(result.id).toBe(message.id);
    expect(result.metadata).toBe(message.metadata);
  });

  it('returns the message unchanged when formType is missing', () => {
    const message = buildMessage({ metadata: { data: '{}' } });

    expect(hydrateFormsMetadata(message)).toBe(message);
  });

  it('returns the message unchanged when formType is an unrecognized value', () => {
    const message = buildMessage({ metadata: { formType: 'SomethingElse', data: '{}' } });

    const result = hydrateFormsMetadata(message);

    expect(result).toBe(message);
    expect(result.textSuggestion).toBeUndefined();
  });

  it('returns the message unchanged when there is no metadata at all', () => {
    const message = buildMessage({});

    expect(hydrateFormsMetadata(message)).toBe(message);
  });

  it('falls back to the original message when data is not valid JSON', () => {
    const message = buildMessage({
      metadata: { formType: 'TextSuggestion', data: 'not json' },
    });

    const result = hydrateFormsMetadata(message);

    expect(result).toBe(message);
    expect(result.textSuggestion).toBeUndefined();
  });

  it('returns the message unchanged when formType matches but data is empty', () => {
    const message = buildMessage({
      metadata: { formType: 'TextSuggestion', data: '' },
    });

    const result = hydrateFormsMetadata(message);

    expect(result).toBe(message);
    expect(result.textSuggestion).toBeUndefined();
  });

  it('parses a McpOAuthReconnect form envelope into message.mcpOAuthReconnect', () => {
    const payload = {
      toolName: 'Canva',
      startPath: '/ai/api/v1/agent/share-1/tool/conn-1/mcp/oauth/start',
      message: 'Canva needs to be reconnected.',
    };
    const message = buildMessage({
      metadata: { formType: 'McpOAuthReconnect', data: JSON.stringify(payload) },
    });

    const result = hydrateFormsMetadata(message);

    expect(result.mcpOAuthReconnect).toEqual(payload);
    // Everything else on the message must pass through untouched.
    expect(result.id).toBe(message.id);
    expect(result.metadata).toBe(message.metadata);
  });

  it('falls back to the original message when McpOAuthReconnect data is not valid JSON', () => {
    const message = buildMessage({
      metadata: { formType: 'McpOAuthReconnect', data: 'not json' },
    });

    const result = hydrateFormsMetadata(message);

    expect(result).toBe(message);
    expect(result.mcpOAuthReconnect).toBeUndefined();
  });

  // US 7575: a persisted "Ask for permission" request re-renders its card on history reload,
  // keyed by approvalId so it merges with the live ToolApprovalRequest entry.
  it('parses a ToolApproval form envelope into message.toolApproval, keyed by approvalId', () => {
    const payload = {
      chatId: 'session-1',
      sessionId: 'session-1',
      approvalId: 'approval-9',
      agentName: 'Helper',
      toolName: 'Docs server',
      functionName: 'create_doc',
      argumentsJson: '{}',
      expiresAtUtc: '2026-10-06T10:10:00Z',
      status: 'Denied',
    };
    const message = buildMessage({ messageId: 'server-guid', metadata: { formType: 'ToolApproval', data: JSON.stringify(payload) } });

    const result = hydrateFormsMetadata(message);

    expect(result.id).toBe('tool-approval-approval-9');
    expect(result.messageId).toBe('server-guid');
    expect(result.toolApproval).toMatchObject({ approvalId: 'approval-9', functionName: 'create_doc', status: 'Denied' });
  });

  // WI 7726: optional friendly function text; payloads saved before it existed don't have it.
  it('reads the optional friendly function name and description when present', () => {
    const base = { approvalId: 'a', toolName: 't', functionName: 'create_doc', functionDescription: 'Calls POST /docs', expiresAtUtc: '' };
    const friendly = hydrateFormsMetadata(buildMessage({
      metadata: {
        formType: 'ToolApproval',
        data: JSON.stringify({ ...base, functionDisplayName: 'Create a document', functionDisplayDescription: 'Adds a new document' }),
      },
    }));
    const older = hydrateFormsMetadata(buildMessage({
      metadata: { formType: 'ToolApproval', data: JSON.stringify({ ...base, functionDisplayName: null }) },
    }));

    expect(friendly.toolApproval).toMatchObject({
      functionName: 'create_doc',
      functionDisplayName: 'Create a document',
      functionDisplayDescription: 'Adds a new document',
    });
    expect(older.toolApproval?.functionName).toBe('create_doc');
    expect(older.toolApproval?.functionDisplayName).toBeUndefined();
    expect(older.toolApproval?.functionDisplayDescription).toBeUndefined();
  });

  it('maps a decision-style status and defaults a missing status to Pending', () => {
    const base = { approvalId: 'a', toolName: 't', functionName: 'f', expiresAtUtc: '' };
    const allowed = hydrateFormsMetadata(buildMessage({
      metadata: { formType: 'ToolApproval', data: JSON.stringify({ ...base, status: 'AllowForConversation' }) },
    }));
    const pending = hydrateFormsMetadata(buildMessage({
      metadata: { formType: 'ToolApproval', data: JSON.stringify(base) },
    }));

    expect(allowed.toolApproval).toMatchObject({ status: 'Approved', decision: 'AllowForConversation' });
    expect(pending.toolApproval?.status).toBe('Pending');
  });

  it('leaves a ToolApproval message without an approvalId untouched', () => {
    const message = buildMessage({ metadata: { formType: 'ToolApproval', data: JSON.stringify({ toolName: 'x' }) } });

    expect(hydrateFormsMetadata(message)).toBe(message);
  });
});

describe('hydrateFormsMetadata — ToolApproval expiry fallback', () => {
  it('counts 10 minutes from the message time when the request has no usable expiry', () => {
    const sentAt = new Date('2026-10-06T10:00:00Z');
    const message = buildMessage({
      timestamp: sentAt,
      metadata: { formType: 'ToolApproval', data: JSON.stringify({ approvalId: 'a', toolName: 't', functionName: 'f', expiresAtUtc: 'not a date' }) },
    });

    expect(hydrateFormsMetadata(message).toolApproval?.expiresAtUtc).toBe('2026-10-06T10:10:00.000Z');
  });
});

// US 7502: the persisted / live Stop marker becomes the divider, keyed by its stoppedAt.
describe('hydrateFormsMetadata — Stop marker', () => {
  const historyMarker = (metadata: Record<string, any>) => buildMessage({
    id: 'assistant-0f0e',
    messageId: '0f0e',
    type: 'assistant',
    content: 'Stopped. All agents cancelled.',
    channelMessageType: 3,
    metadata,
  });

  it('turns a marker into stoppedMarker, re-keyed by stoppedAt', () => {
    const result = hydrateFormsMetadata(historyMarker({
      renderAsSystem: 'True',
      isStoppedMarker: true,
      stoppedAt: '2026-10-19T10:00:00.1234567+00:00',
    }));

    expect(result.stoppedMarker).toEqual({ stoppedAt: '2026-10-19T10:00:00.1234567+00:00' });
    expect(result.type).toBe('system');
    expect(result.id).toBe(`stopped-marker-${Date.UTC(2026, 9, 19, 10, 0, 0, 123)}`);
    expect(result.messageId).toBe('0f0e');
  });

  it('still marks a marker without stoppedAt, keeping its id', () => {
    const result = hydrateFormsMetadata(historyMarker({ isStoppedMarker: true }));

    expect(result.stoppedMarker).toBeDefined();
    expect(result.type).toBe('system');
    expect(result.id).toBe('assistant-0f0e');
  });

  it('ignores a metadata message without isStoppedMarker', () => {
    const message = historyMarker({ renderAsSystem: true });

    expect(hydrateFormsMetadata(message)).toBe(message);
  });
});
