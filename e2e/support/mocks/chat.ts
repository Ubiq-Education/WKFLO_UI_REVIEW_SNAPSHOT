import type { MockApi, RecordedRequest } from "../mock-api";
import type { SignalRHub } from "../signalr-hub";

/** Tenant chat endpoints of one agent, as the main app's Test Agent chat calls them. */
const BASE = "/ai/api/v1/tenant/agent/:agentId";
export const CHAT_PATHS = {
  send: `${BASE}/chat/message`,
  stop: `${BASE}/chat/stop`,
  approval: `${BASE}/tool-approval/:approvalId`,
  contactForm: `${BASE}/contact-form/submit`,
  rate: `${BASE}/chat/message/rate`,
} as const;

export const STOPPED_AT = "2026-01-15T10:00:00.000Z";

export interface ChatMocks {
  /** Messages the chat sent (POST chat/message). */
  sends(): RecordedRequest[];
  stops(): RecordedRequest[];
  approvals(): RecordedRequest[];
  contactForms(): RecordedRequest[];
  ratings(): RecordedRequest[];
}

/**
 * Default replies for every tenant chat call that a Test Agent chat makes after it mounts (the
 * mount calls themselves are defaults of MockApi). A test overrides one with `mockApi.on(...)`,
 * for example `mockApi.on("POST", CHAT_PATHS.send, () => reply({ errors: [...] }, 400))`.
 */
export function installChatMocks(mockApi: MockApi): ChatMocks {
  mockApi.on("POST", CHAT_PATHS.send, () => ({ message: "accepted" }));
  mockApi.on("POST", CHAT_PATHS.stop, () => ({ stoppedAt: STOPPED_AT }));
  mockApi.on("POST", CHAT_PATHS.approval, () => true);
  mockApi.on("POST", CHAT_PATHS.contactForm, () => true);
  mockApi.on("POST", CHAT_PATHS.rate, () => true);
  return {
    sends: () => mockApi.requestsTo("POST", CHAT_PATHS.send),
    stops: () => mockApi.requestsTo("POST", CHAT_PATHS.stop),
    approvals: () => mockApi.requestsTo("POST", /\/tool-approval\/[^/]+$/),
    contactForms: () => mockApi.requestsTo("POST", CHAT_PATHS.contactForm),
    ratings: () => mockApi.requestsTo("POST", CHAT_PATHS.rate),
  };
}

/**
 * A failed turn as the backend pushes it: a Metadata-channel marker message with the error code.
 * The shared hub's `runtimeError()` has no `detailCode` and reuses one message id per code, so the
 * chat tests build the marker here and push it with `hub.emit()`.
 *
 * Only the marker is sent. The backend (ChatTurnErrorNotifier.SendAsync) also sends typing-off before
 * it and, for a terminal error, ConversationStateUpdate "error" after it, but the chat ends the turn on
 * the marker alone (use-chat.ts handleChatError), so the tests prove that without the other events.
 */
export function emitRuntimeError(
  hub: SignalRHub,
  chatId: string,
  code: string,
  options: { id?: string; severity?: "error" | "warning"; isTerminal?: boolean; detailCode?: string } = {},
): void {
  const { id = `e2e-error-${code}-${options.detailCode ?? "none"}`, severity = "error", isTerminal = true, detailCode } = options;
  hub.emit("ReceiveMessage", {
    chatId,
    message: {
      id,
      type: "assistant",
      content: "",
      channelMessageType: 3,
      metadata: { isError: true, errorCode: code, detailCode, severity, isTerminal, turnId: "e2e-turn" },
    },
  });
}
