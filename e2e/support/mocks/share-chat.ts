// Overlaps with e2e/support/mocks/chat.ts (PR 17174) and share-pages.ts (PR 17182); consolidate once those merge.
import type { MockApi, RecordedRequest } from "../mock-api";
import { reply } from "../mock-api";
import type { SignalRHub } from "../signalr-hub";

/** The share id the public chat on the Chat UI share page talks to. */
export const SHARE_ID = "e2e-public-share";

const PUBLIC = `/ai/api/v1/agent/${SHARE_ID}`;
export const PUBLIC_PATHS = {
  send: `${PUBLIC}/chat/message`,
  rate: `${PUBLIC}/chat/message/rate`,
  history: `${PUBLIC}/chat/:sessionId/session-messages`,
} as const;

/** A history entry as GET .../session-messages returns it. */
export interface HistoryMessage {
  id: string;
  messageId?: string;
  type: "user" | "assistant";
  content: string;
  channelMessageType?: number;
  timestamp?: string;
  rating?: "thumbsUp" | "thumbsDown" | null;
  metadata?: Record<string, unknown>;
}

export interface ShareChatOptions {
  predefinedPrompts?: Array<{ title: string; prompt: string }>;
}

export interface ShareChatMocks {
  /** What GET session-messages returns. Mutate it before the chat loads (or before "Load Message History"). */
  history: HistoryMessage[];
  /** Messages the chat sent (POST chat/message). */
  sends(): RecordedRequest[];
  ratings(): RecordedRequest[];
  /** GETs of the session history, one per load. */
  historyLoads(): RecordedRequest[];
}

/**
 * Makes the Chat UI share page's preview a live public chat (it only is one once the chat setting
 * carries a shareId) and answers the public chat calls: send, rate and session history.
 * A test overrides one with `mockApi.on(...)`, for example `mockApi.on("POST", PUBLIC_PATHS.rate, () => reply({ errors: [...] }, 500))`.
 */
export function installShareChatMocks(
  mockApi: MockApi,
  options: ShareChatOptions = {},
): ShareChatMocks {
  const history: HistoryMessage[] = [];
  mockApi.on(
    "GET",
    "/md/api/v1/tenant/agent/:id/chat-setting/:kind",
    ({ params }) => ({
      ...mockApi.seed.chatSetting,
      agentId: Number(params.id),
      isShareable: true,
      shareId: SHARE_ID,
      securityConfiguration: { type: "none" },
      predefinedPrompts: options.predefinedPrompts ?? [],
    }),
  );
  mockApi.on("GET", PUBLIC_PATHS.history, () => history);
  mockApi.on("POST", PUBLIC_PATHS.send, () => true);
  mockApi.on("POST", PUBLIC_PATHS.rate, () => true);
  return {
    history,
    sends: () => mockApi.requestsTo("POST", PUBLIC_PATHS.send),
    ratings: () => mockApi.requestsTo("POST", PUBLIC_PATHS.rate),
    historyLoads: () => mockApi.requestsTo("GET", PUBLIC_PATHS.history),
  };
}

export { reply };

export interface McpReconnect {
  toolName: string;
  startPath: string;
  message: string;
}

/**
 * Pushes the MCP reconnect card the way the backend does (SemanticKernelExtensions.SendMcpOAuthReconnectNotificationAsync):
 * live only over SignalR, never persisted, so session-messages can not return it.
 */
export function emitMcpReconnect(
  hub: SignalRHub,
  chatId: string,
  reconnect: McpReconnect,
): void {
  hub.emit("ReceiveMessage", {
    chatId,
    message: {
      id: "e2e-mcp-reconnect",
      type: "system",
      content: reconnect.message,
      channelMessageType: 4,
      timestamp: "2026-01-15T10:00:00Z",
      metadata: {
        renderAsSystem: true,
        formType: "McpOAuthReconnect",
        data: JSON.stringify(reconnect),
      },
    },
  });
}
