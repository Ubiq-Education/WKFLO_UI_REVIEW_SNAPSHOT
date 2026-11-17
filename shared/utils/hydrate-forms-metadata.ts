import { ChatMessage } from '../services/chat-service';
import { toToolApprovalState, toolApprovalMessageId, withFallbackExpiry } from './tool-approval';
import { isStoppedMarkerMetadata, stoppedMarkerMessageId } from './stopped-marker';

// A "Forms" message (channelMessageType 4) carries a generic { formType, data } envelope in
// its metadata — `formType` discriminates which specific form/card to render, `data` is that
// form's JSON-encoded payload. This is the single place that turns that generic envelope into
// the typed field a card component actually reads (e.g. `message.textSuggestion`), so it must
// run on every message before it's rendered — both the live SignalR path (use-chat.ts) and
// history load (agent-chat-interface.tsx) call this, and chat-messages.tsx/its cards never need
// to know the envelope exists at all.
//
// US 7502: the Stop marker (a Metadata-channel message flagged metadata.isStoppedMarker) is
// translated here too, into `stoppedMarker`, and re-keyed by its stoppedAt so the live marker(s),
// ConversationStopped and a reloaded history entry of the same Stop all merge into one divider.
// It becomes a system entry, whatever type the backend gave it: as an assistant entry, later
// system messages would be inserted above the divider.
export function hydrateFormsMetadata(message: ChatMessage): ChatMessage {
  if (isStoppedMarkerMetadata(message.metadata)) {
    const stoppedAt = typeof message.metadata?.stoppedAt === 'string' ? message.metadata.stoppedAt : '';
    return stoppedAt
      ? { ...message, id: stoppedMarkerMessageId(stoppedAt), type: 'system', stoppedMarker: { stoppedAt } }
      : { ...message, type: 'system', stoppedMarker: { stoppedAt: '' } };
  }
  if (message.metadata?.formType === 'TextSuggestion' && message.metadata?.data) {
    try {
      const parsed = JSON.parse(message.metadata.data);
      return { ...message, textSuggestion: parsed };
    } catch {
      return message;
    }
  } else if (message.metadata?.formType === 'McpOAuthReconnect' && message.metadata?.data) {
    try {
      const parsed = JSON.parse(message.metadata.data);
      return { ...message, mcpOAuthReconnect: parsed };
    } catch {
      return message;
    }
  } else if (message.metadata?.formType === 'ToolApproval' && message.metadata?.data) {
    // US 7575: a persisted "wants to use a tool function" approval request. Re-keyed by
    // approvalId so it merges with the live ToolApprovalRequest event's entry instead of
    // rendering a second card (see toolApprovalMessageId).
    try {
      const raw = message.metadata.data;
      const toolApproval = toToolApprovalState(typeof raw === 'string' ? JSON.parse(raw) : raw);
      if (!toolApproval) return message;
      // No usable expiry on a persisted request: count the 10 minutes from when it was sent.
      const receivedAt = message.timestamp ? new Date(message.timestamp).getTime() : Date.now();
      return { ...message, id: toolApprovalMessageId(toolApproval.approvalId), toolApproval: withFallbackExpiry(toolApproval, receivedAt) };
    } catch {
      return message;
    }
  }
  // Extension point: future form types get another `else if` branch here.
  return message;
}
