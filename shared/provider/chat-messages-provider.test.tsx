import React from 'react';
import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { ChatMessagesProvider, useChatMessages, SharedChatMessage } from './chat-messages-provider';
import { hydrateFormsMetadata } from '../utils/hydrate-forms-metadata';
import type { ToolApprovalState } from '../utils/tool-approval';

function wrapper({ children }: { children: React.ReactNode }) {
  return <ChatMessagesProvider>{children}</ChatMessagesProvider>;
}

function approvalMessage(toolApproval: Partial<ToolApprovalState>): SharedChatMessage {
  return {
    id: 'tool-approval-a1',
    type: 'system',
    content: '',
    timestamp: new Date(),
    channelMessageType: 4,
    source: 'text',
    toolApproval: {
      chatId: 's1',
      sessionId: 's1',
      approvalId: 'a1',
      toolName: 'Docs server',
      functionName: 'create_doc',
      expiresAtUtc: new Date(Date.now() + 60_000).toISOString(),
      status: 'Pending',
      ...toolApproval,
    },
  };
}

// US 7575 (PR review): the same approval can arrive again as its persisted "Pending" copy.
describe('ChatMessagesProvider — tool approval merge', () => {
  it('keeps a local "already answered" (409) state when a Pending copy arrives later', () => {
    const { result } = renderHook(() => useChatMessages(), { wrapper });

    act(() => result.current.addMessage(approvalMessage({ alreadyAnswered: true })));
    act(() => result.current.addMessage(approvalMessage({})));

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].toolApproval?.alreadyAnswered).toBe(true);
  });

  it('keeps a recorded answer when a Pending copy arrives later', () => {
    const { result } = renderHook(() => useChatMessages(), { wrapper });

    act(() => result.current.addMessage(approvalMessage({ status: 'Approved', decision: 'AllowOnce' })));
    act(() => result.current.addMessage(approvalMessage({})));

    expect(result.current.messages[0].toolApproval).toMatchObject({ status: 'Approved', decision: 'AllowOnce' });
  });

  it('still takes a resolved copy over a pending one', () => {
    const { result } = renderHook(() => useChatMessages(), { wrapper });

    act(() => result.current.addMessage(approvalMessage({})));
    act(() => result.current.addMessage(approvalMessage({ status: 'Denied', decision: 'Deny' })));

    expect(result.current.messages[0].toolApproval).toMatchObject({ status: 'Denied' });
  });
});

// US 7502 (approved change 10): the Stop divider goes below the partial text, not above it.
describe('ChatMessagesProvider — Stop divider placement', () => {
  it('appends the divider after a trailing assistant message', () => {
    const { result } = renderHook(() => useChatMessages(), { wrapper });

    act(() => result.current.addMessage({
      id: 'reply-1', type: 'assistant', content: 'Partial answer', timestamp: new Date(), channelMessageType: 1, source: 'text',
    }));
    act(() => result.current.addMessage({
      id: 'stopped-marker-1', type: 'system', content: 'Stopped. All agents cancelled.', timestamp: new Date(),
      channelMessageType: 3, source: 'text', stoppedMarker: { stoppedAt: '2026-10-19T10:00:00Z' },
    }));

    expect(result.current.messages.map(m => m.id)).toEqual(['reply-1', 'stopped-marker-1']);
  });

  it('keeps a single history marker below the partial text when later system messages come', () => {
    const { result } = renderHook(() => useChatMessages(), { wrapper });
    // As loaded from history: the backend stores the marker as an assistant message.
    const marker = hydrateFormsMetadata({
      id: 'assistant-0f0e', type: 'assistant', content: 'Stopped. All agents cancelled.', timestamp: new Date(),
      channelMessageType: 3, metadata: { isStoppedMarker: true, stoppedAt: '2026-10-19T10:00:00Z' },
    });

    act(() => result.current.addMessage({
      id: 'reply-1', type: 'assistant', content: 'Partial answer', timestamp: new Date(), channelMessageType: 1, source: 'text',
    }));
    act(() => result.current.addMessage(marker));
    expect(result.current.messages.find(m => m.stoppedMarker)?.type).toBe('system');

    act(() => result.current.addMessage({
      id: 'meta-1', type: 'system', content: 'Some metadata', timestamp: new Date(), channelMessageType: 3, source: 'text',
    }));
    expect(result.current.messages.map(m => m.id)).toEqual(['reply-1', marker.id, 'meta-1']);
  });

  it('keeps the divider a system entry when the backend marker merges into it', () => {
    const { result } = renderHook(() => useChatMessages(), { wrapper });

    act(() => result.current.addMessage({
      id: 'reply-1', type: 'assistant', content: 'Partial answer', timestamp: new Date(), channelMessageType: 1, source: 'text',
    }));
    act(() => result.current.addMessage({
      id: 'stopped-marker-1', type: 'system', content: 'Stopped. All agents cancelled.', timestamp: new Date(),
      channelMessageType: 3, source: 'text', stoppedMarker: { stoppedAt: '2026-10-19T10:00:00Z' },
    }));
    // The backend's marker message for the same Stop arrives as an assistant message.
    act(() => result.current.addMessage({
      id: 'stopped-marker-1', type: 'assistant', content: 'Stopped. All agents cancelled.', timestamp: new Date(),
      channelMessageType: 3, source: 'text', agentId: 1, agentName: 'MAISY',
    }));

    const divider = result.current.messages.find(m => m.id === 'stopped-marker-1');
    expect(divider?.type).toBe('system');
    expect(divider?.stoppedMarker).toEqual({ stoppedAt: '2026-10-19T10:00:00Z' });

    // A later system message goes after the divider, not spliced above it.
    act(() => result.current.addMessage({
      id: 'meta-1', type: 'system', content: 'Some metadata', timestamp: new Date(), channelMessageType: 3, source: 'text',
    }));
    expect(result.current.messages.map(m => m.id)).toEqual(['reply-1', 'stopped-marker-1', 'meta-1']);
  });

  it('still inserts other system messages before a trailing assistant message', () => {
    const { result } = renderHook(() => useChatMessages(), { wrapper });

    act(() => result.current.addMessage({
      id: 'reply-1', type: 'assistant', content: 'Answer', timestamp: new Date(), channelMessageType: 1, source: 'text',
    }));
    act(() => result.current.addMessage({
      id: 'meta-1', type: 'system', content: 'Some metadata', timestamp: new Date(), channelMessageType: 3, source: 'text',
    }));

    expect(result.current.messages.map(m => m.id)).toEqual(['meta-1', 'reply-1']);
  });
});

// US 7502: the divider from the Stop response goes right after the message that was last at Stop.
describe('ChatMessagesProvider — insertMessageAfter', () => {
  const msg = (id: string, type: 'user' | 'assistant' | 'system' = 'assistant', content = id): SharedChatMessage => ({
    id, type, content, timestamp: new Date(), channelMessageType: 1, source: 'text',
  });

  function seeded(ids: string[]) {
    const hook = renderHook(() => useChatMessages(), { wrapper });
    ids.forEach(id => act(() => hook.result.current.addMessage(msg(id))));
    return hook;
  }

  it('inserts right after the anchor message', () => {
    const { result } = seeded(['a', 'b', 'c']);

    act(() => result.current.insertMessageAfter('a', msg('new', 'system')));

    expect(result.current.messages.map(m => m.id)).toEqual(['a', 'new', 'b', 'c']);
  });

  it('inserts at the start when there was no message (null anchor)', () => {
    const { result } = seeded(['a']);

    act(() => result.current.insertMessageAfter(null, msg('new', 'system')));

    expect(result.current.messages.map(m => m.id)).toEqual(['new', 'a']);
  });

  it('appends when the anchor is gone', () => {
    const { result } = seeded(['a', 'b']);

    act(() => result.current.insertMessageAfter('missing', msg('new', 'system')));

    expect(result.current.messages.map(m => m.id)).toEqual(['a', 'b', 'new']);
  });

  // US 7502: the Stop response's divider goes right after the message last at Stop, even when the
  // marker of the same Stop arrived first, after a message sent since.
  describe('moveExisting (the Stop response)', () => {
    const divider = (content = 'Stopped. All agents cancelled.'): SharedChatMessage => ({
      id: 'stopped-marker-1', type: 'system', content, timestamp: new Date(), channelMessageType: 3, source: 'text',
      stoppedMarker: { stoppedAt: '2026-10-19T10:00:00Z' },
    });

    it('moves a divider that the marker added below a new message back after the anchor', () => {
      const { result } = seeded(['partial']);
      act(() => result.current.addMessage(msg('user-2', 'user')));
      act(() => result.current.addMessage(divider()));
      expect(result.current.messages.map(m => m.id)).toEqual(['partial', 'user-2', 'stopped-marker-1']);

      act(() => result.current.insertMessageAfter('partial', divider(), 'text', { moveExisting: true }));

      expect(result.current.messages.map(m => m.id)).toEqual(['partial', 'stopped-marker-1', 'user-2']);
      expect(result.current.messages[1].type).toBe('system');
    });

    it('leaves the order alone when the response comes first and the marker merges later', () => {
      const { result } = seeded(['partial']);
      act(() => result.current.insertMessageAfter('partial', divider(), 'text', { moveExisting: true }));
      act(() => result.current.addMessage(msg('user-2', 'user')));
      act(() => result.current.addMessage(divider('marker content')));

      expect(result.current.messages.map(m => m.id)).toEqual(['partial', 'stopped-marker-1', 'user-2']);
    });

    it('does not move the divider again for a later echo', () => {
      const { result } = seeded(['partial']);
      act(() => result.current.addMessage(msg('user-2', 'user')));
      act(() => result.current.addMessage(divider()));
      act(() => result.current.insertMessageAfter('partial', divider(), 'text', { moveExisting: true }));
      act(() => result.current.addMessage(msg('reply-2')));

      // ConversationStopped / a late marker of the same Stop merge in place.
      act(() => result.current.addMessage(divider()));

      expect(result.current.messages.map(m => m.id)).toEqual(['partial', 'stopped-marker-1', 'user-2', 'reply-2']);
    });

    it('merges in place when the anchor is gone', () => {
      const { result } = seeded(['partial']);
      act(() => result.current.addMessage(msg('user-2', 'user')));
      act(() => result.current.addMessage(divider()));

      act(() => result.current.insertMessageAfter('missing', divider(), 'text', { moveExisting: true }));

      expect(result.current.messages.map(m => m.id)).toEqual(['partial', 'user-2', 'stopped-marker-1']);
    });
  });

  it('merges in place when a message with the same id already exists', () => {
    const { result } = seeded(['a', 'b']);

    act(() => result.current.insertMessageAfter('b', msg('a', 'assistant', 'updated')));

    expect(result.current.messages.map(m => m.id)).toEqual(['a', 'b']);
    expect(result.current.messages[0].content).toBe('updated');
  });
});
