import type { SubAgentActivityStatus } from '../services/signalr-service';

export type SubAgentActivityIcon = 'wrench' | 'hand' | 'ban' | 'clock';

export interface SubAgentActivityDisplay {
  label: string;
  badgeClasses: string;
  icon: SubAgentActivityIcon;
  iconClasses: string;
}

// Bug 7722: label, badge colours and icon for each SubagentActivityUpdate status, shared by the
// chat/widget activity card. `status` is typed loosely on purpose - a value this client doesn't
// know yet (newer backend) gets a neutral look, never "Done".
const DISPLAY: Record<SubAgentActivityStatus, SubAgentActivityDisplay> = {
  started: { label: 'Working…', badgeClasses: 'bg-gray-100 text-gray-600', icon: 'wrench', iconClasses: 'text-gray-500 animate-pulse' },
  awaiting_approval: { label: 'Waiting for approval', badgeClasses: 'bg-amber-100 text-amber-800', icon: 'hand', iconClasses: 'text-amber-600' },
  resumed: { label: 'Working… (approved)', badgeClasses: 'bg-gray-100 text-gray-600', icon: 'wrench', iconClasses: 'text-gray-500 animate-pulse' },
  completed: { label: 'Done', badgeClasses: 'bg-green-100 text-green-800', icon: 'wrench', iconClasses: 'text-green-600' },
  failed: { label: 'Failed', badgeClasses: 'bg-red-100 text-red-800', icon: 'wrench', iconClasses: 'text-red-600' },
  denied: { label: 'Denied', badgeClasses: 'bg-red-100 text-red-800', icon: 'ban', iconClasses: 'text-red-600' },
  expired: { label: 'Expired', badgeClasses: 'bg-gray-100 text-gray-600', icon: 'clock', iconClasses: 'text-gray-500' },
  // US 7501: the run was stopped by Stop. Set by the client on Stop, or sent by the server.
  cancelled: { label: 'Cancelled', badgeClasses: 'bg-gray-100 text-gray-600', icon: 'ban', iconClasses: 'text-gray-500' },
};

const UNKNOWN: SubAgentActivityDisplay = {
  label: 'Status unavailable',
  badgeClasses: 'bg-gray-100 text-gray-600',
  icon: 'wrench',
  iconClasses: 'text-gray-500',
};

export function getSubAgentActivityDisplay(status: string | null | undefined): SubAgentActivityDisplay {
  return (status && Object.prototype.hasOwnProperty.call(DISPLAY, status))
    ? DISPLAY[status as SubAgentActivityStatus]
    : UNKNOWN;
}

// US 8159: sub-agent statuses the Agents bar covers where it is shown: the thread leaves their
// cards out. Failed, denied, expired and cancelled runs stay as one card each.
export const SUB_AGENT_STATUSES_IN_AGENTS_BAR: ReadonlySet<string> = new Set(['started', 'resumed', 'completed', 'awaiting_approval']);
