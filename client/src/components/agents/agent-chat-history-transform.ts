import { ChatMessage, MessageType } from '@shared/services/chat-service';
import { isExpiredImageSentinel, findExpiredImageContentItem } from '@shared/utils/expired-image-sentinel';
import { hydrateFormsMetadata } from '@shared/utils/hydrate-forms-metadata';
import { isImageLabel } from '@shared/utils/image-label';
import { toHistoryTimestamp } from '@shared/utils/message-timestamp';

// US 7974: history timestamps arrive as UTC ISO strings (typed as Date), or null when the server
// has none - then no time is shown, instead of `new Date(null)`'s 1970.
const rawTimestampOf = (value: unknown) => (typeof value === 'string' ? value : undefined);

// Extracted from agent-chat.tsx's fetchedMessages useEffect (Task 7030) so this transform is
// independently unit-testable — it has no JSX/hooks of its own, only history-message shaping.
//
// Turns each raw history `ChatMessage` (as returned by chatService.readMessages) into zero or
// more renderable messages for AgentChatMessages:
//   - Each `contentItems` entry on an assistant/tool message becomes its own synthetic
//     'tool'-type message (a checkmark/failure line + expandable detail), UNLESS it's the
//     expired-image sentinel (see below) or it duplicates the message's own `content` (already
//     shown by the plain-content push below).
//   - The message's own `content`/`file`/`fileUrl` (if any) becomes a plain message, unless the
//     message is itself a 'tool' entry (those are represented purely via their contentItems).
//
// Task 7030 fix: a `contentItems` entry whose `data` is the backend's expired-image sentinel
// ("[Image no longer available — the uploaded image has expired]") is NOT a real tool
// invocation — rendering it as a generic "✓ Successfully executed Text Content" checkmark line
// (the previous behavior) discarded the signal entirely. Instead:
//   - It's excluded from the synthetic-tool-message loop.
//   - It's carried through on a plain (non-'tool'-typed) message's `contentItems`, so
//     AgentChatMessages's existing sentinel-detection (shared with the widget/chat-messages.tsx
//     path) can render the image-expired.svg fallback for it instead of a checkmark or literal
//     bracketed text.
//   - If the *original* message itself is of type 'tool' (so the plain-content push above would
//     never fire for it, since that branch explicitly excludes msg.type === 'tool'), a dedicated
//     fallback message is emitted instead so the image still renders.
export function transformHistoryMessages(fetchedMessages: ChatMessage[]): ChatMessage[] {
  return fetchedMessages.flatMap((msg: ChatMessage) => {
    // US 7575: a persisted tool-approval request (Forms channel, formType "ToolApproval")
    // re-renders as its approval card, with the status it had when the history was saved.
    if (msg.channelMessageType === 4) {
      const hydrated = hydrateFormsMetadata(msg);
      if (hydrated.toolApproval) {
        return [{
          ...hydrated,
          timestamp: toHistoryTimestamp(msg.timestamp),
          rawTimestamp: rawTimestampOf(msg.timestamp),
        } as ChatMessage];
      }
    }

    // US 7502: the persisted Stop marker re-renders as the "Stopped. All agents cancelled."
    // divider, never as an assistant bubble.
    if (msg.channelMessageType === 3) {
      const hydrated = hydrateFormsMetadata(msg);
      if (hydrated.stoppedMarker) {
        return [{
          ...hydrated,
          timestamp: toHistoryTimestamp(msg.timestamp),
          rawTimestamp: rawTimestampOf(msg.timestamp),
        } as ChatMessage];
      }
    }

    const result: ChatMessage[] = [];
    const expiredImageItem = findExpiredImageContentItem(msg.contentItems);

    if ((msg.type == "assistant" || msg.type == "tool") && msg.contentItems && Array.isArray(msg.contentItems)) {
      msg.contentItems.filter(item => item.data !== msg.content || msg.type !== 'assistant').forEach((tool: any, toolIndex: number) => {
        if (tool.description === msg.content && msg.type === 'assistant') {
          return; // Skip adding a separate message for text content
        }
        if (tool === expiredImageItem) {
          return; // Task 7030: not a real tool call — surfaced as an image fallback below instead
        }
        if (msg.fileUrl && isImageLabel(tool.data)) {
          return; // Task 8215: an image's FileName/FileType label, not a tool call
        }
        result.push({
          id: `tool-${msg.id}-${toolIndex}`,
          type: 'tool' as MessageType,
          content: `${tool.status !== 'failed' ? '✓ Successfully executed' : '❌ Failed to execute'} ${tool.name}`,
          timestamp: toHistoryTimestamp(msg.timestamp),
          channelMessageType: msg.channelMessageType,
          contentItems: [tool],
          agentId: msg.agentId,
          agentName: msg.agentName
        } as ChatMessage);
      });
    }

    // Task 8215: an image (returned or uploaded) comes with empty content, so its fileUrl keeps it.
    if (((msg.content && msg.content.trim() !== '') || !!expiredImageItem || !!msg.fileUrl) && msg.type != "tool") {
      result.push({
        id: msg.id,
        messageId: msg.messageId,
        type: msg.type,
        content: msg.content,
        file: msg.file,
        fileUrl: msg.fileUrl,
        // Task 8215: renderAsSystem keeps a returned image (a 'user'-role message) on the agent side.
        metadata: msg.metadata,
        // Needed so AgentChatMessages's expired-image-sentinel detection (which reads
        // message.contentItems) has something to find when the sentinel lives there rather
        // than in `content` — harmless to carry through otherwise.
        contentItems: msg.contentItems,
        timestamp: toHistoryTimestamp(msg.timestamp),
        rawTimestamp: rawTimestampOf(msg.timestamp),
        rating: msg.rating,
        channelMessageType: msg.channelMessageType,
        agentId: msg.agentId,
        agentName: msg.agentName
      } as ChatMessage);
    } else if (expiredImageItem && msg.type === "tool") {
      // Rare: the raw history entry itself is type 'tool' (not assistant), so the plain-content
      // push above never fires for it (it explicitly excludes msg.type === 'tool'). Emit a
      // dedicated fallback message so the image still renders instead of vanishing entirely.
      result.push({
        id: `image-expired-${msg.id}`,
        type: 'assistant' as MessageType,
        content: '',
        contentItems: msg.contentItems,
        timestamp: toHistoryTimestamp(msg.timestamp),
        rawTimestamp: rawTimestampOf(msg.timestamp),
        channelMessageType: msg.channelMessageType,
        agentId: msg.agentId,
        agentName: msg.agentName
      } as ChatMessage);
    }

    return result;
  });
}

// Re-exported purely so callers/tests importing from this module don't also need to reach into
// shared/utils directly for the common case of checking a single message.
export { isExpiredImageSentinel, findExpiredImageContentItem };
