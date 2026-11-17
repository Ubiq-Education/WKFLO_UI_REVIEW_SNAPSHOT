import type { ToolApprovalDecision, ToolApprovalRequestUpdate } from '../services/signalr-service';

// US 7575 "Ask for permission" — client-side view of one tool-approval request.
// `Approved` covers both AllowOnce and AllowForConversation (`decision` tells which).
export type ToolApprovalStatus = 'Pending' | 'Approved' | 'Denied' | 'Expired';

export interface ToolApprovalState extends ToolApprovalRequestUpdate {
  status: ToolApprovalStatus;
  decision?: ToolApprovalDecision | 'Expired';
  // Set when the decision endpoint answered 409: someone already answered it (e.g. another tab)
  // and we don't know how, so the card stops offering buttons until ToolApprovalResolved lands.
  alreadyAnswered?: boolean;
}

const DECISIONS: readonly ToolApprovalDecision[] = ['AllowOnce', 'AllowForConversation', 'Deny'];

// One message id per approval, so the live SignalR request, the persisted Forms-channel copy
// and a history reload all land on the same chat entry instead of rendering the card twice.
export function toolApprovalMessageId(approvalId: string): string {
  return `tool-approval-${approvalId}`;
}

export function statusForDecision(decision: ToolApprovalDecision | 'Expired'): ToolApprovalStatus {
  if (decision === 'Expired') return 'Expired';
  return decision === 'Deny' ? 'Denied' : 'Approved';
}

function normalizeDecision(value: unknown): ToolApprovalDecision | 'Expired' | undefined {
  if (typeof value !== 'string') return undefined;
  const lower = value.trim().toLowerCase();
  if (lower === 'expired') return 'Expired';
  return DECISIONS.find(d => d.toLowerCase() === lower);
}

function normalizeStatus(value: unknown, decision: ToolApprovalDecision | 'Expired' | undefined): ToolApprovalStatus {
  if (typeof value === 'string') {
    switch (value.trim().toLowerCase()) {
      case 'pending': return 'Pending';
      case 'approved': return 'Approved';
      case 'denied': return 'Denied';
      case 'expired': return 'Expired';
    }
    const asDecision = normalizeDecision(value);
    if (asDecision) return statusForDecision(asDecision);
  }
  return decision ? statusForDecision(decision) : 'Pending';
}

// Builds the card state from a Forms-channel `data` payload (or any loosely-typed object with
// the ToolApprovalRequest fields). Returns null when it can't identify the approval.
export function toToolApprovalState(raw: unknown): ToolApprovalState | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  if (typeof data.approvalId !== 'string' || data.approvalId === '') return null;

  // The persisted status may carry the decision itself (e.g. "AllowForConversation").
  const decision = normalizeDecision(data.decision) ?? normalizeDecision(data.status);
  const str = (v: unknown) => (typeof v === 'string' ? v : undefined);

  return {
    chatId: str(data.chatId) ?? str(data.sessionId) ?? '',
    sessionId: str(data.sessionId) ?? str(data.chatId) ?? '',
    approvalId: data.approvalId,
    agentId: typeof data.agentId === 'number' ? data.agentId : undefined,
    agentName: str(data.agentName),
    chatbotIconUrl: str(data.chatbotIconUrl),
    toolName: str(data.toolName) ?? '',
    functionName: str(data.functionName) ?? '',
    functionDescription: str(data.functionDescription),
    functionDisplayName: str(data.functionDisplayName),
    functionDisplayDescription: str(data.functionDisplayDescription),
    argumentsJson: str(data.argumentsJson),
    expiresAtUtc: str(data.expiresAtUtc) ?? '',
    status: normalizeStatus(data.status, decision),
    decision,
  };
}

// Server-side expiry of an unanswered request (PLAN.md decision 11).
export const TOOL_APPROVAL_TIMEOUT_MS = 10 * 60 * 1000;

// Client-side expiry is display-only - it unblocks the input and greys the card out on time;
// the server is authoritative (it rejects late answers with 410). If the request carries no
// usable expiresAtUtc, assume the standard 10 minutes from when it was received, so a malformed
// request can never leave the chat input blocked forever.
export function withFallbackExpiry<T extends Pick<ToolApprovalState, 'expiresAtUtc'>>(approval: T, receivedAt: number = Date.now()): T {
  if (!Number.isNaN(Date.parse(approval.expiresAtUtc))) return approval;
  const base = Number.isNaN(receivedAt) ? Date.now() : receivedAt;
  return { ...approval, expiresAtUtc: new Date(base + TOOL_APPROVAL_TIMEOUT_MS).toISOString() };
}

// A Pending request whose expiry has passed is shown (and treated) as Expired even before the
// server's ToolApprovalResolved arrives — the backend treats it as denied at that point.
export function isToolApprovalExpired(approval: Pick<ToolApprovalState, 'expiresAtUtc'>, now: number = Date.now()): boolean {
  const expiresAt = Date.parse(approval.expiresAtUtc);
  return !Number.isNaN(expiresAt) && expiresAt <= now;
}

export function effectiveToolApprovalStatus(approval: ToolApprovalState, now: number = Date.now()): ToolApprovalStatus {
  if (approval.status === 'Pending' && isToolApprovalExpired(approval, now)) return 'Expired';
  return approval.status;
}

export function isToolApprovalAwaitingAnswer(approval: ToolApprovalState | undefined, now: number = Date.now()): boolean {
  return !!approval && !approval.alreadyAnswered && effectiveToolApprovalStatus(approval, now) === 'Pending';
}

// Pretty-prints the call's arguments for the card's Details section; falls back to the raw
// string when it isn't valid JSON.
export function formatToolApprovalArguments(argumentsJson: string | undefined): string | null {
  if (!argumentsJson || argumentsJson.trim() === '') return null;
  try {
    const parsed = JSON.parse(argumentsJson);
    if (parsed && typeof parsed === 'object' && Object.keys(parsed).length === 0) return null;
    return JSON.stringify(parsed, null, 2);
  } catch {
    return argumentsJson;
  }
}
