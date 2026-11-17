// Overlaps with e2e/support/mocks/chat.ts (PR 17174) and share-chat.ts (PR 17188), which also mock
// the public chat endpoints for their own specs; consolidate once those merge.
import type { MockApi, RecordedRequest } from "../mock-api";

/** The share id the embed's script tag carries. */
export const WIDGET_SHARE_ID = "e2e-widget-share";

const PUBLIC = `/ai/api/v1/agent/${WIDGET_SHARE_ID}`;
export const WIDGET_PATHS = {
  configuration: `${PUBLIC}/chat/configuration`,
  // PublicAgentChatMessage.cs: POST /api/v1/agent/{shareId}/chat/message
  send: `${PUBLIC}/chat/message`,
  // PublicAgentsChatMessagesBySessionIdList.cs: GET /api/v1/agent/{shareId}/chat/{sessionId}/session-messages
  history: `${PUBLIC}/chat/:sessionId/session-messages`,
} as const;

export interface ChatWidgetMocks {
  /** Messages the widget sent (POST chat/message). */
  sends(): RecordedRequest[];
  /** GETs of the chat configuration, one per widget load. */
  configurationLoads(): RecordedRequest[];
}

/**
 * Answers what the widget calls: the chat configuration (the shared default is kept, scoped by the
 * shareId), the message send (the real endpoint answers `SuccessResult<bool>` = `{ data: true }`;
 * the reply itself arrives over SignalR) and the session history. The SignalR negotiate call is
 * answered by MockApi's defaults.
 */
export function installChatWidgetMocks(mockApi: MockApi): ChatWidgetMocks {
  mockApi.on("POST", WIDGET_PATHS.send, () => true);
  return {
    sends: () => mockApi.requestsTo("POST", WIDGET_PATHS.send),
    configurationLoads: () =>
      mockApi.requestsTo("GET", WIDGET_PATHS.configuration),
  };
}

const HOST_PAGE_NOISE = [
  "^WebSocket connection to 'ws:\\/\\/127\\.0\\.0\\.1:\\d+\\/\\?token=[^']+' failed",
  "^\\[vite\\] failed to connect to websocket",
  "Failed to send error to Vite server",
];

/**
 * Console noise of the e2e host page: it is served through page.route(), so Chromium blocks Vite's
 * HMR WebSocket (ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS) and the Vite client logs it. HMR is
 * irrelevant here. `extra` adds the console errors one test expects (for example the browser's
 * "Failed to load resource" line for a mocked 4xx or 5xx). Everything is one alternation on purpose:
 * `allowedConsoleErrors` with exactly two RegExps would be misread as a tuple, and a nested
 * `test.use` replaces the outer one rather than adding to it.
 */
export function hostPageConsoleNoise(...extra: string[]): RegExp {
  return new RegExp([...HOST_PAGE_NOISE, ...extra].join("|"));
}

export const HOST_PAGE_CONSOLE_NOISE = hostPageConsoleNoise();
