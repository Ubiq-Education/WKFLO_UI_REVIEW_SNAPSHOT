import { describe, it, expect } from 'vitest';
import type { ConversationAgentSummary, ConversationSummary } from '../models/conversation-summary';
import {
  formatConversationTimestamp,
  getAgentTooltip,
  getConversationPreview,
  getConversationTitle,
  getVisibleAgents,
  sortByLastActivity,
} from './conversation-list-format';

const agent = (agentId: number, name: string, role: string | null = null): ConversationAgentSummary => ({
  agentId,
  name,
  role,
  avatarUrl: null,
});

const conversation = (overrides: Partial<ConversationSummary> = {}): ConversationSummary => ({
  sessionId: 'session-1',
  title: 'Plan the open evening',
  previewLine: 'Can you help me plan the open evening?',
  lastActivityAt: '2026-09-27T16:10:00Z',
  agents: [agent(1, 'MAISY')],
  ...overrides,
});

describe('formatConversationTimestamp (US 7507)', () => {
  it("follows the tenant's time zone and date/time formats, not the browser's", () => {
    const settings = { timeZone: 'Europe/London', dateFormat: 'dd MMM, yyyy', timeFormat: '12h' } as const;
    // 15:10 UTC is 16:10 in London (BST) on 27 Sep.
    expect(formatConversationTimestamp('2026-09-27T15:10:00Z', settings)).toBe('27 Sep, 2026 4:10 PM');
    expect(formatConversationTimestamp('2026-09-27T15:10:00Z', { ...settings, timeZone: 'America/New_York', timeFormat: '24h' }))
      .toBe('27 Sep, 2026 11:10');
  });

  it('uses the tenant defaults (UTC, yyyy-MM-dd, 24h) without settings', () => {
    expect(formatConversationTimestamp('2026-09-27T15:10:00Z')).toBe('2026-09-27 15:10');
    expect(formatConversationTimestamp('2026-09-27T15:10:00Z', null)).toBe('2026-09-27 15:10');
  });

  it('is empty for an invalid date', () => {
    expect(formatConversationTimestamp('not a date')).toBe('');
  });
});

describe('conversation title and preview (US 7507)', () => {
  it('uses the title and the preview line', () => {
    expect(getConversationTitle(conversation())).toBe('Plan the open evening');
    expect(getConversationPreview(conversation())).toBe('Can you help me plan the open evening?');
  });

  it('shows "New conversation" when there is no preview line', () => {
    expect(getConversationPreview(conversation({ previewLine: null }))).toBe('New conversation');
  });

  it('falls back to the preview line, then "New conversation", for a missing title', () => {
    expect(getConversationTitle(conversation({ title: null }))).toBe('Can you help me plan the open evening?');
    expect(getConversationTitle(conversation({ title: '  ', previewLine: null }))).toBe('New conversation');
  });
});

describe('getAgentTooltip (US 7507)', () => {
  it('shows "Name · Role"', () => {
    expect(getAgentTooltip(agent(2, 'Pages Agent', 'Creates and edits pages'))).toBe('Pages Agent · Creates and edits pages');
  });

  it('shows only the name when there is no role', () => {
    expect(getAgentTooltip(agent(2, 'Pages Agent'))).toBe('Pages Agent');
  });
});

describe('getVisibleAgents (US 7507)', () => {
  it('shows up to 4 agents as they are', () => {
    const agents = [agent(1, 'A'), agent(2, 'B'), agent(3, 'C'), agent(4, 'D')];
    expect(getVisibleAgents(agents)).toEqual({ visible: agents, hiddenCount: 0 });
  });

  it('shows the first 3 and "+N" for more than 4, keeping the order', () => {
    const agents = [agent(1, 'MAISY'), agent(2, 'B'), agent(3, 'C'), agent(4, 'D'), agent(5, 'E')];
    expect(getVisibleAgents(agents)).toEqual({ visible: agents.slice(0, 3), hiddenCount: 2 });
  });
});

describe('sortByLastActivity (US 7507)', () => {
  it('puts the most recent activity first without changing the input', () => {
    const older = conversation({ sessionId: 'older', lastActivityAt: '2026-09-20T10:00:00Z' });
    const newer = conversation({ sessionId: 'newer', lastActivityAt: '2026-09-27T10:00:00Z' });
    const input = [older, newer];

    expect(sortByLastActivity(input).map(c => c.sessionId)).toEqual(['newer', 'older']);
    expect(input.map(c => c.sessionId)).toEqual(['older', 'newer']);
  });
});
