import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatService } from '../services/chat-service';
import type { ConversationSummary } from '../models/conversation-summary';
import { sortByLastActivity } from '../utils/conversation-list-format';

// US 7507: the MAISY conversations list. Loads when `enabled` turns on (e.g. MAISY agent, chat
// service ready, auth ready) and again on refresh() - e.g. each time the list is shown. A response
// that a newer load has overtaken is dropped. The list is kept while reloading, so it doesn't flash.
export type ConversationsStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface UseConversationsResult {
  conversations: ConversationSummary[];
  status: ConversationsStatus;
  refresh: () => void;
}

export function useConversations(chatService: ChatService | null, enabled: boolean): UseConversationsResult {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [status, setStatus] = useState<ConversationsStatus>('idle');
  const [reloadCount, setReloadCount] = useState(0);
  const loadTokenRef = useRef<object | null>(null);

  useEffect(() => {
    if (!enabled || !chatService) return;

    const token = {};
    loadTokenRef.current = token;
    setStatus('loading');

    chatService.listConversations()
      .then(result => {
        if (loadTokenRef.current !== token) return;
        if (result.success) {
          setConversations(sortByLastActivity(result.data ?? []));
          setStatus('ready');
        } else {
          setStatus('error');
        }
      })
      .catch(() => {
        if (loadTokenRef.current === token) setStatus('error');
      });

    return () => {
      // Unmount or a newer load: whatever this one returns is no longer wanted.
      if (loadTokenRef.current === token) loadTokenRef.current = null;
    };
  }, [chatService, enabled, reloadCount]);

  const refresh = useCallback(() => setReloadCount(count => count + 1), []);

  return { conversations, status, refresh };
}
