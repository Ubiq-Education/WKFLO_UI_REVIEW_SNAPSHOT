// US 7507: one row of the MAISY conversations list, as
// GET /ai/api/v1/agent/{shareId}/chat/conversations returns it (newest activity first, at most
// 50 from the last 90 days, test chats excluded - all decided by the server).
export interface ConversationAgentSummary {
  agentId: number;
  name: string;
  // Agent.Description, already cut by the server. For the "Name · Role" tooltip.
  role: string | null;
  avatarUrl: string | null;
}

export interface ConversationSummary {
  sessionId: string;
  title: string | null;
  // First user message. null: the row shows "New conversation".
  previewLine: string | null;
  // ISO 8601, UTC. The sort key.
  lastActivityAt: string;
  // MAISY first, then in join order. Never empty.
  agents: ConversationAgentSummary[];
}

// US 7506: whether agents are still working on a conversation (they carry on server-side after
// the user leaves it), from GET /ai/api/v1/agent/{shareId}/chat/{sessionId}/state. True while
// any agent of the session runs a turn or has a hand-off queued. Not pushed: read it once per
// open / reconnect; the live SignalR events take over from there.
export interface SessionWorkingState {
  isWorking: boolean;
}
