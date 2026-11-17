import { formatFileSize, MAX_IMAGE_SIZE_BYTES } from './file-validation';

// Mirrors the AI API's ErrorConst.cs (AMAIS.WKFLO.AI.Application/Common) - keep in sync with it.
export const AiErrorConst = {
  // common
  InvalidInput: 'WKFLOAI0001',
  Required: 'WKFLOAI0002',
  MinimumLength: 'WKFLOAI0003',
  MaximumLength: 'WKFLOAI0004',
  MustBePositive: 'WKFLOAI0005',
  MustBeInRangeMin1Max50: 'WKFLOAI0006',
  MustBeInRangeMin1Max100: 'WKFLOAI0007',
  MustBeInRangeMin1Max500: 'WKFLOAI0008',
  MustBeInRangeMin1Max1000: 'WKFLOAI0009',
  InvalidLanguage: 'WKFLOAI0010',
  InvalidEmail: 'WKFLOAI0011',
  InvalidPhone: 'WKFLOAI0012',
  InvalidCountry: 'WKFLOAI0013',
  AttachmentsTooLarge: 'WKFLOAI0014',
  ImageTooLarge: 'WKFLOAI0015',
  UnsupportedImageFormat: 'WKFLOAI0016',

  // Tenant
  TenantInvalid: 'WKFLOAI0101',
  TenantMustExist: 'WKFLOAI0102',

  // Domain
  DomainInvalid: 'WKFLOAI0201',

  // Agent
  AgentMustNotExist: 'WKFLOAI0301',
  AgentMustExist: 'WKFLOAI0302',
  AgentNotFound: 'WKFLOAI0303',
  AgentAndToolMustExist: 'WKFLOAI0304',
  AgentNotRunnable: 'WKFLOAI0305',
  AgentRoleMustBeUnique: 'WKFLOAI0306',

  // Tool
  ToolMustNotExist: 'WKFLOAI0401',
  ToolMustExist: 'WKFLOAI0402',
  ToolNotFound: 'WKFLOAI0403',

  // AI Model
  AIModelMustNotExist: 'WKFLOAI0501',
  AIModelMustExist: 'WKFLOAI0502',
  AIModelNotFound: 'WKFLOAI0503',

  // Secret
  SecretMustNotExist: 'WKFLOAI0601',
  SecretMustExist: 'WKFLOAI0602',
  SecretNotFound: 'WKFLOAI0603',

  // Knowledge
  KnowledgeMustNotExist: 'WKFLOAI0701',
  KnowledgeMustExist: 'WKFLOAI0702',
  KnowledgeNotFound: 'WKFLOAI0703',

  // Tool MCP OAuth (public chat widget entry point)
  ToolMcpOAuthNotConfigured: 'WKFLOAI0801',
  ToolMcpOAuthConsentFailed: 'WKFLOAI0802',

  // MCP function discovery (WI 7447)
  ToolMustBeMcp: 'WKFLOAI0404',
  ToolMcpOAuthNotConnected: 'WKFLOAI0405',
  ToolMcpUnavailable: 'WKFLOAI0406',

  // Tool approvals (WI 7575)
  ToolApprovalNotFound: 'WKFLOAI0901',
  ToolApprovalAlreadyDecided: 'WKFLOAI0902',
  ToolApprovalExpired: 'WKFLOAI0903',
  ToolApprovalDecisionInvalid: 'WKFLOAI0904',

  // Chat Stop (US 7501)
  ChatSessionNotOwned: 'WKFLOAI1001',

  // Chat runtime (US 7959): a chat turn that failed after the send endpoint returned, pushed over
  // SignalR. Keep in sync with ErrorConst.cs and with ChatErrorCodes.cs
  // (AMAIS.WKFLO.Common.AI.Application/Domain/Agents/ChatErrors), where the backend defines them.
  ChatTurnFailed: 'WKFLOAI1101',
  ChatModelTimeout: 'WKFLOAI1102',
  ChatModelRateLimited: 'WKFLOAI1103',
  ChatModelQuotaExceeded: 'WKFLOAI1104',
  ChatModelAuthFailed: 'WKFLOAI1105',
  ChatModelContentFiltered: 'WKFLOAI1106',
  ChatModelContextTooLong: 'WKFLOAI1107',
  ChatModelUnavailable: 'WKFLOAI1108',
  ChatModelConfigInvalid: 'WKFLOAI1109',
  ChatModelEmptyResponse: 'WKFLOAI1110',
  ChatAgentUnavailable: 'WKFLOAI1111',
  ChatToolUnavailable: 'WKFLOAI1112',
  ChatToolFailed: 'WKFLOAI1113',
  ChatAttachmentFailed: 'WKFLOAI1114',
  ChatInfrastructureError: 'WKFLOAI1115',
  ChatSubagentFailed: 'WKFLOAI1116',
  ChatVoiceSynthesisFailed: 'WKFLOAI1117',
} as const;

// Mirrors the shared CommonConsts.cs > CommonErrorConst (AMAIS.WKFLO.Common/Models) - keep in sync with it.
export const CommonErrorConst = {
  UnexpectedResult: 'WKFLO0001',
  UnauthorizedResult: 'WKFLO0002',
  NotFound: 'WKFLO0003',

  InvalidInput: 'WKFLO1001',
  Required: 'WKFLO1002',

  NoClientId: 'WKFLO3001',

  NoTenantId: 'WKFLO4001',

  NoDomainId: 'WKFLO5001',
} as const;

export type AiErrorCode = typeof AiErrorConst[keyof typeof AiErrorConst];
export type CommonErrorCode = typeof CommonErrorConst[keyof typeof CommonErrorConst];

// US 7948: what the chat shows when a message can't be sent. Raw error codes and response bodies
// are never shown - only these texts.
export const GENERIC_CHAT_SEND_ERROR = "Your message couldn't be sent. Please try again.";

const INVALID_MESSAGE = "Your message couldn't be sent because some of its content isn't valid. Please check it and try again.";
const ATTACHMENTS_TOO_LARGE = 'Your attachments are too large to send together. Please remove some files, or send them in separate messages.';
const CHAT_UNAVAILABLE = "This chat isn't available right now. Please refresh the page and try again.";
const AGENT_UNAVAILABLE = 'This assistant is no longer available. Please refresh the page and try again.';
const AGENT_MISCONFIGURED = "This assistant isn't set up correctly. Please contact Support.";
const TOOL_UNAVAILABLE = "A tool this assistant uses isn't available right now. Please try again later.";
const SESSION_EXPIRED = 'Your session has expired. Please sign in again and resend your message.';
const DOMAIN_INVALID = "This chat isn't available on this website. Please contact Support.";

// US 7959: what the chat shows when the assistant fails while answering (approved texts). Raw
// codes and backend texts are never shown - only these.
const CHAT_TURN_FAILED = 'Something went wrong while answering. Please try again.';
const CHAT_TOOL_UNAVAILABLE = "A tool this assistant uses isn't available right now.";

type ChatRuntimeErrorCode =
  | typeof AiErrorConst.ChatTurnFailed
  | typeof AiErrorConst.ChatModelTimeout
  | typeof AiErrorConst.ChatModelRateLimited
  | typeof AiErrorConst.ChatModelQuotaExceeded
  | typeof AiErrorConst.ChatModelAuthFailed
  | typeof AiErrorConst.ChatModelContentFiltered
  | typeof AiErrorConst.ChatModelContextTooLong
  | typeof AiErrorConst.ChatModelUnavailable
  | typeof AiErrorConst.ChatModelConfigInvalid
  | typeof AiErrorConst.ChatModelEmptyResponse
  | typeof AiErrorConst.ChatAgentUnavailable
  | typeof AiErrorConst.ChatToolUnavailable
  | typeof AiErrorConst.ChatToolFailed
  | typeof AiErrorConst.ChatAttachmentFailed
  | typeof AiErrorConst.ChatInfrastructureError
  | typeof AiErrorConst.ChatSubagentFailed
  | typeof AiErrorConst.ChatVoiceSynthesisFailed;

const CHAT_RUNTIME_ERROR_MESSAGES: Record<ChatRuntimeErrorCode, string> = {
  [AiErrorConst.ChatTurnFailed]: CHAT_TURN_FAILED,
  [AiErrorConst.ChatModelTimeout]: 'The assistant took too long to reply. Please try again.',
  [AiErrorConst.ChatModelRateLimited]: 'The assistant is busy right now. Please wait a moment and try again.',
  [AiErrorConst.ChatModelQuotaExceeded]: 'The assistant has reached its usage limit. Please contact Support.',
  [AiErrorConst.ChatModelAuthFailed]: "The assistant couldn't connect to its AI service. Please contact Support.",
  [AiErrorConst.ChatModelContentFiltered]: "The assistant couldn't answer this message because of its content policy. Please rephrase it and try again.",
  [AiErrorConst.ChatModelContextTooLong]: 'This conversation has become too long. Please start a new chat and try again.',
  [AiErrorConst.ChatModelUnavailable]: "The assistant's AI service isn't available right now. Please try again later.",
  [AiErrorConst.ChatModelConfigInvalid]: "This assistant isn't set up correctly. Please contact Support.",
  [AiErrorConst.ChatModelEmptyResponse]: "The assistant didn't return an answer. Please try again.",
  [AiErrorConst.ChatAgentUnavailable]: "This assistant isn't available right now. Please refresh the page and try again.",
  [AiErrorConst.ChatToolUnavailable]: CHAT_TOOL_UNAVAILABLE,
  [AiErrorConst.ChatToolFailed]: CHAT_TOOL_UNAVAILABLE,
  [AiErrorConst.ChatAttachmentFailed]: "Your attachment couldn't be processed. Please try again or use a different file.",
  [AiErrorConst.ChatInfrastructureError]: 'Something went wrong on our side. Please try again in a moment.',
  [AiErrorConst.ChatSubagentFailed]: "The assistants couldn't complete your request. Please try again.",
  [AiErrorConst.ChatVoiceSynthesisFailed]: "The spoken reply couldn't be played. You can still read the answer in the chat.",
};

// The already-public validation codes the backend may send as detailCode next to
// ChatAgentUnavailable (ChatErrorCodes.PublicDetailCodes); each one keeps its own text below.
const CHAT_AGENT_UNAVAILABLE_DETAIL_CODES: ReadonlySet<string> = new Set<string>([
  AiErrorConst.TenantInvalid,
  AiErrorConst.TenantMustExist,
  AiErrorConst.AgentMustExist,
  AiErrorConst.AgentNotFound,
  AiErrorConst.AgentNotRunnable,
]);

// Every code in AiErrorConst and CommonErrorConst has a message, so none of them falls through to
// the generic text.
const CHAT_SEND_ERROR_MESSAGES: Record<AiErrorCode | CommonErrorCode, string> = {
  // CommonErrorConst (shared by every WKFLO API)
  [CommonErrorConst.UnexpectedResult]: GENERIC_CHAT_SEND_ERROR,
  [CommonErrorConst.UnauthorizedResult]: SESSION_EXPIRED,
  [CommonErrorConst.NotFound]: AGENT_UNAVAILABLE,
  [CommonErrorConst.InvalidInput]: INVALID_MESSAGE,
  [CommonErrorConst.Required]: INVALID_MESSAGE,
  [CommonErrorConst.NoClientId]: CHAT_UNAVAILABLE,
  [CommonErrorConst.NoTenantId]: CHAT_UNAVAILABLE,
  [CommonErrorConst.NoDomainId]: DOMAIN_INVALID,

  // common
  [AiErrorConst.InvalidInput]: INVALID_MESSAGE,
  [AiErrorConst.Required]: INVALID_MESSAGE,
  [AiErrorConst.MinimumLength]: INVALID_MESSAGE,
  [AiErrorConst.MaximumLength]: INVALID_MESSAGE,
  [AiErrorConst.MustBePositive]: INVALID_MESSAGE,
  [AiErrorConst.MustBeInRangeMin1Max50]: INVALID_MESSAGE,
  [AiErrorConst.MustBeInRangeMin1Max100]: INVALID_MESSAGE,
  [AiErrorConst.MustBeInRangeMin1Max500]: INVALID_MESSAGE,
  [AiErrorConst.MustBeInRangeMin1Max1000]: INVALID_MESSAGE,
  [AiErrorConst.InvalidLanguage]: INVALID_MESSAGE,
  [AiErrorConst.InvalidEmail]: "The email address isn't valid. Please check it and try again.",
  [AiErrorConst.InvalidPhone]: "The phone number isn't valid. Please check it and try again.",
  [AiErrorConst.InvalidCountry]: "The country isn't valid. Please check it and try again.",
  [AiErrorConst.AttachmentsTooLarge]: ATTACHMENTS_TOO_LARGE,
  [AiErrorConst.ImageTooLarge]: `One of your images is larger than ${formatFileSize(MAX_IMAGE_SIZE_BYTES)}. Please use a smaller image and try again.`,
  [AiErrorConst.UnsupportedImageFormat]: "One of your images is in a format that can't be used (such as HEIC, BMP or TIFF). Please convert it to JPG or PNG and try again.",

  // Tenant
  [AiErrorConst.TenantInvalid]: CHAT_UNAVAILABLE,
  [AiErrorConst.TenantMustExist]: CHAT_UNAVAILABLE,

  // Domain
  [AiErrorConst.DomainInvalid]: DOMAIN_INVALID,

  // Agent
  [AiErrorConst.AgentMustNotExist]: AGENT_MISCONFIGURED,
  [AiErrorConst.AgentMustExist]: AGENT_UNAVAILABLE,
  [AiErrorConst.AgentNotFound]: AGENT_UNAVAILABLE,
  [AiErrorConst.AgentAndToolMustExist]: AGENT_MISCONFIGURED,
  [AiErrorConst.AgentNotRunnable]: "This assistant can't chat right now. Please try again later.",
  [AiErrorConst.AgentRoleMustBeUnique]: AGENT_MISCONFIGURED,

  // Tool
  [AiErrorConst.ToolMustNotExist]: AGENT_MISCONFIGURED,
  [AiErrorConst.ToolMustExist]: TOOL_UNAVAILABLE,
  [AiErrorConst.ToolNotFound]: TOOL_UNAVAILABLE,

  // AI Model
  [AiErrorConst.AIModelMustNotExist]: AGENT_MISCONFIGURED,
  [AiErrorConst.AIModelMustExist]: AGENT_MISCONFIGURED,
  [AiErrorConst.AIModelNotFound]: AGENT_MISCONFIGURED,

  // Secret
  [AiErrorConst.SecretMustNotExist]: AGENT_MISCONFIGURED,
  [AiErrorConst.SecretMustExist]: AGENT_MISCONFIGURED,
  [AiErrorConst.SecretNotFound]: AGENT_MISCONFIGURED,

  // Knowledge
  [AiErrorConst.KnowledgeMustNotExist]: AGENT_MISCONFIGURED,
  [AiErrorConst.KnowledgeMustExist]: AGENT_MISCONFIGURED,
  [AiErrorConst.KnowledgeNotFound]: AGENT_MISCONFIGURED,

  // Tool MCP OAuth
  [AiErrorConst.ToolMcpOAuthNotConfigured]: "An app this assistant uses isn't set up yet. Please contact Support.",
  [AiErrorConst.ToolMcpOAuthConsentFailed]: "We couldn't connect to an app this assistant needs. Please try connecting again.",

  // MCP function discovery
  [AiErrorConst.ToolMustBeMcp]: AGENT_MISCONFIGURED,
  [AiErrorConst.ToolMcpOAuthNotConnected]: "An app this assistant needs isn't connected yet. Please connect it and try again.",
  [AiErrorConst.ToolMcpUnavailable]: TOOL_UNAVAILABLE,

  // Tool approvals
  [AiErrorConst.ToolApprovalNotFound]: "This approval request couldn't be found. Please send your message again.",
  [AiErrorConst.ToolApprovalAlreadyDecided]: 'This approval request has already been answered.',
  [AiErrorConst.ToolApprovalExpired]: 'This approval request has expired. Please send your message again.',
  [AiErrorConst.ToolApprovalDecisionInvalid]: "Your answer couldn't be recorded. Please try again.",

  // Chat Stop
  [AiErrorConst.ChatSessionNotOwned]: 'This conversation belongs to another session. Please start a new chat and try again.',

  // Chat runtime (US 7959) - pushed over SignalR rather than returned by a send, but mapped here
  // too so every code has a message.
  ...CHAT_RUNTIME_ERROR_MESSAGES,
};

function messageForCode(code: string): string | undefined {
  return Object.prototype.hasOwnProperty.call(CHAT_SEND_ERROR_MESSAGES, code)
    ? CHAT_SEND_ERROR_MESSAGES[code as AiErrorCode | CommonErrorCode]
    : undefined;
}

/** Error codes in an API error body (`errors[].code`, or a top-level `code`). */
function extractErrorCodes(body: unknown): string[] {
  if (!body || typeof body !== 'object') return [];
  const { errors, code } = body as { errors?: unknown; code?: unknown };
  const codes = (Array.isArray(errors) ? errors : [])
    .map((e) => (e && typeof e === 'object' ? (e as { code?: unknown }).code : e))
    .filter((c): c is string => typeof c === 'string');
  if (typeof code === 'string') codes.push(code);
  return codes;
}

/**
 * Friendly text for a failed send: the first known error code in the body wins, then the HTTP
 * status, then a generic message.
 */
export function describeChatSendError(status: number, body: unknown): string {
  for (const code of extractErrorCodes(body)) {
    const message = messageForCode(code);
    if (message) return message;
  }

  switch (status) {
    case 401: return SESSION_EXPIRED;
    case 404: return AGENT_UNAVAILABLE;
    case 413: return ATTACHMENTS_TOO_LARGE;
    case 429: return "You're sending messages too quickly. Please wait a moment and try again.";
    default: return GENERIC_CHAT_SEND_ERROR;
  }
}

/** True for a chat runtime code (WKFLOAI11xx) this client knows. */
export function isChatRuntimeErrorCode(code: unknown): code is ChatRuntimeErrorCode {
  return typeof code === 'string' && Object.prototype.hasOwnProperty.call(CHAT_RUNTIME_ERROR_MESSAGES, code);
}

/**
 * US 7959: friendly text for a chat turn (or a tool) that failed while the assistant was answering.
 * ChatAgentUnavailable with a known detailCode shows that code's own text. Any other code this
 * client doesn't know gets the ChatTurnFailed text - never the raw code or a backend text.
 */
export function describeChatRuntimeError(code: string | null | undefined, detailCode?: string | null): string {
  if (code === AiErrorConst.ChatAgentUnavailable && detailCode && CHAT_AGENT_UNAVAILABLE_DETAIL_CODES.has(detailCode)) {
    const detailMessage = messageForCode(detailCode);
    if (detailMessage) return detailMessage;
  }
  return isChatRuntimeErrorCode(code) ? CHAT_RUNTIME_ERROR_MESSAGES[code] : CHAT_TURN_FAILED;
}

/** Reads a non-2xx send response (JSON or not) into friendly text. */
export async function readChatSendError(response: Response): Promise<string> {
  let body: unknown = null;
  try {
    const text = await response.text();
    body = text ? JSON.parse(text) : null;
  } catch {
    /* empty or not JSON - fall back to the status */
  }
  return describeChatSendError(response.status, body);
}
