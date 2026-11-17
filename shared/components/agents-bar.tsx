import React from 'react';
import { ChevronRight } from 'lucide-react';
import type { AgentActivityStatus, SessionAgentInfo } from '../hooks/use-chat';
import type { SpinUpAgentTarget } from '../schema';

// The agent whose chat this is. Its metadata is the only place a configured icon is known;
// other agents only have what the SignalR payloads carry.
export interface AgentsBarHostAgent {
  agentId?: number;
  name: string;
  iconUrl?: string;
}

export interface AgentsBarProps {
  agents: SessionAgentInfo[];
  activeAgent: SessionAgentInfo | null;
  hostAgent: AgentsBarHostAgent;
  // Agents this one can hand off to (spin-up targets): used for their icon when a payload has none.
  knownAgents?: SpinUpAgentTarget[];
  // Ring colour for the active agent. No per-agent colour exists yet, so this is the chat's own.
  accentColor: string;
  // US 8159: what the active agent is doing, shown next to its name (the thread no longer carries
  // "Thinking" bubbles or in-progress sub-agent cards where this bar is shown).
  status?: AgentActivityStatus | null;
}

// The words the bar shows for a status.
export function describeAgentStatus(status: AgentActivityStatus): string {
  switch (status.kind) {
    case 'thinking':
      return 'Thinking…';
    case 'running':
      return status.action ? `Working: ${status.action}…` : 'Working…';
    case 'awaiting_approval':
      return 'Waiting for approval';
  }
}

export interface AgentDisplay {
  name: string;
  iconUrl?: string;
  initials: string;
}

function isHostAgent(agent: SessionAgentInfo, host: AgentsBarHostAgent): boolean {
  if (agent.agentId != null && host.agentId != null) {
    return agent.agentId === host.agentId;
  }
  // An event with neither id nor name can only come from the agent this chat talks to.
  if (agent.agentId == null && !agent.agentName) {
    return true;
  }
  return !!agent.agentName && agent.agentName === host.name;
}

export function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map(word => word[0].toUpperCase()).join('');
}

// Name and avatar from data that really exists: the event payload first, then the host agent's
// settings or the spin-up target list. Missing pieces fall back to initials. The bar shows names
// only, never a role or description.
export function resolveAgentDisplay(
  agent: SessionAgentInfo,
  host: AgentsBarHostAgent,
  knownAgents: SpinUpAgentTarget[] = []
): AgentDisplay {
  const isHost = isHostAgent(agent, host);
  // Never empty (the 'Agent' fallback), so there are always initials to show.
  const name = agent.agentName?.trim() || (isHost ? host.name?.trim() : '') || 'Agent';
  const knownIcon = knownAgents.find(known => known.name === agent.agentName)?.iconUrl ?? undefined;
  const iconUrl = agent.chatbotIconUrl?.trim() || (isHost ? host.iconUrl?.trim() : knownIcon?.trim()) || undefined;
  return { name, iconUrl, initials: getInitials(name) };
}

const AVATAR_SIZE = 28;

export const AgentsBar: React.FC<AgentsBarProps> = ({ agents, activeAgent, hostAgent, knownAgents, accentColor, status }) => {
  // An agent paused on an approval is not "active" (its avatar stays dimmed) but still has a status.
  const statusAgent = activeAgent ?? status?.agent ?? null;
  const activeDisplay = statusAgent ? resolveAgentDisplay(statusAgent, hostAgent, knownAgents) : null;
  const statusText = status ? describeAgentStatus(status) : null;

  // One screen-reader live region, always mounted (also while there is no bar yet) at a stable
  // position, so the first status is announced when its text arrives: a region inserted with its text
  // already inside is skipped by screen readers. The visible status text is aria-hidden to avoid
  // announcing it twice.
  const liveRegion = (
    <span className="sr-only" aria-live="polite" aria-atomic="true" data-testid="agents-bar-live-region">
      {activeDisplay && statusText ? `${activeDisplay.name} ${statusText}` : ''}
    </span>
  );
  if (agents.length === 0) return liveRegion;

  return (
    <>
    {liveRegion}
    <div
      className="flex items-center gap-2.5"
      style={{ minHeight: 36, padding: '4px 18px' }}
      data-testid="agents-bar"
    >
      <span className="text-xs text-gray-500 flex-shrink-0">Agents</span>
      {/* No top padding: the label, avatars, chevrons and status share the row's centre line.
          The active avatar's bounce is a transform, so it moves without shifting the layout. */}
      <ol className="flex items-center gap-1.5 list-none m-0 p-0 flex-shrink-0" aria-label="Agents in this conversation">
        {agents.map((agent, index) => {
          const display = resolveAgentDisplay(agent, hostAgent, knownAgents);
          const isActive = activeAgent?.key === agent.key;
          // Task 7947: every agent not working right now is dimmed, also when nobody is working
          // (e.g. an agent waiting for a tool approval).
          const isDimmed = !isActive;
          return (
            <li key={agent.key} className="flex items-center gap-1.5">
              {index > 0 && <ChevronRight aria-hidden="true" className="w-4 h-4 text-gray-400" />}
              <span
                title={display.name}
                role="img"
                aria-label={isActive ? `${display.name} (working)` : display.name}
                aria-current={isActive ? 'true' : undefined}
                data-testid="agents-bar-avatar"
                data-active={isActive ? 'true' : 'false'}
                className={`rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 bg-gray-200 text-gray-600 transition-opacity${isActive ? ' animate-bounce motion-reduce:animate-none' : ''}`}
                style={{
                  width: AVATAR_SIZE,
                  height: AVATAR_SIZE,
                  opacity: isDimmed ? 0.45 : 1,
                  boxShadow: isActive ? `0 0 0 2px #ffffff, 0 0 0 4px ${accentColor}` : 'none',
                }}
              >
                {display.iconUrl ? (
                  <img src={display.iconUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span aria-hidden="true" className="text-xs font-semibold">{display.initials}</span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
      <div className="flex-1" />
      <span
        className="text-xs text-gray-800 truncate min-w-0"
        title={activeDisplay ? (statusText ? `${activeDisplay.name}: ${statusText}` : activeDisplay.name) : undefined}
        data-testid="agents-bar-status"
        aria-hidden="true"
      >
        {activeDisplay && (
          <>
            <span className="font-semibold">{activeDisplay.name}</span>
            {statusText && <span data-testid="agents-bar-status-text" className="text-gray-600">{' '}{statusText}</span>}
          </>
        )}
      </span>
    </div>
    </>
  );
};
