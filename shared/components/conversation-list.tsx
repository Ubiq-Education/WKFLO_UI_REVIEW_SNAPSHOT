import React, { useEffect, useId, useRef } from 'react';
import type { ConversationAgentSummary, ConversationSummary } from '../models/conversation-summary';
import type { ConversationsStatus } from '../hooks/use-conversations';
import type { ChatDisplaySettings } from '../models/chat-settings';
import { getInitials } from './agents-bar';
import { isFocusUnclaimed } from '../utils/focus';
import {
  formatConversationTimestamp,
  getAgentTooltip,
  getConversationPreview,
  getConversationTitle,
  getVisibleAgents,
} from '../utils/conversation-list-format';

// US 7507 (MAISY design, conversation list): the MAISY conversations list. One row per
// conversation - title, preview, the agents involved and the last activity time. The whole row is
// a button; Arrow Up / Down, Home and End move between rows. The conversation open last is marked
// (aria-current) and tinted. The row's accessible name is the title and timestamp; the preview line
// and the agents ("Name · Role") are its description (aria-describedby), so screen readers get
// them too. Nothing inside the row is focusable: the avatars' "Name · Role" tooltips are plain
// title attributes for mouse users.
interface ConversationListProps {
  conversations: ConversationSummary[];
  status: ConversationsStatus;
  // The conversation that was open last - highlighted on return to the list.
  activeSessionId?: string;
  onOpenConversation: (sessionId: string) => void;
  onRetry?: () => void;
  // The tenant's time zone and date/time formats (from the chat configuration) for the timestamps.
  displaySettings?: ChatDisplaySettings;
  // US 7506: on showing, move keyboard focus into the list - to the active conversation's row, else
  // the first row, else the empty state (or Retry) - once it has loaded.
  focusOnShow?: boolean;
}

// The design system's neutrals (text-strong, text-muted, border-subtle, sand-150). The list has no
// configurable colours.
const TEXT_STRONG = '#1f2523';
const TEXT_MUTED = '#7d807e';
const BORDER_SUBTLE = '#eeece8';
const AVATAR_BACKGROUND = '#eeece8';

const AVATAR_STYLE: React.CSSProperties = {
  width: '22px',
  height: '22px',
  borderRadius: '999px',
  border: '2px solid #ffffff',
  marginRight: '-5px',
  backgroundColor: AVATAR_BACKGROUND,
  overflow: 'hidden',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  fontSize: '9px',
  fontWeight: 600,
  color: TEXT_STRONG,
  boxSizing: 'content-box',
};

const ONE_LINE: React.CSSProperties = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };

// Read by screen readers only. Absolutely positioned inside the (relative) row, so it takes no room.
const VISUALLY_HIDDEN: React.CSSProperties = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

const AgentAvatar: React.FC<{ agent: ConversationAgentSummary }> = ({ agent }) => {
  const tooltip = getAgentTooltip(agent);
  return (
    <span title={tooltip} data-testid="conversation-agent-avatar" style={AVATAR_STYLE}>
      {agent.avatarUrl?.trim() ? (
        <img src={agent.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <span>{getInitials(agent.name)}</span>
      )}
    </span>
  );
};

const ConversationRow: React.FC<{
  conversation: ConversationSummary;
  isActive: boolean;
  onOpen: (sessionId: string) => void;
  displaySettings?: ChatDisplaySettings;
}> = ({ conversation, isActive, onOpen, displaySettings }) => {
  const title = getConversationTitle(conversation);
  const preview = getConversationPreview(conversation);
  const timestamp = formatConversationTimestamp(conversation.lastActivityAt, displaySettings);
  const { visible, hiddenCount } = getVisibleAgents(conversation.agents);
  const idBase = useId();
  const previewId = `${idBase}-preview`;
  const agentsId = `${idBase}-agents`;

  return (
    <button
      type="button"
      className={`wkflo-conversation-row${isActive ? ' wkflo-conversation-row--active' : ''}`}
      data-conversation-row=""
      data-session-id={conversation.sessionId}
      aria-current={isActive ? 'true' : undefined}
      aria-label={timestamp ? `${title}, ${timestamp}` : title}
      aria-describedby={`${previewId} ${agentsId}`}
      onClick={() => onOpen(conversation.sessionId)}
      style={{
        position: 'relative',
        width: '100%',
        textAlign: 'left',
        border: 0,
        borderBottom: `1px solid ${BORDER_SUBTLE}`,
        borderRadius: '8px',
        padding: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >
      <span style={{ ...ONE_LINE, display: 'block', width: '100%', fontWeight: 600, fontSize: '14px', color: TEXT_STRONG }}>
        {title}
      </span>
      <span id={previewId} style={{ ...ONE_LINE, display: 'block', width: '100%', fontSize: '13px', lineHeight: 1.4, color: TEXT_MUTED }}>
        {preview}
      </span>
      <span id={agentsId} style={VISUALLY_HIDDEN} data-testid="conversation-agents-description">
        {`Agents: ${conversation.agents.map(getAgentTooltip).join(', ')}`}
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
        {/* Hidden from screen readers: the agents are read from the row's description instead. */}
        <span style={{ display: 'flex' }} aria-hidden="true" data-testid="conversation-agents">
          {visible.map(agent => <AgentAvatar key={agent.agentId} agent={agent} />)}
          {hiddenCount > 0 && (
            <span
              style={AVATAR_STYLE}
              title={conversation.agents.slice(visible.length).map(getAgentTooltip).join('\n')}
              data-testid="conversation-agents-more"
            >
              +{hiddenCount}
            </span>
          )}
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: '12px', color: TEXT_MUTED, flexShrink: 0 }}>{timestamp}</span>
      </span>
    </button>
  );
};

const MESSAGE_STYLE: React.CSSProperties = {
  padding: '32px 16px',
  textAlign: 'center',
  fontSize: '14px',
  color: TEXT_MUTED,
};

export const ConversationList: React.FC<ConversationListProps> = ({
  conversations,
  status,
  activeSessionId,
  onOpenConversation,
  onRetry,
  displaySettings,
  focusOnShow = false,
}) => {
  const listRef = useRef<HTMLUListElement>(null);
  const emptyRef = useRef<HTMLDivElement>(null);
  const retryRef = useRef<HTMLButtonElement>(null);

  // US 7506: see focusOnShow. Done once per showing (the list mounts each time it is shown); while
  // loading there is nothing to focus yet, so it waits for the rows or the empty state. Skipped if
  // the user has put focus somewhere else in the meantime.
  const pendingFocusRef = useRef(focusOnShow);
  useEffect(() => {
    if (!pendingFocusRef.current) return;
    const rows = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('[data-conversation-row]') ?? []);
    const target = rows.find(row => activeSessionId && row.dataset.sessionId === activeSessionId)
      ?? rows[0]
      ?? emptyRef.current
      ?? retryRef.current;
    if (!target) return;
    pendingFocusRef.current = false;
    if (isFocusUnclaimed()) target.focus();
  });

  // Arrow Up / Down, Home and End move focus between the rows; Tab still works as usual.
  const handleKeyDown = (event: React.KeyboardEvent<HTMLUListElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const rows = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('[data-conversation-row]') ?? []);
    if (rows.length === 0) return;

    const current = rows.indexOf(document.activeElement as HTMLButtonElement);
    let next: number;
    if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = rows.length - 1;
    else if (event.key === 'ArrowDown') next = current < 0 ? 0 : Math.min(current + 1, rows.length - 1);
    else next = current < 0 ? 0 : Math.max(current - 1, 0);

    event.preventDefault();
    rows[next].focus();
  };

  // Rows already on screen stay while the list reloads.
  if (conversations.length === 0) {
    if (status === 'loading' || status === 'idle') {
      return <div style={MESSAGE_STYLE} role="status">Loading conversations…</div>;
    }
    if (status === 'error') {
      return (
        <div style={MESSAGE_STYLE} role="alert">
          <p style={{ margin: '0 0 12px' }}>Conversations couldn't be loaded.</p>
          {onRetry && (
            <button
              ref={retryRef}
              type="button"
              onClick={onRetry}
              style={{ height: '30px', padding: '0 14px', borderRadius: '999px', border: '1px solid #d9d6d0', background: '#ffffff', fontFamily: 'inherit', fontSize: '13px', fontWeight: 600, color: TEXT_STRONG, cursor: 'pointer' }}
            >
              Retry
            </button>
          )}
        </div>
      );
    }
    // tabIndex -1: focusable from code (focusOnShow), not a Tab stop.
    return (
      <div ref={emptyRef} tabIndex={-1} style={MESSAGE_STYLE} data-testid="conversation-list-empty">
        No conversations yet
      </div>
    );
  }

  return (
    <ul
      ref={listRef}
      aria-label="Conversations"
      onKeyDown={handleKeyDown}
      data-testid="conversation-list"
      style={{ listStyle: 'none', margin: 0, padding: '8px 8px 16px', display: 'flex', flexDirection: 'column' }}
    >
      {conversations.map(conversation => (
        <li key={conversation.sessionId}>
          <ConversationRow
            conversation={conversation}
            isActive={conversation.sessionId === activeSessionId}
            onOpen={onOpenConversation}
            displaySettings={displaySettings}
          />
        </li>
      ))}
    </ul>
  );
};
