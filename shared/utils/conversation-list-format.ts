import type { ConversationAgentSummary, ConversationSummary } from '../models/conversation-summary';
import { formatTenantDateTime, type DateTimeFormatSettings } from './format-date-time';

// US 7507: how a conversations-list row shows its data.

export const NEW_CONVERSATION_TEXT = 'New conversation';

// Up to this many avatars show as they are; more collapse to the first ones plus "+N".
export const MAX_VISIBLE_AGENTS = 4;
const COLLAPSED_VISIBLE_AGENTS = 3;

// The last activity time in the tenant's time zone and date/time formats (US 7974, the same
// settings as the chat bubbles), so every viewer sees the same text. Missing settings fall back to
// the tenant defaults (UTC, yyyy-MM-dd, 24h). Empty for an invalid date.
export function formatConversationTimestamp(iso: string, settings?: DateTimeFormatSettings | null): string {
  return formatTenantDateTime(iso, settings ?? {});
}

export function getConversationTitle(conversation: ConversationSummary): string {
  return conversation.title?.trim() || conversation.previewLine?.trim() || NEW_CONVERSATION_TEXT;
}

export function getConversationPreview(conversation: ConversationSummary): string {
  return conversation.previewLine?.trim() || NEW_CONVERSATION_TEXT;
}

// "Name · Role", or just the name when the agent has no role.
export function getAgentTooltip(agent: ConversationAgentSummary): string {
  const role = agent.role?.trim();
  return role ? `${agent.name} · ${role}` : agent.name;
}

// The avatars to draw (order kept: MAISY first, then join order) and how many more there are.
export function getVisibleAgents(agents: ConversationAgentSummary[]): {
  visible: ConversationAgentSummary[];
  hiddenCount: number;
} {
  if (agents.length <= MAX_VISIBLE_AGENTS) {
    return { visible: agents, hiddenCount: 0 };
  }
  return {
    visible: agents.slice(0, COLLAPSED_VISIBLE_AGENTS),
    hiddenCount: agents.length - COLLAPSED_VISIBLE_AGENTS,
  };
}

// Newest activity first. The server already sorts; sorting again keeps a conversation that was
// just continued at the top even if a list is patched locally.
export function sortByLastActivity(conversations: ConversationSummary[]): ConversationSummary[] {
  const time = (conversation: ConversationSummary) => {
    const value = new Date(conversation.lastActivityAt).getTime();
    return Number.isNaN(value) ? 0 : value;
  };
  return [...conversations].sort((a, b) => time(b) - time(a));
}
