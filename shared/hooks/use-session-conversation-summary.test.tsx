import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useSessionConversationSummary } from './use-session-conversation-summary';
import type { ChatService } from '../services/chat-service';
import type { ConversationSummary } from '../models/conversation-summary';

const row = (sessionId: string, title: string): ConversationSummary => ({
  sessionId,
  title,
  previewLine: null,
  lastActivityAt: '2026-11-02T10:00:00Z',
  agents: [{ agentId: 1, name: 'MAISY', role: null, avatarUrl: null }],
});

type ListResult = { success: boolean; data?: ConversationSummary[] };

// Each listConversations() call returns a promise the test resolves by hand, so it can control
// the order in which answers arrive.
function deferredService() {
  const pending: Array<(result: ListResult) => void> = [];
  const listConversations = vi.fn(() => new Promise<ListResult>(resolve => pending.push(resolve)));
  return { service: { listConversations } as unknown as ChatService, listConversations, pending };
}

describe('useSessionConversationSummary (Task 8225)', () => {
  it('looks the session up once and returns its row', async () => {
    const { service, listConversations, pending } = deferredService();

    const { result, rerender } = renderHook(
      ({ sessionId }) => useSessionConversationSummary(service, sessionId, true, true, false),
      { initialProps: { sessionId: 'A' } },
    );

    expect(result.current.isSettled).toBe(false);
    await act(async () => pending[0]({ success: true, data: [row('A', 'Title A')] }));

    expect(result.current).toEqual({ summary: row('A', 'Title A'), isSettled: true });
    rerender({ sessionId: 'A' });
    expect(listConversations).toHaveBeenCalledTimes(1);
  });

  it("doesn't let a late answer for an earlier session replace the open session's result", async () => {
    const { service, listConversations, pending } = deferredService();

    const { result, rerender } = renderHook(
      ({ sessionId }) => useSessionConversationSummary(service, sessionId, true, true, false),
      { initialProps: { sessionId: 'A' } },
    );

    // A's lookup is in flight; the user moves to B, whose lookup answers first.
    rerender({ sessionId: 'B' });
    await waitFor(() => expect(listConversations).toHaveBeenCalledTimes(2));
    await act(async () => pending[1]({ success: true, data: [row('B', 'Title B')] }));
    expect(result.current).toEqual({ summary: row('B', 'Title B'), isSettled: true });

    // A's answer arrives late: B keeps its result.
    await act(async () => pending[0]({ success: true, data: [row('A', 'Title A')] }));
    expect(result.current).toEqual({ summary: row('B', 'Title B'), isSettled: true });

    // Going back to A uses A's own (late) result without another request.
    rerender({ sessionId: 'A' });
    expect(result.current).toEqual({ summary: row('A', 'Title A'), isSettled: true });
    expect(listConversations).toHaveBeenCalledTimes(2);
  });

  it('settles with no summary when the session is not listed or the request fails', async () => {
    const { service, pending } = deferredService();

    const { result, rerender } = renderHook(
      ({ sessionId }) => useSessionConversationSummary(service, sessionId, true, true, false),
      { initialProps: { sessionId: 'missing' } },
    );
    await act(async () => pending[0]({ success: true, data: [row('other', 'Other')] }));
    expect(result.current).toEqual({ summary: null, isSettled: true });

    rerender({ sessionId: 'failed' });
    await waitFor(() => expect(pending).toHaveLength(2));
    await act(async () => pending[1]({ success: false }));
    expect(result.current).toEqual({ summary: null, isSettled: true });
  });

  it('makes no request while not ready or when the row is already known', () => {
    const { service, listConversations } = deferredService();

    renderHook(() => useSessionConversationSummary(service, 'A', true, false, false));
    renderHook(() => useSessionConversationSummary(service, 'A', true, true, true));
    renderHook(() => useSessionConversationSummary(service, 'A', false, true, false));

    expect(listConversations).not.toHaveBeenCalled();
  });
});
