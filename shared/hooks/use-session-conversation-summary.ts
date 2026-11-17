import { useEffect, useRef, useState } from 'react';
import type { ChatService } from '../services/chat-service';
import type { ConversationSummary } from '../models/conversation-summary';

// Task 8225: the summary (title, preview) of the conversation that is open in a MAISY chat, for
// the header. A conversation opened from the list already has its row (the caller passes it as
// `skip`); any other one (a stored session restored on load, a new chat) is looked up in the
// conversations endpoint, at most once per session, when `ready` turns on. The caller turns it on
// once the conversation has a completed turn: the server lists a session only after its first
// turn, so an earlier lookup would race the request that creates it. Not polled.
export interface UseSessionConversationSummaryResult {
  summary: ConversationSummary | null;
  // True once the lookup of the current session has finished (found or not).
  isSettled: boolean;
}

export function useSessionConversationSummary(
  chatService: ChatService | null,
  sessionId: string,
  enabled: boolean,
  ready: boolean,
  skip: boolean,
): UseSessionConversationSummaryResult {
  // Results are kept per session, so a late answer for a session that is no longer open can't
  // overwrite the open one's result (PR 17214 review). Each session is looked up at most once per
  // mount; a handful of sessions per page lifetime, so the map stays small.
  const [loadedBySession, setLoadedBySession] = useState<ReadonlyMap<string, ConversationSummary | null>>(() => new Map());
  const startedSessionsRef = useRef<Set<string>>(new Set());
  const shouldLoad = enabled && !!chatService && !!sessionId && ready && !skip;

  useEffect(() => {
    if (!shouldLoad || !chatService || startedSessionsRef.current.has(sessionId)) return;
    startedSessionsRef.current.add(sessionId);

    const settle = (summary: ConversationSummary | null) =>
      setLoadedBySession(previous => new Map(previous).set(sessionId, summary));

    chatService.listConversations()
      .then(result => {
        settle(result.success ? (result.data ?? []).find(row => row.sessionId === sessionId) ?? null : null);
      })
      .catch(() => settle(null));
  }, [chatService, sessionId, shouldLoad]);

  const isSettled = loadedBySession.has(sessionId);
  return { summary: isSettled ? loadedBySession.get(sessionId) ?? null : null, isSettled };
}
