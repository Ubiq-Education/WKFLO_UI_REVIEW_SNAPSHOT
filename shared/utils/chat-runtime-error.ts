import type { ChatMessage } from '../services/chat-service';
import type { MessageUpdate } from '../services/signalr-service';
import { describeChatRuntimeError } from './chat-send-errors';
import { toHistoryTimestamp } from './message-timestamp';

// US 7959: the live message the backend sends (ReceiveMessage, Metadata channel) when a chat turn
// - or a tool it uses - fails while the assistant is answering. Live only: it is never saved to the
// chat history. The chat shows the friendly text of its code, never the backend's own text.

export type ChatErrorSeverity = 'error' | 'warning';

// What the chat keeps about a failure on its message entry.
export interface ChatErrorState {
  // A chat runtime code (WKFLOAI11xx).
  code: string;
  // Optional already-public validation code behind ChatAgentUnavailable.
  detailCode?: string;
  // "warning" (a tool is unavailable; the turn goes on) or "error".
  severity: ChatErrorSeverity;
  // True when the whole turn ended because of this failure.
  isTerminal: boolean;
  turnId?: string;
}

// The backend flags its failed-turn marker with these metadata keys (CommonMetadataConsts).
export function isChatErrorMetadata(metadata: Record<string, any> | undefined | null): boolean {
  return metadata?.isError === true && typeof metadata.errorCode === 'string';
}

// The failure a marker's metadata describes. Only a warning when the backend says so; an error
// without isTerminal is taken as terminal, so the chat never stays "working" on a failed turn.
export function readChatError(metadata: Record<string, any>): ChatErrorState {
  const severity: ChatErrorSeverity = metadata.severity === 'warning' ? 'warning' : 'error';
  return {
    code: metadata.errorCode,
    detailCode: typeof metadata.detailCode === 'string' ? metadata.detailCode : undefined,
    severity,
    isTerminal: severity === 'error' && metadata.isTerminal !== false,
    turnId: typeof metadata.turnId === 'string' && metadata.turnId ? metadata.turnId : undefined,
  };
}

// US 7974: when the failure happened - the marker message's own server timestamp, then its
// metadata.failedAt (older backends), then this client's clock.
function errorTimestamp(update: MessageUpdate, metadata: Record<string, any>): Date {
  return toHistoryTimestamp(update.message.timestamp) ?? toHistoryTimestamp(metadata.failedAt) ?? new Date();
}

// The chat entry for a marker: shown with the failing agent's avatar and name, with the friendly
// text of its code. Its id is the marker's own (the backend derives it from the turn and the agent,
// and the code for a warning), so a resent marker merges into the same entry.
export function buildChatErrorMessage(update: MessageUpdate): ChatMessage {
  const metadata = update.message.metadata ?? {};
  const chatError = readChatError(metadata);
  const agentId = update.agentId ?? (typeof metadata.agentId === 'number' ? metadata.agentId : undefined);
  const agentName = update.agentName || (typeof metadata.agentName === 'string' ? metadata.agentName : undefined);
  const chatbotIconUrl = update.chatbotIconUrl || (typeof metadata.chatbotIconUrl === 'string' ? metadata.chatbotIconUrl : undefined);
  const id = update.message.id
    || `chat-error-${chatError.severity}-${chatError.turnId ?? ''}-${agentId ?? agentName ?? ''}${chatError.severity === 'warning' ? `-${chatError.code}` : ''}`;

  return {
    id,
    type: 'assistant',
    content: describeChatRuntimeError(chatError.code, chatError.detailCode),
    timestamp: errorTimestamp(update, metadata),
    channelMessageType: 3,
    agentId,
    agentName,
    chatbotIconUrl,
    chatError,
  };
}
