import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useConversations } from './use-conversations';
import type { ChatService } from '../services/chat-service';
import type { ConversationSummary } from '../models/conversation-summary';

const conversation = (sessionId: string, lastActivityAt: string): ConversationSummary => ({
  sessionId,
  title: sessionId,
  previewLine: null,
  lastActivityAt,
  agents: [{ agentId: 1, name: 'MAISY', role: null, avatarUrl: null }],
});

function serviceReturning(...results: Array<{ success: boolean; data?: ConversationSummary[] }>) {
  const listConversations = vi.fn();
  results.forEach(result => listConversations.mockResolvedValueOnce(result));
  return { service: { listConversations } as unknown as ChatService, listConversations };
}

describe('useConversations (US 7507)', () => {
  it('does not load while disabled', () => {
    const { service, listConversations } = serviceReturning({ success: true, data: [] });

    const { result } = renderHook(() => useConversations(service, false));

    expect(listConversations).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
  });

  it('loads the conversations, newest activity first', async () => {
    const { service } = serviceReturning({
      success: true,
      data: [conversation('older', '2026-09-20T10:00:00Z'), conversation('newer', '2026-09-27T10:00:00Z')],
    });

    const { result } = renderHook(() => useConversations(service, true));

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.conversations.map(c => c.sessionId)).toEqual(['newer', 'older']);
  });

  it('reports an error when the list cannot be loaded', async () => {
    const { service } = serviceReturning({ success: false });

    const { result } = renderHook(() => useConversations(service, true));

    await waitFor(() => expect(result.current.status).toBe('error'));
  });

  it('loads again on refresh', async () => {
    const { service, listConversations } = serviceReturning(
      { success: true, data: [conversation('first', '2026-09-20T10:00:00Z')] },
      { success: true, data: [conversation('second', '2026-09-27T10:00:00Z')] },
    );

    const { result } = renderHook(() => useConversations(service, true));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    act(() => result.current.refresh());

    await waitFor(() => expect(result.current.conversations[0]?.sessionId).toBe('second'));
    expect(listConversations).toHaveBeenCalledTimes(2);
  });

  it('drops a response that a newer load overtook', async () => {
    let resolveFirst: (value: { success: boolean; data: ConversationSummary[] }) => void = () => {};
    const listConversations = vi.fn()
      .mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; }))
      .mockResolvedValueOnce({ success: true, data: [conversation('newest', '2026-09-27T10:00:00Z')] });
    const service = { listConversations } as unknown as ChatService;

    const { result } = renderHook(() => useConversations(service, true));
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => resolveFirst({ success: true, data: [conversation('stale', '2026-09-01T10:00:00Z')] }));

    expect(result.current.conversations.map(c => c.sessionId)).toEqual(['newest']);
  });
});
