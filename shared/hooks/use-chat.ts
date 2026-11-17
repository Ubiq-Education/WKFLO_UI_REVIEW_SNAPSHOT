import { useState, useEffect, useCallback, useRef, useMemo, useContext } from 'react';
import { ChatService, ChatMessage, SendMessageRequest, FileAttachment, SendVoiceMessageRequest, ContactFormUpdate, ContactFormCompletedUpdate } from '../services/chat-service';
import { hydrateFormsMetadata } from '../utils/hydrate-forms-metadata';
import { buildStoppedMarkerMessage, isStoppedMarkerMetadata } from '../utils/stopped-marker';
import { GENERIC_CHAT_SEND_ERROR, describeChatRuntimeError } from '../utils/chat-send-errors';
import { buildChatErrorMessage, isChatErrorMetadata } from '../utils/chat-runtime-error';
import { ConnectionPhase, MessageUpdate, ToolExecutionUpdate, TypingIndicatorUpdate, ConversationStateUpdate, ConversationStoppedUpdate, StreamingTokenUpdate, StreamingAudioUpdate, SubAgentActivityUpdate, SubAgentActivityStatus, ToolApprovalDecision, ToolApprovalRequestUpdate, ToolApprovalResolvedUpdate } from '../services/signalr-service';
import {
  ToolApprovalState,
  toolApprovalMessageId,
  statusForDecision,
  isToolApprovalAwaitingAnswer,
  isToolApprovalExpired,
  effectiveToolApprovalStatus,
  withFallbackExpiry,
} from '../utils/tool-approval';
import { useChatMessages, SharedChatMessage } from '../provider/chat-messages-provider';
import {
  AudioQueueItem, 
  SpeechRecognition, 
  SpeechRecognitionEvent, 
  SpeechRecognitionErrorEvent,
  ChatStatus  
} from '../components/controls/speech-bot/models/voice-chatbot';
import { DataContext, IInitialState } from '../models/chat-models';
import { serverTimestampOrNow } from '../utils/message-timestamp';

// One entry per agent currently "typing" (root agent, or a subagent mid hand-off). Task #7373:
// replaces the old single scalar (isAgentTyping + typingAgentIconUrl), which meant a second
// agent's typing state simply clobbered the first's, so only one bubble could ever render.
export interface TypingAgentInfo {
  agentId?: number;
  agentName?: string;
  chatbotIconUrl?: string;
}

// Key for the typingAgents map — prefers the stable numeric agentId (added for Task #7373 on
// TypingIndicatorUpdate); falls back to agentName for an older backend that hasn't rolled the
// field out yet, so two differently-named agents typing at once still get independent bubbles.
function getTypingAgentKey(agentId?: number, agentName?: string): string {
  if (agentId !== undefined && agentId !== null) {
    return `id:${agentId}`;
  }
  return agentName ?? '__typing_unknown__';
}

// An agent shown in the Agents bar (Task #7920): one taking part in the current run. Collected from
// the same TypingIndicator and SubAgentActivity events the thread already uses, so it only holds
// what those payloads carry. The bar shows names only (no role or description).
export interface SessionAgentInfo {
  // Same key as typingAgents (see getTypingAgentKey), so typing and sub-agent events for one
  // agent land on one entry.
  key: string;
  agentId?: number;
  agentName?: string;
  chatbotIconUrl?: string;
}

// Sub-agent statuses that mean the sub-agent is still working. Anything else (completed, failed,
// denied, expired, awaiting_approval, or a status added later) means it is not.
const RUNNING_SUB_AGENT_STATUSES: ReadonlySet<SubAgentActivityStatus> = new Set<SubAgentActivityStatus>(['started', 'resumed']);

// Task 7947: a sub-agent status that means the sub-agent's run is over, so it leaves the Agents bar.
// awaiting_approval is a pause, not an end: the run goes on after the decision.
function isFinalSubAgentStatus(status: SubAgentActivityStatus): boolean {
  return !RUNNING_SUB_AGENT_STATUSES.has(status) && status !== 'awaiting_approval';
}

// Adds the agent the first time it shows up (keeping first-seen order) and fills in any field
// a later event carries that an earlier one didn't.
function upsertSessionAgent(prev: Map<string, SessionAgentInfo>, info: SessionAgentInfo): Map<string, SessionAgentInfo> {
  const existing = prev.get(info.key);
  const merged: SessionAgentInfo = {
    key: info.key,
    agentId: info.agentId ?? existing?.agentId,
    agentName: info.agentName ?? existing?.agentName,
    chatbotIconUrl: info.chatbotIconUrl ?? existing?.chatbotIconUrl,
  };
  if (existing
    && existing.agentId === merged.agentId
    && existing.agentName === merged.agentName
    && existing.chatbotIconUrl === merged.chatbotIconUrl) {
    return prev;
  }
  const next = new Map(prev);
  next.set(info.key, merged);
  return next;
}

// US 8159: what the active agent is doing, shown in the Agents bar next to its name instead of as
// typing bubbles / sub-agent cards in the thread.
export type AgentActivityStatus =
  | { kind: 'thinking'; agent: SessionAgentInfo }
  | { kind: 'running'; agent: SessionAgentInfo; action?: string }
  | { kind: 'awaiting_approval'; agent: SessionAgentInfo; action?: string };

// US 8159: the thread card of a sub-agent run still in progress (see mergeSubAgentCards).
interface SubAgentRunCard {
  cardId: string;
  agentKey: string;
  orchestrationInstanceId?: string;
  action: string;
  status: SubAgentActivityStatus;
}

function makeRunCardKey(orchestrationInstanceId: string | undefined, agentKey: string, action: string): string {
  return `${orchestrationInstanceId ?? ''}|${agentKey}|${action}`;
}

// Task 7947: the Agents bar's own state, kept in one useState so that events handled in the same
// batch (several SignalR messages from one frame) see each other's changes in order - e.g. an idle
// right after a typing-on departs the agent that typing-on added.
interface AgentsBarState {
  // The agents in the bar, in the order they joined.
  agents: Map<string, SessionAgentInfo>;
  // Agents whose work is over (their sub-agent run ended, or the run ended). They leave the bar as
  // soon as they are neither typing nor running.
  departed: Set<string>;
  // Agents paused on a tool approval: a run end doesn't depart them, so their avatar stays (inactive)
  // until they finish after the answer.
  held: Set<string>;
  // The approval cards behind those holds: approvalId -> agent key.
  heldApprovals: Map<string, string>;
  // Who is typing / running as a sub-agent, mirrored from typingAgents/runningSubAgents in the same
  // event handlers, so a departed agent can leave the bar within the same batch (see pruneDeparted).
  typing: Set<string>;
  running: Set<string>;
}

const EMPTY_AGENTS_BAR: AgentsBarState = {
  agents: new Map(), departed: new Set(), held: new Set(), heldApprovals: new Map(), typing: new Set(), running: new Set(),
};

// A departed agent that is neither typing nor running leaves the bar at once. Applied after every
// change, so in the same batch an agent that finished and then starts again joins at the end, while
// one marked done but still typing or running stays where it is.
function pruneDeparted(state: AgentsBarState): AgentsBarState {
  const leaving = Array.from(state.departed).filter(key => !state.typing.has(key) && !state.running.has(key));
  if (leaving.length === 0) return state;
  const agents = new Map(state.agents);
  const departed = new Set(state.departed);
  leaving.forEach(key => { agents.delete(key); departed.delete(key); });
  return { ...state, agents, departed };
}

function withKey(set: Set<string>, key: string, present: boolean): Set<string> {
  if (set.has(key) === present) return set;
  const next = new Set(set);
  if (present) next.add(key); else next.delete(key);
  return next;
}

function withoutKey(set: Set<string>, key: string): Set<string> {
  if (!set.has(key)) return set;
  const next = new Set(set);
  next.delete(key);
  return next;
}

function renameKey(set: Set<string>, fromKey: string, toKey: string): Set<string> {
  if (!set.has(fromKey)) return set;
  const next = new Set(set);
  next.delete(fromKey);
  next.add(toKey);
  return next;
}

// Replaces `fromKey` with `toKey` in place (keeping its position) when `toKey` isn't there yet;
// otherwise just drops `fromKey`, keeping the entry already under `toKey`.
function rekeyMapEntry<V>(prev: Map<string, V>, fromKey: string, toKey: string, update: (value: V) => V = value => value): Map<string, V> {
  if (!prev.has(fromKey)) return prev;
  const next = new Map<string, V>();
  prev.forEach((value, key) => {
    if (key === fromKey) {
      if (!prev.has(toKey)) next.set(toKey, update(value));
    } else {
      next.set(key, value);
    }
  });
  return next;
}
// How long "working" may wait after a send for the first sign of work (a typing or sub-agent
// event) before giving up - the same safety net the typing bubbles use.
const AWAITING_FIRST_EVENT_TIMEOUT_MS = 60000;

// US 7501: how long this client waits for the ConversationStopped echo of its own Stop. If the
// echo is lost (e.g. over a reconnect), a later genuine ConversationStopped is not mistaken for it.
const OWN_STOP_ECHO_TIMEOUT_MS = 15000;

// US 7501: epoch milliseconds of a stoppedAt (ISO 8601), or null when missing or unreadable.
// Fractions are cut to milliseconds first: not every browser parses more than three digits.
function stopTime(stoppedAt: string | undefined | null): number | null {
  if (!stoppedAt) return null;
  const time = Date.parse(stoppedAt.trim().replace(/(\.\d{3})\d+/, '$1'));
  return Number.isNaN(time) ? null : time;
}

// Moves the key to the end, so the last entry is the agent that most recently started working.
function markMostRecentlyActive(prev: string[], key: string): string[] {
  if (prev[prev.length - 1] === key) return prev;
  return [...prev.filter(k => k !== key), key];
}

export interface UseChatOptions {
  chatId?: string;
  chainOfThought: boolean;
  // US 8159: set where the Agents bar is shown. All updates of one sub-agent run then merge into a
  // single thread card. Off (the Chat Widget), every update adds its own card, as before.
  mergeSubAgentCards?: boolean;
  autoConnect?: boolean;
  onMessage?: (message: ChatMessage) => void;
  onTyping?: (isTyping: boolean, agentName?: string) => void;
  onToolExecution?: (toolName: string, status: string, statusCode?: number, description?: string) => void;
  onConversationState?: (update: ConversationStateUpdate) => void;
  onConnectionChange?: (isConnected: boolean) => void;
  onReconnect?: () => void;
  // US 7501: a phrase recognised by voice input (already on) while agents work is not sent - it is
  // handed here instead, to keep as the message draft like typed text. Voice input stays on.
  onVoiceTranscriptWhileWorking?: (transcript: string) => void;
}

// US 7506: an agent still working on a conversation, as the session working state reports it.
export interface WorkingAgentInfo {
  agentId?: number;
  agentName?: string;
  chatbotIconUrl?: string;
}

export interface UseChatReturn {
  // Text chat states and functions
  messages: SharedChatMessage[];
  isConnected: boolean;
  isLoading: boolean;
  connectionState: string;
  // US 7550: the connection as the MAISY header and banner show it (see ConnectionPhase).
  connectionPhase: ConnectionPhase;
  // US 7506: on returning to a conversation whose agents kept working in the background, shows
  // them as working again (typing, Agents bar, Stop) until their typing-off arrives. Ignored when
  // chatId is no longer the current session, or when a live event of chatId (typing, conversation
  // state, message, Stop) arrived after liveEventToken was read: the live events are newer than
  // the working state the caller looked up.
  restoreWorkingAgents: (chatId: string, agents: WorkingAgentInfo[], liveEventToken?: number) => void;
  // US 7506: read right before looking up a session's working state, and passed back to
  // restoreWorkingAgents with its answer.
  getLiveEventToken: (chatId: string) => number;
  // Derived back-compat boolean — true whenever typingAgents is non-empty.
  isAgentTyping: boolean;
  // One entry per agent currently typing, in stable (insertion) order — the root agent, and/or
  // any subagent mid hand-off. Icon/name resolve via the same AgentChatIconHelper-backed
  // TypingIndicatorUpdate.chatbotIconUrl SendSubagentActivityUpdate already uses. Undefined
  // chatbotIconUrl falls back to the host agent's own icon.
  typingAgents: TypingAgentInfo[];
  // Agents bar (Task #7920): the agents taking part in the current run, in the order they joined.
  // Task 7947: an agent leaves when it is done - its sub-agent run ends (any status other than
  // started/resumed/awaiting_approval), or the run ends (idle/error) - unless it is still typing or
  // running, in which case it leaves once that stops. A bare typing-off only makes it inactive.
  // Stop clears the list. Reset when the session (chatId) changes.
  sessionAgents: SessionAgentInfo[];
  // The agent working right now: of the agents currently typing or running as a sub-agent, the
  // one that started most recently. Null when nobody is working.
  activeAgent: SessionAgentInfo | null;
  // US 8159: what the active agent is doing right now (thinking, running a sub-agent action, or
  // paused on a tool approval); a running sub-agent action wins over typing. Null when idle.
  activeStatus: AgentActivityStatus | null;
  // Ends every agent's "working" state at once (typing bubbles and running sub-agents) and, since
  // they are all done, empties sessionAgents (Task 7947). Meant for Stop, which cancels all agents
  // in one go.
  clearActiveAgents: () => void;
  // US 7500/7501: true from the moment a message is sent until all work is done - while any agent
  // is typing or any sub-agent is running, across hand-offs. False while a tool approval waits for
  // an answer, and straight after Stop. Drives the Send/Stop swap; separate from isLoading.
  isWorking: boolean;
  // US 7501: Stop for the whole session - cancels every agent, including queued hand-offs. The UI
  // goes back to idle at once (queued chunks dropped, late events of the stopped run ignored,
  // Agents bar cleared, running sub-agent cards cancelled), without waiting for the server. The
  // connection stays as it is. Not the voice feature's stopConversation.
  stopAllAgents: () => Promise<{ success: boolean; error?: string }>;
  // US 7948: resolves with the outcome, so the chat can show `error` (friendly text) when it fails.
  sendMessage: (input: string, sessionId: string, files?: FileAttachment[]) => Promise<{ success: boolean; error?: string }>;
  joinChat: (chatId: string) => Promise<void>;
  leaveChat: (chatId: string) => Promise<void>;
  sendTypingIndicator: (chatId: string, isTyping: boolean, userName: string) => Promise<void>;
  clearMessages: () => void;
  error: string | null;
  addMessage: (message: ChatMessage) => void;
  updateMessageRating: (messageId: string, rating: 'thumbsUp' | 'thumbsDown' | null) => void;
  reconnect: () => Promise<void>;
  // Headers (auth + tenant) for authenticated fetches outside the chat service itself,
  // e.g. loading a protected image referenced in a message.
  getAuthHeaders: () => Promise<Record<string, string>>;

  // Contact form — forms are appended to `messages` as entries with a `contactForm` payload
  // (message.type === 'system'), so several can be visible in history at once when non-mandatory
  // ones are ignored. Use these to resolve a specific one.
  submitContactForm: (
    sessionId: string,
    message: ChatMessage,
    data: { subjectId: string; firstName: string; lastName: string; email: string; originalMessage: string }
  ) => Promise<{ success: boolean; error?: string }>;
  skipContactForm: (message: ChatMessage) => void;
  // True when a mandatory form is pending — visible in history OR still buffered while the
  // agent finishes typing/streaming. Consumers should hide their input while this is true.
  hasMandatoryPendingContactForm: boolean;

  // Tool approval ("Ask for permission", US 7575) — cards are appended to `messages` as entries
  // with a `toolApproval` payload. Answer one with respondToToolApproval; while any is still
  // waiting for an answer, hasPendingToolApproval is true and consumers should block their input.
  respondToToolApproval: (
    approval: ToolApprovalState,
    decision: ToolApprovalDecision
  ) => Promise<{ success: boolean; error?: string }>;
  hasPendingToolApproval: boolean;

  // Audio States
  isListening: boolean;
  isAISpeaking: boolean;
  isVoiceChatConnected: boolean;
  streamingActive: boolean;
  isPlayingStream: boolean;
  bufferSize: number;
  consoleMessages: string[];
  audioQueueLength: number;

  // Audio Functions
  startConversation: () => Promise<void>;
  stopConversation: () => void;
  setBufferSize: (size: number) => void;

   // Estado computado
  status: ChatStatus;
  micIconClass: 'streaming' | 'muted' | 'active' | 'inactive';
}

// US 7550: optional call, so a chat service without getConnectionPhase (e.g. a test double) reads
// as connected / disconnected only.
function readConnectionPhase(chatService: ChatService, connected: boolean): ConnectionPhase {
  if (connected) return 'connected';
  return chatService.getConnectionPhase?.() ?? 'disconnected';
}

export function useChat(chatService: ChatService | null, options: UseChatOptions = { chainOfThought: false }): UseChatReturn {
  // Shared chat message state and functions from context
  const { messages, addMessage: addSharedMessage, updateMessage: updateSharedMessage, updateMessageRating: updateSharedMessageRating, clearMessages: clearSharedMessages, removeMessage: removeSharedMessage, patchMessage: patchSharedMessage, insertMessageAfter: insertSharedMessageAfter } = useChatMessages();
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [connectionState, setConnectionState] = useState('Disconnected');
  const [connectionPhase, setConnectionPhase] = useState<ConnectionPhase>('connecting');
  const [chatServiceReady, setChatServiceReady] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [typingAgents, setTypingAgents] = useState<Map<string, TypingAgentInfo>>(new Map());
  // Derived back-compat boolean — see UseChatReturn.isAgentTyping.
  const isAgentTyping = typingAgents.size > 0;
  // Stable-order array view of typingAgents for consumers that render a list (UseChatReturn.typingAgents).
  const typingAgentsList = useMemo(() => Array.from(typingAgents.values()), [typingAgents]);
  // One safety-net timeout per typing agent (keyed the same way as typingAgents), so a stalled
  // agent that never sends isTyping:false only clears its own bubble, not everyone else's.
  const typingTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  // Buffer: holds contact-form requests while the agent is still writing; each one is
  // appended to the message history once typing stops (several can queue up)
  const bufferedContactFormsRef = useRef<ContactFormUpdate[]>([]);
  const isAgentTypingRef = useRef(false);
  // isAgentTyping (the SignalR typing indicator) can turn off before the client finishes
  // animating the already-received tokens onto screen — track that animation separately so
  // a buffered form isn't revealed while the triggering message is still visually "typing".
  const isStreamingMessageRef = useRef(false);
  // Reactive mirror of "a mandatory form is buffered but not yet revealed" — refs alone
  // wouldn't re-render consumers deciding whether to block the chat input.
  const [hasMandatoryBuffered, setHasMandatoryBuffered] = useState(false);
  // Tracks the last text the user actually typed — the backend's ContactFormRequest.message
  // field holds the agent's own registration prompt, not the user's question, so we capture
  // the real trigger question ourselves to submit and replay after registration completes.
  const lastUserMessageRef = useRef<string>('');
  // Set right before a specific form is submitted, so it's available when ContactFormCompleted
  // arrives and the corresponding question needs to be replayed.
  const pendingOriginalMessageRef = useRef<string>('');

  // Keep a ref to the current chatId so handlers always read the latest value
  // without needing to re-subscribe every time the session changes
  const currentChatIdRef = useRef<string | undefined>(options.chatId);
  useEffect(() => {
    currentChatIdRef.current = options.chatId;
    typingTimeoutsRef.current.forEach(timeoutId => clearTimeout(timeoutId));
    typingTimeoutsRef.current.clear();
    setTypingAgents(new Map());
  }, [options.chatId]);

  // Agents bar (Task #7920) — who has taken part, which sub-agents are still running, and the
  // order agents last started working in (most recent last).
  const [agentsBar, setAgentsBar] = useState<AgentsBarState>(EMPTY_AGENTS_BAR);
  const sessionAgents = agentsBar.agents;
  const [runningSubAgents, setRunningSubAgents] = useState<Set<string>>(new Set());
  const [activationOrder, setActivationOrder] = useState<string[]>([]);
  // US 8159: the latest running / awaiting-approval sub-agent update of each agent (its action
  // name feeds the Agents bar status). Entries leave when the sub-agent's run ends.
  const [subAgentStatuses, setSubAgentStatuses] = useState<Map<string, { action: string; status: SubAgentActivityStatus }>>(new Map());
  // US 8159: the thread card id of each sub-agent run still in progress, so every update of a run
  // merges into one card (a stale "Working" card never stays next to the final one).
  const subAgentCardIdsRef = useRef<Map<string, SubAgentRunCard>>(new Map());
  const mergeSubAgentCardsRef = useRef(false);
  mergeSubAgentCardsRef.current = !!options.mergeSubAgentCards;
  // Every agent in agentsBar.agents is shown: done agents that stopped working are pruned at once.
  const sessionAgentsList = useMemo(() => Array.from(agentsBar.agents.values()), [agentsBar.agents]);
  // Every Agents bar change goes through here, so departed agents that stopped working are removed
  // in the same update (Task 7947).
  const updateAgentsBar = useCallback((change: (prev: AgentsBarState) => AgentsBarState) => {
    setAgentsBar(prev => {
      const next = change(prev);
      return next === prev ? prev : pruneDeparted(next);
    });
  }, []);
  const setBarTyping = useCallback((key: string, isTyping: boolean) => {
    updateAgentsBar(prev => {
      const typing = withKey(prev.typing, key, isTyping);
      return typing === prev.typing ? prev : { ...prev, typing };
    });
  }, [updateAgentsBar]);
  const setBarRunning = useCallback((key: string, isRunning: boolean) => {
    updateAgentsBar(prev => {
      const running = withKey(prev.running, key, isRunning);
      return running === prev.running ? prev : { ...prev, running };
    });
  }, [updateAgentsBar]);
  // One agent's typing ends (typing-off or its safety-net timeout).
  const removeTypingAgent = useCallback((key: string) => {
    setTypingAgents(prev => {
      if (!prev.has(key)) return prev;
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
    setBarTyping(key, false);
  }, [setBarTyping]);
  const upsertBarAgent = useCallback((info: SessionAgentInfo) => {
    updateAgentsBar(prev => {
      const agents = upsertSessionAgent(prev.agents, info);
      return agents === prev.agents ? prev : { ...prev, agents };
    });
  }, [updateAgentsBar]);
  // A sub-agent's run ended: it is done and no longer paused.
  const markAgentDeparted = useCallback((key: string) => {
    updateAgentsBar(prev => {
      if (prev.departed.has(key) && !prev.held.has(key)) return prev;
      const departed = new Set(prev.departed);
      departed.add(key);
      return { ...prev, departed, held: withoutKey(prev.held, key) };
    });
  }, [updateAgentsBar]);
  // The run ended: every agent in the bar at this point is done, except one paused on an approval.
  const markRunEnded = useCallback(() => {
    // The run's cards are final, except those still paused on an approval (they resume). The
    // status is kept in the ref itself, so same-batch events (awaiting_approval, then idle) see it.
    subAgentCardIdsRef.current.forEach((run, runKey) => {
      if (run.status !== 'awaiting_approval') subAgentCardIdsRef.current.delete(runKey);
    });
    updateAgentsBar(prev => {
      const departed = new Set(prev.departed);
      prev.agents.forEach((_, key) => { if (!prev.held.has(key)) departed.add(key); });
      return departed.size === prev.departed.size ? prev : { ...prev, departed };
    });
  }, [updateAgentsBar]);
  // An agent that starts working again is neither done nor paused.
  const markAgentWorking = useCallback((key: string) => {
    updateAgentsBar(prev => {
      if (!prev.departed.has(key) && !prev.held.has(key)) return prev;
      return { ...prev, departed: withoutKey(prev.departed, key), held: withoutKey(prev.held, key) };
    });
  }, [updateAgentsBar]);
  // The agent paused on a tool approval (its sub-agent status, or its approval card).
  const holdAgentForApproval = useCallback((key: string, approvalId?: string) => {
    updateAgentsBar(prev => {
      if (prev.held.has(key) && !prev.departed.has(key) && (!approvalId || prev.heldApprovals.get(approvalId) === key)) return prev;
      const held = new Set(prev.held);
      held.add(key);
      const heldApprovals = approvalId ? new Map(prev.heldApprovals).set(approvalId, key) : prev.heldApprovals;
      return { ...prev, departed: withoutKey(prev.departed, key), held, heldApprovals };
    });
  }, [updateAgentsBar]);
  const activeAgent = useMemo<SessionAgentInfo | null>(() => {
    for (let i = activationOrder.length - 1; i >= 0; i--) {
      const key = activationOrder[i];
      if (typingAgents.has(key) || runningSubAgents.has(key)) {
        return sessionAgents.get(key) ?? null;
      }
    }
    return null;
  }, [activationOrder, typingAgents, runningSubAgents, sessionAgents]);

  const activeStatus = useMemo<AgentActivityStatus | null>(() => {
    if (activeAgent) {
      const key = activeAgent.key;
      if (runningSubAgents.has(key)) {
        return { kind: 'running', agent: activeAgent, action: subAgentStatuses.get(key)?.action };
      }
      return { kind: 'thinking', agent: activeAgent };
    }
    // Nobody is working: an agent paused on a tool approval is what the user is waiting on.
    const heldKeys = Array.from(agentsBar.held);
    for (let i = heldKeys.length - 1; i >= 0; i--) {
      const agent = sessionAgents.get(heldKeys[i]);
      if (agent) {
        return { kind: 'awaiting_approval', agent, action: subAgentStatuses.get(heldKeys[i])?.action };
      }
    }
    return null;
  }, [activeAgent, runningSubAgents, subAgentStatuses, agentsBar.held, sessionAgents]);

  // Agents bar (Task #7920): a typing event may carry only the agent's name while its sub-agent
  // events carry its id. Once an id is known for a name, that name's events use the id key, and
  // what was recorded under the name alone moves to the id key (same place in the bar, same state),
  // so one agent shows one avatar. Agents with the same name but different ids stay separate.
  const idKeyByNameRef = useRef<Map<string, string>>(new Map());
  const resolveAgentKey = useCallback((agentId?: number, agentName?: string): string => {
    const key = getTypingAgentKey(agentId, agentName);
    if (agentId !== undefined && agentId !== null) {
      if (agentName) {
        idKeyByNameRef.current.set(agentName, key);
        const nameKey = getTypingAgentKey(undefined, agentName);
        updateAgentsBar(prev => {
          const named = prev.agents.get(nameKey);
          const hasHeldApproval = Array.from(prev.heldApprovals.values()).includes(nameKey);
          if ((!named || named.agentId != null) && !prev.departed.has(nameKey) && !prev.held.has(nameKey) && !hasHeldApproval
            && !prev.typing.has(nameKey) && !prev.running.has(nameKey)) {
            return prev;
          }
          const agents = named && named.agentId == null
            ? rekeyMapEntry(prev.agents, nameKey, key, value => ({ ...value, key, agentId }))
            : prev.agents;
          const heldApprovals = hasHeldApproval
            ? new Map(Array.from(prev.heldApprovals, ([approvalId, agentKey]) => [approvalId, agentKey === nameKey ? key : agentKey] as [string, string]))
            : prev.heldApprovals;
          return {
            agents,
            departed: renameKey(prev.departed, nameKey, key),
            held: renameKey(prev.held, nameKey, key),
            heldApprovals,
            typing: renameKey(prev.typing, nameKey, key),
            running: renameKey(prev.running, nameKey, key),
          };
        });
        setTypingAgents(prev => rekeyMapEntry(prev, nameKey, key, value => ({ ...value, agentId })));
        // US 8159: the card ids and status of this agent's runs follow it to the id key.
        subAgentCardIdsRef.current.forEach((run, oldRunKey) => {
          if (run.agentKey !== nameKey) return;
          subAgentCardIdsRef.current.delete(oldRunKey);
          subAgentCardIdsRef.current.set(
            makeRunCardKey(run.orchestrationInstanceId, key, run.action),
            { ...run, agentKey: key }
          );
        });
        setSubAgentStatuses(prev => rekeyMapEntry(prev, nameKey, key));
        setRunningSubAgents(prev => {
          if (!prev.has(nameKey)) return prev;
          const next = new Set(prev);
          next.delete(nameKey);
          next.add(key);
          return next;
        });
        setActivationOrder(prev => {
          if (!prev.includes(nameKey)) return prev;
          const replaced = prev.map(k => (k === nameKey ? key : k));
          // Keep the last occurrence: the last entry is the most recently active agent.
          return replaced.filter((k, index) => replaced.lastIndexOf(k) === index);
        });
        const namedTimeout = typingTimeoutsRef.current.get(nameKey);
        if (namedTimeout) {
          // The name-keyed safety net would clear the wrong key: hand it over to the id key.
          clearTimeout(namedTimeout);
          typingTimeoutsRef.current.delete(nameKey);
          if (!typingTimeoutsRef.current.has(key)) {
            typingTimeoutsRef.current.set(key, setTimeout(() => {
              removeTypingAgent(key);
              typingTimeoutsRef.current.delete(key);
            }, 60000));
          }
        }
      }
      return key;
    }
    return (agentName && idKeyByNameRef.current.get(agentName)) || key;
  }, [updateAgentsBar, removeTypingAgent]);

  // One agent starts typing: it shows as typing, and in the Agents bar as the latest agent to work.
  const startAgentTyping = useCallback((key: string, agent: WorkingAgentInfo) => {
    const existingTimeout = typingTimeoutsRef.current.get(key);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      typingTimeoutsRef.current.delete(key);
    }

    setTypingAgents(prev => {
      const next = new Map(prev);
      next.set(key, { agentId: agent.agentId, agentName: agent.agentName, chatbotIconUrl: agent.chatbotIconUrl });
      return next;
    });

    // Agents bar: this agent takes part in the run and is now the latest to work.
    markAgentWorking(key);
    upsertBarAgent({
      key,
      agentId: agent.agentId,
      agentName: agent.agentName,
      chatbotIconUrl: agent.chatbotIconUrl,
    });
    setBarTyping(key, true);
    setActivationOrder(prev => markMostRecentlyActive(prev, key));

    // Per-entry safety net — if this agent's isTyping:false never arrives, only its own
    // bubble clears after the timeout, leaving other concurrently-typing agents untouched.
    typingTimeoutsRef.current.set(key, setTimeout(() => {
      removeTypingAgent(key);
      typingTimeoutsRef.current.delete(key);
    }, 60000));
  }, [markAgentWorking, upsertBarAgent, setBarTyping, removeTypingAgent]);

  // US 7506: how many live events each session has had (see UseChatReturn.getLiveEventToken).
  const liveEventTokensRef = useRef<Map<string, number>>(new Map());
  const getLiveEventToken = useCallback((chatId: string) => liveEventTokensRef.current.get(chatId) ?? 0, []);

  // US 7506: see UseChatReturn.restoreWorkingAgents.
  const restoreWorkingAgents = useCallback((chatId: string, agents: WorkingAgentInfo[], liveEventToken?: number) => {
    if (chatId !== currentChatIdRef.current || isRunStoppedRef.current) return;
    if (liveEventToken !== undefined && getLiveEventToken(chatId) !== liveEventToken) return;
    agents.forEach(agent => startAgentTyping(resolveAgentKey(agent.agentId, agent.agentName), agent));
  }, [startAgentTyping, resolveAgentKey, getLiveEventToken]);

  // A new session starts with an empty Agents bar.
  useEffect(() => {
    setAgentsBar(EMPTY_AGENTS_BAR);
    setRunningSubAgents(new Set());
    setActivationOrder([]);
    setSubAgentStatuses(new Map());
    subAgentCardIdsRef.current = new Map();
    idKeyByNameRef.current = new Map();
  }, [options.chatId]);

  const clearActiveAgents = useCallback(() => {
    typingTimeoutsRef.current.forEach(timeoutId => clearTimeout(timeoutId));
    typingTimeoutsRef.current.clear();
    setTypingAgents(new Map());
    setRunningSubAgents(new Set());
    // Task 7947: every agent is done (paused ones too), so the Agents bar empties (and hides).
    setAgentsBar(EMPTY_AGENTS_BAR);
    setActivationOrder([]);
    setSubAgentStatuses(new Map());
    subAgentCardIdsRef.current = new Map();
  }, []);

  // US 7500/7501: "working" starts on send, before the first typing event exists. This covers that
  // gap and ends at the first sign of work (or of a turn that needs the user, or of the end).
  const [isAwaitingFirstEvent, setIsAwaitingFirstEvent] = useState(false);
  const awaitingFirstEventTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // US 7501: true from a send made after a Stop until the new run shows its first sign of work
  // (typing on, or a running sub-agent). A stopped run ends with typing-off + idle, sent by the Stop
  // endpoint and again, usually later, by the cancelled turn itself - with no run id, any number of
  // times, before or after the Stop's echo. Meanwhile an idle can't be told apart from the new
  // run's, so it doesn't end the new run's waiting state (the timeout still bounds it). A stopped
  // run never ends with an error, so an error still ends it at once: the new run failed.
  const ignoreStoppedRunIdleRef = useRef(false);
  const endAwaitingFirstEvent = useCallback(() => {
    if (awaitingFirstEventTimeoutRef.current) {
      clearTimeout(awaitingFirstEventTimeoutRef.current);
      awaitingFirstEventTimeoutRef.current = null;
    }
    setIsAwaitingFirstEvent(false);
  }, []);
  const beginAwaitingFirstEvent = useCallback(() => {
    if (awaitingFirstEventTimeoutRef.current) {
      clearTimeout(awaitingFirstEventTimeoutRef.current);
    }
    setIsAwaitingFirstEvent(true);
    awaitingFirstEventTimeoutRef.current = setTimeout(() => {
      awaitingFirstEventTimeoutRef.current = null;
      setIsAwaitingFirstEvent(false);
    }, AWAITING_FIRST_EVENT_TIMEOUT_MS);
  }, []);

  // US 7501: true after Stop until the next message is sent. The server can still deliver events
  // of the stopped run after ConversationStopped (messages, tool updates, approval requests,
  // typing, tokens, audio, sub-agent updates, contact forms); they carry no run id, so everything
  // of those kinds is ignored in that window.
  const isRunStoppedRef = useRef(false);
  // Set by a Stop from this client until its ConversationStopped echo arrives (a deadline, 0 when
  // none is awaited; cleared on a real reconnect). If a new message was sent in between, that echo
  // must not stop the new run.
  const ownStopEchoDeadlineRef = useRef(0);
  const isAwaitingOwnStopEcho = () => Date.now() < ownStopEchoDeadlineRef.current;
  // The stoppedAt (server time) of this client's latest Stop: from the Stop response, or from the
  // first ConversationStopped while that response is still pending. A ConversationStopped at or
  // before it is that Stop's echo (or older), never a new Stop.
  const ownStoppedAtRef = useRef<number | null>(null);
  // When the current run was sent (client time), after a Stop of this client. A ConversationStopped
  // from before it can't have stopped this run.
  const runSentAtRef = useRef<number | null>(null);
  // Last connection state seen, so only a real reconnect (false -> true) gives up the echo - not
  // the immediate call a (re-)subscription gets.
  const wasConnectedRef = useRef<boolean | null>(null);

  // US 7501: Stop also halts text-to-speech. Set further down, where the audio playback lives.
  const stopSpeechPlaybackRef = useRef<() => void>(() => {});

  // US 7959: ids of the failed-turn markers already handled in this session. The backend sends one
  // per failure, but a resend (retry, another replica) must not end the run or fail cards twice.
  const handledChatErrorIdsRef = useRef<Set<string>>(new Set());

  // A new session starts with nothing stopped and nothing pending.
  useEffect(() => {
    handledChatErrorIdsRef.current = new Set();
    isRunStoppedRef.current = false;
    ownStopEchoDeadlineRef.current = 0;
    ownStoppedAtRef.current = null;
    runSentAtRef.current = null;
    ignoreStoppedRunIdleRef.current = false;
    endAwaitingFirstEvent();
  }, [options.chatId, endAwaitingFirstEvent]);

  // Clear any pending per-agent typing timeouts on unmount — otherwise a timer that fires
  // after unmount would call setTypingAgents on an unmounted hook instance.
  useEffect(() => {
    return () => {
      typingTimeoutsRef.current.forEach(timeoutId => clearTimeout(timeoutId));
      typingTimeoutsRef.current.clear();
      if (awaitingFirstEventTimeoutRef.current) {
        clearTimeout(awaitingFirstEventTimeoutRef.current);
      }
    };
  }, []);

  // Read by Stop to find the sub-agent cards still showing "Working…", without making the stop
  // callback change on every streamed token.
  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // The latest card of each sub-agent that still says "Working…" gets `status` - every sub-agent's,
  // or only the one keyed `agentKey`.
  const patchRunningSubAgentCards = useCallback((status: SubAgentActivityStatus, agentKey?: string) => {
    const seenAgents = new Set<string>();
    const current = messagesRef.current;
    for (let i = current.length - 1; i >= 0; i--) {
      const activity = current[i].subAgentActivity;
      if (!activity) continue;
      const key = getTypingAgentKey(activity.agentId, activity.agentName);
      if (seenAgents.has(key)) continue;
      seenAgents.add(key);
      if ((agentKey === undefined || key === agentKey) && RUNNING_SUB_AGENT_STATUSES.has(activity.status)) {
        patchSharedMessage(current[i].id, message => message.subAgentActivity
          ? { subAgentActivity: { ...message.subAgentActivity, status } }
          : {});
      }
    }
  }, [patchSharedMessage]);

  // Keep isAgentTypingRef in sync so SignalR handlers can read it without stale closures
  useEffect(() => {
    isAgentTypingRef.current = isAgentTyping;
  }, [isAgentTyping]);

  // Builds a history entry for a contact-form request — rendered inline like any other message
  const buildContactFormMessage = (update: ContactFormUpdate): ChatMessage => ({
    id: `contact-form-${Date.now()}-${Math.random()}`,
    type: 'system',
    content: '',
    timestamp: new Date(),
    channelMessageType: 1,
    contactForm: update,
  });

  // Reveals any buffered contact-form requests, but only once both the typing indicator
  // is off AND the last message has finished its visual token-by-token animation
  const flushBufferedContactForms = () => {
    if (isAgentTypingRef.current || isStreamingMessageRef.current) {
      return;
    }
    if (bufferedContactFormsRef.current.length === 0) {
      return;
    }
    const queued = bufferedContactFormsRef.current;
    bufferedContactFormsRef.current = [];
    queued.forEach(update => addSharedMessage(buildContactFormMessage(update), 'text'));
    setHasMandatoryBuffered(false);
  };

  // Typing stopping is one of the two conditions — try flushing whenever it changes
  useEffect(() => {
    if (!isAgentTyping) {
      flushBufferedContactForms();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAgentTyping, addSharedMessage]);

  // Audio-related states
  const [isListening, setIsListening] = useState<boolean>(false);
  const [isAISpeaking, setIsAISpeaking] = useState<boolean>(false);
  const [streamingActive, setStreamingActive] = useState<boolean>(false);
  const [isPlayingStream, setIsPlayingStream] = useState<boolean>(false);
  const [bufferSize, setBufferSize] = useState<number>(2);
  const [consoleMessages, setConsoleMessages] = useState<string[]>([]);
  const micStream = useRef<MediaStream | null>(null);
  const micReady = useRef<boolean>(false);
  const lastAIText = useRef<string>('');
  const phraseCounter = useRef<number>(0);
  const aiSpeakingTimeout = useRef<NodeJS.Timeout | null>(null);
  const recognitionRestartTimeout = useRef<NodeJS.Timeout | null>(null);
  const recognition = useRef<SpeechRecognition | null>(null);
  const audioQueue = useRef<AudioQueueItem[]>([]);
  const currentAudio = useRef<HTMLAudioElement | null>(null);
  const isListeningRef = useRef<boolean>(false);
  const isAISpeakingRef = useRef<boolean>(false);
  const streamingActiveRef = useRef<boolean>(false);
  const isPlayingStreamRef = useRef<boolean>(false);
  
  // Unique ID for the currently playing assistant message (for progressive updates)
  const unsubscribeRefs = useRef<(() => void)[]>([]);

  // Keep refs in sync with audio/mic state so long-lived event handlers always
  // read the current value without stale-closure issues
  useEffect(() => { isListeningRef.current = isListening; }, [isListening]);
  useEffect(() => { isAISpeakingRef.current = isAISpeaking; }, [isAISpeaking]);
  useEffect(() => { streamingActiveRef.current = streamingActive; }, [streamingActive]);
  useEffect(() => { isPlayingStreamRef.current = isPlayingStream; }, [isPlayingStream]);

  // Obtain configuration from React context
  const context: IInitialState = useContext(DataContext);

  // Memoize config values to prevent unnecessary re-initializations
  const configMemo = useMemo(() => ({
    autoConnect: options.autoConnect
  }), [
    options.autoConnect
  ]);

  // Initialize chat service
  useEffect(() => {
    const initializeChat = async () => {
      if (!chatService) {
        setError('API endpoint is required in chat service config');
        return;
      }

      try {
        if (configMemo.autoConnect !== false) {
          await chatService?.initialize();
          setConnectionState(chatService?.getConnectionState() || 'Disconnected');
        }
      } catch (error) {
        console.error('Failed to initialize chat service:', error);
        setError(error instanceof Error ? error.message : 'Failed to initialize chat');
      }
    };

    initializeChat();

    return () => {
      // Cleanup subscriptions
      unsubscribeRefs.current.forEach(unsub => unsub());
      unsubscribeRefs.current = [];
      
      // Disconnect chat service
      if (chatService) {
        chatService.disconnect();
      }
    };
  }, [configMemo, chatService]);

  // Stable version of addConsoleMessage to prevent unnecessary re-renders
  const addConsoleMessage = useCallback((message: string): void => {
    const timestamp = new Date().toLocaleTimeString();
    const newMessage = `[${timestamp}] ${message}`;
    console.log(newMessage);
    setConsoleMessages(prev => [...prev, newMessage]);
  }, []);

  // Set up SignalR event subscriptions
  useEffect(() => {
    if (!chatService) return;

    const subscriptions: (() => void)[] = [];

    // US 7959: a chat turn (or a tool it uses) failed while the assistant was answering. The backend
    // has already sent typing-off for the failing agent (every agent when the turn is over) and,
    // for a turn-level failure, ConversationStateUpdate "error" follows; this does not wait for
    // either. The entry shows the friendly text of the code, never backend text.
    const handleChatError = (update: MessageUpdate) => {
      const errorMessage = buildChatErrorMessage(update);
      if (handledChatErrorIdsRef.current.has(errorMessage.id)) {
        return; // The same failure resent: already shown and handled.
      }
      handledChatErrorIdsRef.current.add(errorMessage.id);
      addSharedMessage(errorMessage, 'text');

      const chatError = errorMessage.chatError!;
      const hasAgent = errorMessage.agentId != null || !!errorMessage.agentName;
      const key = hasAgent ? resolveAgentKey(errorMessage.agentId, errorMessage.agentName) : null;

      // Every failure stops the failing agent's thinking bubble at once.
      if (key) {
        const existingTimeout = typingTimeoutsRef.current.get(key);
        if (existingTimeout) {
          clearTimeout(existingTimeout);
          typingTimeoutsRef.current.delete(key);
        }
        removeTypingAgent(key);
      }

      if (chatError.isTerminal) {
        // The turn is over: nobody is working any more (Stop goes back to Send), running sub-agent
        // cards fail, and every agent leaves the Agents bar - except one paused on an approval.
        // Text already shown stays.
        ignoreStoppedRunIdleRef.current = false;
        endAwaitingFirstEvent();
        typingTimeoutsRef.current.forEach(timeoutId => clearTimeout(timeoutId));
        typingTimeoutsRef.current.clear();
        setTypingAgents(new Map());
        setRunningSubAgents(new Set());
        setSubAgentStatuses(new Map());
        subAgentCardIdsRef.current = new Map();
        updateAgentsBar(prev => (prev.typing.size === 0 && prev.running.size === 0
          ? prev
          : { ...prev, typing: new Set(), running: new Set() }));
        patchRunningSubAgentCards('failed');
        markRunEnded();
        stopSpeechPlaybackRef.current();
      } else if (chatError.severity === 'error' && key) {
        // Only this agent failed: it is done, the rest of the run goes on.
        setRunningSubAgents(prev => {
          if (!prev.has(key)) return prev;
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
        setBarRunning(key, false);
        // Its in-progress cards are over: a later run of the same action starts a new card.
        subAgentCardIdsRef.current.forEach((run, runKey) => {
          if (run.agentKey === key) subAgentCardIdsRef.current.delete(runKey);
        });
        setSubAgentStatuses(prev => {
          if (!prev.has(key)) return prev;
          const next = new Map(prev);
          next.delete(key);
          return next;
        });
        patchRunningSubAgentCards('failed', key);
        markAgentDeparted(key);
      }
      // A warning (a tool isn't available) only adds its entry: the turn goes on.
    };

    // US 7506: counts a live event of the session, before any filtering (see getLiveEventToken).
    const noteLiveEvent = (chatId: string | undefined) => {
      if (!chatId) return;
      liveEventTokensRef.current.set(chatId, (liveEventTokensRef.current.get(chatId) ?? 0) + 1);
    };

    // Message updates
    const unsubMessage = chatService.onMessageUpdate((update: MessageUpdate) => {
      noteLiveEvent(update.chatId);
      // Only process messages for the current session/chat
      if (currentChatIdRef.current && update.chatId !== currentChatIdRef.current) {
        return; // Ignore messages from other sessions
      }
      // US 7501: late messages and metadata/forms of the stopped run are dropped - except the
      // stopped run's own "Stopped. All agents cancelled." marker (US 7502), which arrives this way,
      // after ConversationStopped, and merges into the divider that event already added.
      if (isRunStoppedRef.current && !isStoppedMarkerMetadata(update.message.metadata)) {
        return;
      }

      // US 7959: a failure of the run (never one of a stopped run: dropped above).
      if (isChatErrorMetadata(update.message.metadata)) {
        handleChatError(update);
        return;
      }

      // Metadata updates (3) and Forms updates (4, e.g. the text-suggestion card) — both carry
      // a generic payload in `metadata` that a card component turns into something renderable;
      // hydrateFormsMetadata is the one place that translates that generic envelope (see its
      // doc comment) into the specific typed field (e.g. `textSuggestion`) a card actually reads.
      if (update.message.channelMessageType === 3 || update.message.channelMessageType === 4) {

        const metadataMessage: ChatMessage = {
          id: `metadata-${Date.now()}-${Math.random()}`,
          type: 'system',
          content: update.message.content,
          fileUrl: update.message.fileUrl,
          timestamp: serverTimestampOrNow(update.message.timestamp), // US 7974
          channelMessageType: update.message.channelMessageType, // Metadata or Forms
          metadata: update.message.metadata,
          agentId: update.agentId,
          agentName: update.agentName,
          chatbotIconUrl: update.chatbotIconUrl
        };

        addSharedMessage(hydrateFormsMetadata(metadataMessage), 'text');
      }
    });
    subscriptions.push(unsubMessage);

    // Tool execution updates
    const unsubTool = chatService.onToolExecutionUpdate((update: ToolExecutionUpdate) => {
      // Only process tool updates for the current session/chat
      if (currentChatIdRef.current && update.chatId !== currentChatIdRef.current) {
        return; // Ignore tool updates from other sessions
      }
      if (isRunStoppedRef.current) {
        return; // US 7501: late tool update of the stopped run
      }
      
      // US 7959: a failed tool with a chat runtime code says why, in friendly words (never `error`).
      const failureText = update.status === 'failed' && update.errorCode ? ` ${describeChatRuntimeError(update.errorCode)}` : '';
      const toolMessage: ChatMessage = {
        id: `tool-${Date.now()}-${Math.random()}`,
        type: 'tool',
        content: `${update.status !== 'failed' ? '✓ Successfully executed' : '❌ Failed to execute'} ${update.toolName}${failureText}`,
        timestamp: serverTimestampOrNow(update.timestamp), // US 7974
        channelMessageType: 1, // Normal
        contentItems: [{
          name: update.toolName,
          status: update.status,
          statusCode: update.statusCode,
          data: update.description
        }]
      };
      
      addSharedMessage(toolMessage, 'text');
      options.onToolExecution?.(update.toolName, update.status, update.statusCode, update.description);
    });
    subscriptions.push(unsubTool);

    // Subagent activity updates (Task #7297) — live "started/completed/failed" feedback for a
    // subagent invoked either via the LLM-triggered spin-up hand-off or the Dapr multi-agent
    // orchestrator workflow. Rendered as a synthetic history entry carrying the subagent's own
    // name/icon, kept in the timeline (unlike an ephemeral typing indicator) so it stays visible.
    const unsubSubAgentActivity = chatService.onSubAgentActivityUpdate((update: SubAgentActivityUpdate) => {
      // Only process subagent activity for the current session/chat
      if (currentChatIdRef.current && update.chatId !== currentChatIdRef.current) {
        return; // Ignore activity from other sessions
      }
      if (isRunStoppedRef.current) {
        return; // US 7501: late update from the stopped run
      }

      // US 8159: one card per sub-agent run. A run's updates (started, awaiting approval, resumed,
      // then completed or failed) share one id, so they merge instead of piling up. The run ends
      // with its final status; the next run of the same action gets a new card.
      const subAgentKey = resolveAgentKey(update.agentId, update.agentName);
      const runKey = makeRunCardKey(update.orchestrationInstanceId, subAgentKey, update.action);
      const isRunInProgress = RUNNING_SUB_AGENT_STATUSES.has(update.status) || update.status === 'awaiting_approval';
      const newCardId = `subagent-activity-${Date.now()}-${Math.random()}`;
      let cardId = newCardId;
      if (mergeSubAgentCardsRef.current) {
        cardId = subAgentCardIdsRef.current.get(runKey)?.cardId ?? newCardId;
        if (isRunInProgress) {
          subAgentCardIdsRef.current.set(runKey, {
            cardId,
            agentKey: subAgentKey,
            orchestrationInstanceId: update.orchestrationInstanceId,
            action: update.action,
            status: update.status,
          });
        } else {
          subAgentCardIdsRef.current.delete(runKey);
        }
      }

      const subAgentActivityMessage: ChatMessage = {
        id: cardId,
        type: 'tool',
        content: '',
        timestamp: serverTimestampOrNow(update.timestamp), // US 7974
        channelMessageType: 1, // Normal
        agentId: update.agentId,
        agentName: update.agentName,
        chatbotIconUrl: update.chatbotIconUrl,
        subAgentActivity: update,
      };

      addSharedMessage(subAgentActivityMessage, 'text');

      // Agents bar: record the sub-agent and whether it is still running.
      setSubAgentStatuses(prev => {
        const next = new Map(prev);
        if (isRunInProgress) {
          next.set(subAgentKey, { action: update.action, status: update.status });
        } else {
          next.delete(subAgentKey);
        }
        return next;
      });
      const isRunning = RUNNING_SUB_AGENT_STATUSES.has(update.status);
      upsertBarAgent({
        key: subAgentKey,
        agentId: update.agentId,
        agentName: update.agentName,
        chatbotIconUrl: update.chatbotIconUrl,
      });
      setBarRunning(subAgentKey, isRunning);
      setRunningSubAgents(prev => {
        if (prev.has(subAgentKey) === isRunning) return prev;
        const next = new Set(prev);
        if (isRunning) {
          next.add(subAgentKey);
        } else {
          next.delete(subAgentKey);
        }
        return next;
      });
      if (isRunning) {
        markAgentWorking(subAgentKey);
        setActivationOrder(prev => markMostRecentlyActive(prev, subAgentKey));
        ignoreStoppedRunIdleRef.current = false;
        endAwaitingFirstEvent();
      } else if (isFinalSubAgentStatus(update.status)) {
        // Task 7947: this sub-agent is done; it leaves the bar once it isn't typing either.
        markAgentDeparted(subAgentKey);
      } else if (update.status === 'awaiting_approval') {
        // Task 7947: paused, not done - it stays in the bar through the run end that follows.
        holdAgentForApproval(subAgentKey);
      }
    });
    subscriptions.push(unsubSubAgentActivity);

    // Streaming Tokens updates
    const unsubnStreamingToken = chatService.onStreamingToken((update: StreamingTokenUpdate) => {
      // Only process streaming tokens for the current session/chat
      if (currentChatIdRef.current && update.chatId !== currentChatIdRef.current) {
        return; // Ignore tokens from other sessions
      }
      if (isRunStoppedRef.current) {
        return; // US 7501: late chunk from the stopped run
      }
      
      const newMessage: ChatMessage = {
        id: update.messageId,
        messageId: update.messageId,
        type: update.type,
        content: update.token,
        // US 7974: the message's server time. Only the first update of a messageId creates the
        // bubble; later ones only append content, so the bubble keeps this first timestamp.
        timestamp: serverTimestampOrNow(update.timestamp),
        channelMessageType: update.channelMessageType,
        agentId: update.agentId,
        agentName: update.agentName,
        chatbotIconUrl: update.chatbotIconUrl
      };
      updateSharedMessage(newMessage, 'text');

      if (update.isComplete) {
        isStreamingMessageRef.current = false;
        flushBufferedContactForms();
      } else {
        isStreamingMessageRef.current = true;
      }
    });
    subscriptions.push(unsubnStreamingToken);

    // Streaming Audio updates
    const unsubStreamingAudio = chatService.onStreamingAudio((update: StreamingAudioUpdate) => {
        // Only process audio for the current session/chat
        if (currentChatIdRef.current && update.chatId !== currentChatIdRef.current) {
          return; // Ignore audio from other sessions
        }
        
        if (isRunStoppedRef.current) {
          return; // US 7501: late audio from the stopped run
        }

        if (update.base64Audio && update.text) {
          handleStreamingAudio(update.base64Audio, update.text, update.isFinal || false);
        }
    });
    subscriptions.push(unsubStreamingAudio);

    // Typing indicators
    const unsubTyping = chatService.onTypingIndicator((update: TypingIndicatorUpdate) => {
      noteLiveEvent(update.chatId);
      // Only process typing indicators for the current session/chat
      if (currentChatIdRef.current && update.chatId !== currentChatIdRef.current) {
        return; // Ignore typing indicators from other sessions
      }
      if (isRunStoppedRef.current) {
        return; // US 7501: late typing update from the stopped run
      }

      const key = resolveAgentKey(update.agentId, update.agentName);
      // An agent typing is the first sign of work: from here on the typing agents themselves say
      // whether work is going on. A typing-off is not (it may be the stopped run's late one).
      if (update.isTyping) {
        ignoreStoppedRunIdleRef.current = false;
        endAwaitingFirstEvent();
      }

      if (update.isTyping) {
        startAgentTyping(key, update);
      } else {
        const existingTimeout = typingTimeoutsRef.current.get(key);
        if (existingTimeout) {
          clearTimeout(existingTimeout);
          typingTimeoutsRef.current.delete(key);
        }
        removeTypingAgent(key);
      }

      options.onTyping?.(update.isTyping, update.agentName);
    });
    subscriptions.push(unsubTyping);

    // Conversation state updates
    const unsubConversationState = chatService.onConversationStateUpdate((update: ConversationStateUpdate) => {
      noteLiveEvent(update.chatId);
      // Only process conversation state updates for the current session/chat
      if (currentChatIdRef.current && update.chatId !== currentChatIdRef.current) {
        return; // Ignore conversation state from other sessions
      }

      // The turn is over (or failed) even if it never sent a typing event - except an idle while
      // a run sent after a Stop has not shown any work yet (see ignoreStoppedRunIdleRef).
      // Task 7947: the run is over - every agent leaves the bar, except one still typing or running
      // (e.g. a sub-agent the run handed off to), which leaves when it finishes, and one paused on a
      // tool approval. Not for the stopped run's late idle: Stop already emptied the bar.
      if (update.state === 'error') {
        ignoreStoppedRunIdleRef.current = false;
        endAwaitingFirstEvent();
        if (!isRunStoppedRef.current) markRunEnded();
      } else if (update.state === 'idle' && !ignoreStoppedRunIdleRef.current) {
        endAwaitingFirstEvent();
        if (!isRunStoppedRef.current) markRunEnded();
      }

      options.onConversationState?.(update);
    });
    subscriptions.push(unsubConversationState);

    // Contact form requests — buffer while the agent is typing or its message is still
    // animating onto screen, reveal once both are done. The backend's ContactFormPlugin
    // already skips subjects who have submitted the form, so no client-side check here.
    const unsubContactForm = chatService.onContactFormRequest((update: ContactFormUpdate) => {
      if (currentChatIdRef.current && update.chatId !== currentChatIdRef.current) {
        return;
      }
      if (isRunStoppedRef.current) {
        return; // US 7501 (approved change 9): forms of the stopped run are dropped
      }

      // The backend's `message` field is the agent's own registration prompt, not the
      // user's question — replace it with the last message the user actually typed.
      const correctedUpdate: ContactFormUpdate = {
        ...update,
        message: lastUserMessageRef.current || update.message,
      };

      if (isAgentTypingRef.current || isStreamingMessageRef.current) {
        bufferedContactFormsRef.current.push(correctedUpdate);
        if (correctedUpdate.mandatory) {
          setHasMandatoryBuffered(true);
        }
      } else {
        addSharedMessage(buildContactFormMessage(correctedUpdate), 'text');
      }
    });
    subscriptions.push(unsubContactForm);

    // Contact form completed — the agent is now registered, replay the original question silently
    // (no bubble is added here: it was already shown when the user first typed it). Ignore
    // update.originalMessage from the backend — use the client-captured value instead, since
    // the backend field is unreliable (see the ContactFormRequest handler above).
    const unsubContactFormCompleted = chatService.onContactFormCompleted((update: ContactFormCompletedUpdate) => {
      if (currentChatIdRef.current && update.chatId !== currentChatIdRef.current) {
        return;
      }

      const originalMessage = pendingOriginalMessageRef.current;
      if (!originalMessage) {
        return;
      }
      pendingOriginalMessageRef.current = '';

      // The replay is a new run started by the user's own submit, so its events count again.
      isRunStoppedRef.current = false;

      chatService.sendMessage({
        sessionId: update.chatId,
        chainOfThought: options.chainOfThought,
        input: { text: originalMessage },
        // Tells the backend this is a replay of an already-shown/classified question, not a
        // fresh visitor utterance, so it skips duplicate topic classification and Chat Logs
        // persistence for this turn.
        isContactFormReplay: true,
      }).catch(error => {
        console.error('Failed to replay original message after contact form submission:', error);
      });
    });
    subscriptions.push(unsubContactFormCompleted);

    // Tool approval requests (US 7575) — the agent stopped its turn until someone answers.
    // The agent is no longer working, so drop every typing bubble rather than leaving a
    // "Thinking" indicator next to a card that is waiting on the user.
    const unsubToolApprovalRequest = chatService.onToolApprovalRequest((update: ToolApprovalRequestUpdate) => {
      if (currentChatIdRef.current && update.chatId !== currentChatIdRef.current) {
        return;
      }
      if (isRunStoppedRef.current) {
        return; // US 7501: the server expires the stopped run's approvals, so its card would be dead
      }

      typingTimeoutsRef.current.forEach(timeoutId => clearTimeout(timeoutId));
      typingTimeoutsRef.current.clear();
      setTypingAgents(new Map());
      updateAgentsBar(prev => (prev.typing.size === 0 ? prev : { ...prev, typing: new Set() }));
      endAwaitingFirstEvent();
      // Task 7947: the requesting agent is paused, not done - its avatar stays until it finishes.
      holdAgentForApproval(resolveAgentKey(update.agentId, update.agentName), update.approvalId);

      const approvalMessage: ChatMessage = {
        id: toolApprovalMessageId(update.approvalId),
        type: 'system',
        content: '',
        timestamp: new Date(),
        channelMessageType: 4, // Forms
        agentId: update.agentId,
        agentName: update.agentName,
        chatbotIconUrl: update.chatbotIconUrl,
        toolApproval: withFallbackExpiry<ToolApprovalState>({ ...update, status: 'Pending' }),
      };
      addSharedMessage(approvalMessage, 'text');
    });
    subscriptions.push(unsubToolApprovalRequest);

    // Tool approval resolved (US 7575) — answered here, in another tab, or expired server-side.
    const unsubToolApprovalResolved = chatService.onToolApprovalResolved((update: ToolApprovalResolvedUpdate) => {
      if (currentChatIdRef.current && update.chatId !== currentChatIdRef.current) {
        return;
      }

      patchSharedMessage(toolApprovalMessageId(update.approvalId), message => message.toolApproval
        ? { toolApproval: { ...message.toolApproval, status: statusForDecision(update.decision), decision: update.decision, alreadyAnswered: false } }
        : {});
    });
    subscriptions.push(unsubToolApprovalResolved);

    // US 7501: every agent of the session was stopped - by this client (echo of stopAllAgents) or
    // by another one showing the same session.
    const unsubConversationStopped = chatService.onConversationStopped((update: ConversationStoppedUpdate) => {
      noteLiveEvent(update.chatId);
      if (currentChatIdRef.current && update.chatId !== currentChatIdRef.current) {
        return;
      }

      // Is this the echo of this client's own Stop (or an even older Stop)? Told apart by stoppedAt:
      // at or before our own Stop's stoppedAt, or before the current run was sent, it can't have
      // stopped the current run. A later one is a real Stop (e.g. from another tab) and applies even
      // right after our own Stop. Without a readable stoppedAt, fall back to the echo window.
      const time = stopTime(update.stoppedAt);
      const awaitingEcho = isAwaitingOwnStopEcho();
      let isOwnOrOlder: boolean;
      if (time === null) {
        isOwnOrOlder = awaitingEcho;
      } else if (ownStoppedAtRef.current === null && awaitingEcho) {
        ownStoppedAtRef.current = time; // Our Stop's response is still pending: this is its echo.
        isOwnOrOlder = true;
      } else {
        isOwnOrOlder = (ownStoppedAtRef.current !== null && time <= ownStoppedAtRef.current)
          || (runSentAtRef.current !== null && time < runSentAtRef.current);
      }
      if (isOwnOrOlder) {
        ownStopEchoDeadlineRef.current = 0;
        if (!isRunStoppedRef.current) {
          return; // A new message went out after this client's Stop; the echo must not stop it.
        }
      }

      applyStopRef.current();

      // US 7502: one divider per Stop, below the partial text. Shown from this event because no
      // marker message comes when no agent was mid-turn; when markers do come (one per stopped
      // agent, same stoppedAt) they get the same id and merge into this entry.
      addSharedMessage(buildStoppedMarkerMessage(update.stoppedAt), 'text');
    });
    subscriptions.push(unsubConversationStopped);

    // Connection status changes
    const unsubConnection = chatService.onConnectionStatusChange((connected: boolean) => {
      // US 7501: after a real reconnect, an echo of this client's Stop sent while disconnected is
      // never coming. Not on the immediate call a (re-)subscription gets.
      if (connected && wasConnectedRef.current === false) {
        ownStopEchoDeadlineRef.current = 0;
      }
      wasConnectedRef.current = connected;
      setIsConnected(connected);
      setConnectionState(chatService?.getConnectionState() || 'Unknown');
      setConnectionPhase(readConnectionPhase(chatService, connected));
      options.onConnectionChange?.(connected);
    });
    subscriptions.push(unsubConnection);

    // Store subscriptions for cleanup
    unsubscribeRefs.current = subscriptions;

    return () => {
      subscriptions.forEach(unsub => unsub());
    };
  }, [chatService, options.onMessage, options.onTyping, options.onToolExecution, options.onConnectionChange, options.onConversationState, options.chainOfThought, addSharedMessage, updateSharedMessage, patchSharedMessage, endAwaitingFirstEvent, patchRunningSubAgentCards, startAgentTyping]);

  // Auto-join chat if chatId is provided. US 7506: when chatId changes (another MAISY
  // conversation, a reset) or the hook unmounts, the previous session's group is left, so the
  // connection only gets the open conversation's events. Work done meanwhile in a left session is
  // caught up on return (history + session working state), after it is joined again here. A
  // dropped connection needs no leave: its groups go with it (leaveChat is a no-op then).
  useEffect(() => {
    if (!options.chatId || !chatService || !isConnected) return;
    const chatId = options.chatId;
    chatService.joinChat(chatId);
    return () => {
      void chatService.leaveChat(chatId);
    };
  }, [options.chatId, chatService, isConnected]);

  const submitContactForm = useCallback(async (
    sessionId: string,
    message: ChatMessage,
    data: { subjectId: string; firstName: string; lastName: string; email: string; originalMessage: string }
  ): Promise<{ success: boolean; error?: string }> => {
    if (!chatService) {
      return { success: false, error: 'Chat service unavailable. Please try again.' };
    }

    const result = await chatService.submitContactForm(sessionId, data);

    if (result.success) {
      pendingOriginalMessageRef.current = data.originalMessage;
      removeSharedMessage(message.id);
    }

    return { success: result.success, error: result.error };
  }, [chatService, removeSharedMessage]);

  const skipContactForm = useCallback((message: ChatMessage) => {
    removeSharedMessage(message.id);
  }, [removeSharedMessage]);

  const hasMandatoryPendingContactForm = hasMandatoryBuffered || messages.some(m => m.contactForm?.mandatory);

  const respondToToolApproval = useCallback(async (
    approval: ToolApprovalState,
    decision: ToolApprovalDecision
  ): Promise<{ success: boolean; error?: string }> => {
    if (!chatService) {
      return { success: false, error: 'Chat service unavailable. Please try again.' };
    }

    const messageId = toolApprovalMessageId(approval.approvalId);
    const sessionId = approval.sessionId || currentChatIdRef.current || '';
    const result = await chatService.respondToToolApproval(sessionId, approval.approvalId, decision);

    if (result.success) {
      patchSharedMessage(messageId, message => message.toolApproval
        ? { toolApproval: { ...message.toolApproval, status: statusForDecision(decision), decision } }
        : {});
      return { success: true };
    }

    if (result.statusCode === 410) {
      patchSharedMessage(messageId, message => message.toolApproval
        ? { toolApproval: { ...message.toolApproval, status: 'Expired', decision: 'Expired' } }
        : {});
      return { success: false, error: 'This request expired before it was answered.' };
    }

    if (result.statusCode === 409) {
      patchSharedMessage(messageId, message => message.toolApproval
        ? { toolApproval: { ...message.toolApproval, alreadyAnswered: true } }
        : {});
      return { success: false, error: 'This request was already answered.' };
    }

    return { success: false, error: "Couldn't send your answer. Please try again." };
  }, [chatService, patchSharedMessage]);

  // A request nobody answered expires (10 minutes, server-side = denied). Flip the card to
  // Expired on time even if ToolApprovalResolved never reaches this client, so the input
  // unblocks. Keyed on the still-pending approvals only, not on every streamed token.
  const pendingApprovalsKey = messages
    .filter(m => m.toolApproval && m.toolApproval.status === 'Pending' && !m.toolApproval.alreadyAnswered)
    .map(m => `${m.id}|${m.toolApproval!.expiresAtUtc}`)
    .join(',');
  const [approvalExpiryTick, setApprovalExpiryTick] = useState(0);

  useEffect(() => {
    if (!pendingApprovalsKey) return;

    const now = Date.now();
    let nextExpiry = Number.POSITIVE_INFINITY;
    pendingApprovalsKey.split(',').forEach(entry => {
      const separator = entry.lastIndexOf('|');
      const id = entry.slice(0, separator);
      const expiresAtUtc = entry.slice(separator + 1);
      if (isToolApprovalExpired({ expiresAtUtc }, now)) {
        patchSharedMessage(id, message => message.toolApproval
          ? { toolApproval: { ...message.toolApproval, status: 'Expired', decision: 'Expired' } }
          : {});
      } else {
        const expiresAt = Date.parse(expiresAtUtc);
        if (!Number.isNaN(expiresAt)) nextExpiry = Math.min(nextExpiry, expiresAt);
      }
    });

    if (nextExpiry === Number.POSITIVE_INFINITY) return;
    const timeoutId = setTimeout(() => setApprovalExpiryTick(tick => tick + 1), Math.max(0, nextExpiry - now) + 50);
    return () => clearTimeout(timeoutId);
  }, [pendingApprovalsKey, approvalExpiryTick, patchSharedMessage]);

  const hasPendingToolApproval = messages.some(m => isToolApprovalAwaitingAnswer(m.toolApproval));

  // Task 7947: once an approval card is answered or expired, its agent is no longer paused: the
  // next run end (or its sub-agent's final status) removes it from the Agents bar as usual. An
  // expiry starts no turn (no idle follows for the root agent), so an expired agent that isn't
  // working is done at once. Also runs when a hold is added, so a repeated request for an approval
  // already answered doesn't leave a hold behind.
  const waitingApprovalIds = messages
    .filter(m => isToolApprovalAwaitingAnswer(m.toolApproval))
    .map(m => m.toolApproval!.approvalId)
    .join(',');
  const expiredApprovalIds = messages
    .filter(m => m.toolApproval && effectiveToolApprovalStatus(m.toolApproval) === 'Expired')
    .map(m => m.toolApproval!.approvalId)
    .join(',');
  useEffect(() => {
    const waiting = new Set(waitingApprovalIds ? waitingApprovalIds.split(',') : []);
    const expired = new Set(expiredApprovalIds ? expiredApprovalIds.split(',') : []);
    updateAgentsBar(prev => {
      const answered = Array.from(prev.heldApprovals.keys()).filter(approvalId => !waiting.has(approvalId));
      if (answered.length === 0) return prev;
      const heldApprovals = new Map(prev.heldApprovals);
      answered.forEach(approvalId => heldApprovals.delete(approvalId));
      const stillWaiting = new Set(heldApprovals.values());
      const held = new Set(prev.held);
      const departed = new Set(prev.departed);
      answered.forEach(approvalId => {
        const key = prev.heldApprovals.get(approvalId)!;
        if (stillWaiting.has(key)) return;
        held.delete(key);
        if (expired.has(approvalId) && !prev.typing.has(key) && !prev.running.has(key)) departed.add(key);
      });
      return { ...prev, held, heldApprovals, departed };
    });
  }, [waitingApprovalIds, expiredApprovalIds, agentsBar.heldApprovals, updateAgentsBar]);

  // US 7500/7501: see UseChatReturn.isWorking.
  const isWorking = !hasPendingToolApproval
    && (isAwaitingFirstEvent || typingAgents.size > 0 || runningSubAgents.size > 0);

  // Read by the speech recognition handler, which is set up once (US 7501: no voice sends while
  // working).
  const isWorkingRef = useRef(isWorking);
  const onVoiceTranscriptWhileWorkingRef = useRef(options.onVoiceTranscriptWhileWorking);
  useEffect(() => {
    isWorkingRef.current = isWorking;
    onVoiceTranscriptWhileWorkingRef.current = options.onVoiceTranscriptWhileWorking;
  });

  // US 7501: everything Stop does on this client, at once and without the server. Also run when
  // ConversationStopped arrives, so a Stop from another client showing the session lands here too.
  const applyStop = useCallback(() => {
    isRunStoppedRef.current = true;
    endAwaitingFirstEvent();
    stopSpeechPlaybackRef.current();

    // Approved change 8: drop chunks received but not shown yet; text already shown stays.
    const chatId = currentChatIdRef.current;
    if (chatId) {
      chatService?.clearQueuedStreamingTokens(chatId);
    }
    isStreamingMessageRef.current = false;

    // Approved change 9: contact forms queued during the run are dropped, not shown.
    bufferedContactFormsRef.current = [];
    setHasMandatoryBuffered(false);

    // Approved change 8: each sub-agent's latest card still saying "Working…" becomes Cancelled.
    patchRunningSubAgentCards('cancelled');

    clearActiveAgents();
  }, [chatService, endAwaitingFirstEvent, patchRunningSubAgentCards, clearActiveAgents]);

  // The SignalR subscriptions are set up once per service; they reach the latest applyStop here.
  const applyStopRef = useRef(applyStop);
  useEffect(() => {
    applyStopRef.current = applyStop;
  }, [applyStop]);

  const stopAllAgents = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    const sessionId = currentChatIdRef.current;
    // US 7502: where the run was cut. The divider from the Stop response goes right after it, so
    // it stays above a message sent before the response (or ConversationStopped) arrives.
    const current = messagesRef.current;
    const lastMessageIdAtStop = current.length > 0 ? current[current.length - 1].id : null;
    applyStop();

    if (!chatService || !sessionId) {
      return { success: false, error: 'Chat service unavailable. Please try again.' };
    }

    ownStopEchoDeadlineRef.current = Date.now() + OWN_STOP_ECHO_TIMEOUT_MS;
    ownStoppedAtRef.current = null;
    const result = await chatService.stopAllAgents(sessionId);
    if (result.success) {
      const time = stopTime(result.data?.stoppedAt);
      if (time !== null && currentChatIdRef.current === sessionId) {
        ownStoppedAtRef.current = Math.max(ownStoppedAtRef.current ?? time, time);
      }
      // US 7502: show the divider as soon as the server confirms the Stop. Its id comes from
      // stoppedAt, so ConversationStopped and the marker messages of this Stop merge into it.
      const stoppedAt = result.data?.stoppedAt;
      if (stoppedAt && currentChatIdRef.current === sessionId) {
        // If a marker or ConversationStopped of this Stop already added the divider - possibly
        // below a message sent since - it is moved back to just after the message last at Stop.
        insertSharedMessageAfter(lastMessageIdAtStop, buildStoppedMarkerMessage(stoppedAt), 'text', { moveExisting: true });
      }
      return { success: true };
    }

    // The server did not stop the run, so its events are real again (and Stop shows again with
    // the next one, to try once more).
    console.error('Failed to stop the agents:', result.error);
    ownStopEchoDeadlineRef.current = 0;
    if (currentChatIdRef.current === sessionId) {
      isRunStoppedRef.current = false;
    }
    return { success: false, error: "Couldn't stop the agents. Please try again." };
  }, [chatService, applyStop, insertSharedMessageAfter]);

  const sendMessage = useCallback(async (input: string, sessionId: string, files?: FileAttachment[]): Promise<{ success: boolean; error?: string }> => {

    if (!chatService) {
      setError('Chat service not initialized');
      return { success: false, error: GENERIC_CHAT_SEND_ERROR };
    }

    lastUserMessageRef.current = input;
    subAgentCardIdsRef.current = new Map();

    // A new run: its events count again, and it is "working" straight away (US 7500). Right after
    // a Stop, the stopped run's late idles are still to come (see ignoreStoppedRunIdleRef).
    ignoreStoppedRunIdleRef.current = isRunStoppedRef.current;
    if (isRunStoppedRef.current) runSentAtRef.current = Date.now();
    isRunStoppedRef.current = false;
    beginAwaitingFirstEvent();

    setIsLoading(true);
    setError(null);

    try {
      const request: SendMessageRequest = {
        sessionId,
        chainOfThought: options.chainOfThought,
        input: {
          text: input,
          files: files
        }
      };

      const response = await chatService.sendMessage(request);
      
      if (!response.success) {
        endAwaitingFirstEvent();
        const message = response.error || GENERIC_CHAT_SEND_ERROR;
        setError(message);
        return { success: false, error: message };
      }
      return { success: true };
    } catch (error) {
      endAwaitingFirstEvent();
      console.error('Error sending message:', error);
      setError(error instanceof Error ? error.message : 'Failed to send message');
      return { success: false, error: GENERIC_CHAT_SEND_ERROR };
    } finally {
      setIsLoading(false);
    }
  }, [chatService, options.chainOfThought, beginAwaitingFirstEvent, endAwaitingFirstEvent]);

  const joinChat = useCallback(async (chatId: string) => {
    if (chatService) {
      await chatService.joinChat(chatId);
    }
  }, [chatService]);

  const leaveChat = useCallback(async (chatId: string) => {
    if (chatService) {
      await chatService.leaveChat(chatId);
    }
  }, [chatService]);

  const sendTypingIndicator = useCallback(async (chatId: string, isTyping: boolean, userName: string) => {
    if (chatService) {
      await chatService.sendTypingIndicator(chatId, isTyping, userName);
    }
  }, [chatService]);

  const clearMessages = useCallback(() => {
    clearSharedMessages();
  }, [clearSharedMessages]);

  const addMessage = useCallback((message: ChatMessage) => {
    addSharedMessage(message, 'text');
  }, [addSharedMessage]);

  const updateMessageRating = useCallback((messageId: string, rating: 'thumbsUp' | 'thumbsDown' | null) => {
    updateSharedMessageRating(messageId, rating);
  }, [updateSharedMessageRating]);

  // Audio-related functions
  const isLikelyEcho = useCallback((userText: string, aiText: string): boolean => {
    if (!aiText || !userText) return false;
    
    const userLower = userText.toLowerCase().trim();
    const aiLower = aiText.toLowerCase().trim();
    
    if (userLower === aiLower) return true;
    if (userLower.length > 8 && aiLower.includes(userLower)) return true;
    if (aiLower.length > 8 && userLower.includes(aiLower)) return true;
    if (userLower.length < 5 && aiLower.includes(userLower)) return true;
    
    const userWords = userLower.split(' ').filter(w => w.length > 2);
    const aiWords = aiLower.split(' ').filter(w => w.length > 2);
    
    if (userWords.length === 0) return false;
    if (aiWords.length === 0) return false;
    
    let matchingWords = 0;
    for (let word of userWords) {
      if (aiWords.includes(word)) {
        matchingWords++;
      }
    }
    
    return (matchingWords / userWords.length) > 0.4;
  }, []);

  // Function for detecting suspicious patterns
  const isSuspiciousPattern = useCallback((text: string): boolean => {
    const lower = text.toLowerCase().trim();
    
    const suspiciousPatterns = [
      /^(um|uh|eh|ah|mm)\s*$/,
      /^[a-z]\s*$/,
      /^\d+\s*$/,
      /^(yes|yeah|no|ok)\s*$/,
      /^(the|and|or|but|in|on|at)\s*$/,
      /^[^\w\s]*$/,
      /(.)\1{3,}/
    ];
    
    return suspiciousPatterns.some(pattern => pattern.test(lower));
  }, []);

  // Función para verificar si debe descartar el texto
  const checkIfDiscarded = useCallback((transcript: string): boolean => {
    if (isAISpeaking) {
      addConsoleMessage(`🔇 Filtered (AI speaking): "${transcript}"`);
      return true;
    }
    
    if (isLikelyEcho(transcript, lastAIText.current)) {
      addConsoleMessage(`🔇 Echo filtered: "${transcript}"`);
      return true;
    }
    
    if (isSuspiciousPattern(transcript)) {
      addConsoleMessage(`🔇 Pattern filtered: "${transcript}"`);
      return true;
    }
    
    if (transcript.length < 3) {
      addConsoleMessage(`🔇 Too short: "${transcript}"`);
      return true;
    }

    return false;
  }, [isAISpeaking, isLikelyEcho, isSuspiciousPattern, addConsoleMessage]);
  
  // Make sure microphone permissions are granted
  const ensureMicPermission = useCallback(async (): Promise<void> => {
    if (navigator.permissions && navigator.permissions.query) {
      try {
        const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        if (status.state === 'granted') { 
          micReady.current = true; 
          return; 
        }
      } catch (_) {}
    }

    if (!micStream.current) {
      micStream.current = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source = ctx.createMediaStreamSource(micStream.current);
      const gain = ctx.createGain();
      gain.gain.value = 0;
      source.connect(gain).connect(ctx.destination);
    }

    micReady.current = true;
  }, []);

  // Start recognition
  const startRecognition = useCallback((): void => {
    if (recognition.current) {
      try {
        recognition.current.start();
      } catch (error) {
        console.log('Recognition already active or error:', (error as Error).message);
      }
    }
  }, []);

  // Stop recognition
  const stopRecognition = useCallback((): void => {
    if (recognition.current) {
      recognition.current.stop();
    }
  }, []);

  // Function to start conversation
  const startConversation = useCallback(async (): Promise<void> => {
    addConsoleMessage(`🎤 Starting conversation session: ${options.chatId}`);
    
    await ensureMicPermission();

    if (!recognition.current) {
      addConsoleMessage('❌ Voice recognition not available');
      return;
    }
    
    if (!isConnected) {
      addConsoleMessage('❌ No server connection. Connecting...');
      return;
    }
    
    try {
      setIsListening(true);
      setIsAISpeaking(false);
      phraseCounter.current = 0;
    
      startRecognition();
    
      addConsoleMessage('=== AI CONVERSATION STARTED ===');
    
    } catch (error) {
      console.error('Error starting voice recognition:', error);
      addConsoleMessage(`❌ Error starting voice recognition: ${(error as Error).message}`);
      setIsListening(false);
    }
  }, [options.chatId, ensureMicPermission, isConnected, addConsoleMessage, startRecognition]);

  // Function to stop conversation
  const stopConversation = useCallback((): void => {
    setIsListening(false);
    setIsAISpeaking(false);
    
    if (currentAudio.current) {
      currentAudio.current.pause();
      currentAudio.current = null;
    }
    
    // Stop audio streaming
    audioQueue.current = [];
    setIsPlayingStream(false);
    setStreamingActive(false);
    
    if (aiSpeakingTimeout.current) {
      clearTimeout(aiSpeakingTimeout.current);
    }
    if (recognitionRestartTimeout.current) {
      clearTimeout(recognitionRestartTimeout.current);
    }
    
    stopRecognition();
    
    addConsoleMessage('=== AI CONVERSATION ENDED ===');
    addConsoleMessage(`Total exchanges: ${phraseCounter.current}`);
  }, [options.chatId, addConsoleMessage, stopRecognition]);

  // Play next streaming audio
  const playNextStreamingAudio = useCallback((): void => {
    if (audioQueue.current.length === 0) {
      setIsPlayingStream(false);
      
      setTimeout(() => {
        setIsAISpeaking(false);
        setStreamingActive(false);

        if (isListeningRef.current) {
          startRecognition();
          addConsoleMessage('🎤 Streaming complete - microphone reactivated');
        }
      }, 400);
      
      return;
    }

    const audioItem = audioQueue.current.shift()!;
    setIsPlayingStream(true);
    setIsAISpeaking(true);
    
    stopRecognition();

    try {
      if (currentAudio.current) {
        currentAudio.current.pause();
        currentAudio.current = null;
      }

      const binaryString = atob(audioItem.audioData);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      const blob = new Blob([bytes], { type: 'audio/mp3' });
      const audioUrl = URL.createObjectURL(blob);
      const audio = new Audio(audioUrl);
      currentAudio.current = audio;
      
      audio.volume = 0.6;
      
      audio.onplay = () => {
        stopRecognition();
        addConsoleMessage(`🔊 Playing streaming: "${audioItem.text}"`);
      };
      
      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        currentAudio.current = null;
        
        setTimeout(() => {
          playNextStreamingAudio();
        }, 200);
      };
      
      audio.onerror = (error) => {
        console.error('❌ Error playing streaming audio:', error);
        URL.revokeObjectURL(audioUrl);
        currentAudio.current = null;
        
        setTimeout(() => {
          playNextStreamingAudio();
        }, 500);
      };
      
      audio.play();
      
    } catch (error) {
      console.error('❌ Error processing streaming audio:', error);
      setTimeout(() => {
        playNextStreamingAudio();
      }, 500);
    }
  }, [addConsoleMessage, startRecognition, stopRecognition]);

  const handleStreamingAudio = useCallback((base64Data: string, text: string, isFinal: boolean): void => {
    try {
      if (!streamingActiveRef.current) {
        stopRecognition();
        setIsAISpeaking(true);
        setStreamingActive(true);
      }
      
      if (base64Data && base64Data != '') {
        audioQueue.current.push({
          audioData: base64Data,
          text: text,
          isFinal: isFinal
        });
      }

      addConsoleMessage(`🎵 Audio chunk queued: "${text}" (${audioQueue.current.length} in buffer)`);

      if (!isPlayingStreamRef.current && audioQueue.current.length > 0) {
        setIsPlayingStream(true);
        playNextStreamingAudio();
      }
      
    } catch (error) {
      console.error('❌ Error handling streaming audio:', error);
      addConsoleMessage('❌ Error processing streaming audio');
    }
  }, [bufferSize, addConsoleMessage, stopRecognition, playNextStreamingAudio]);

  // US 7501: Stop halts the reply being spoken and drops the audio still queued, then goes back to
  // listening if voice input is on - as when playback finishes on its own.
  const stopSpeechPlayback = useCallback((): void => {
    audioQueue.current = [];
    if (currentAudio.current) {
      currentAudio.current.pause();
      currentAudio.current = null;
    }
    isPlayingStreamRef.current = false;
    streamingActiveRef.current = false;
    setIsPlayingStream(false);
    setIsAISpeaking(false);
    setStreamingActive(false);
    if (isListeningRef.current) {
      startRecognition();
    }
  }, [startRecognition]);
  useEffect(() => {
    stopSpeechPlaybackRef.current = stopSpeechPlayback;
  }, [stopSpeechPlayback]);

  const resetStreamingState = useCallback((): void => {
    stopRecognition();
    
    audioQueue.current = [];
    setIsPlayingStream(false);
    setStreamingActive(false);
    
    if (currentAudio.current) {
      currentAudio.current.pause();
      currentAudio.current = null;
    }
    
    setTimeout(() => {
      setIsAISpeaking(false);
    }, 500);
  }, [addConsoleMessage, stopRecognition]);
  
  // Send text to server
  const sendTextToServer = useCallback(async (text: string, sessionId: string): Promise<void> => {

    if (!chatService) {
      const errorMsg = 'Chat service not initialized - please wait for connection';
      setError(errorMsg);
      addConsoleMessage(`❌ ${errorMsg}`);
      return;
    }

    lastUserMessageRef.current = text;

    // A new run, as for a typed message: its events count again (even right after Stop), and it is
    // "working" straight away (US 7500/7501).
    ignoreStoppedRunIdleRef.current = isRunStoppedRef.current;
    if (isRunStoppedRef.current) runSentAtRef.current = Date.now();
    isRunStoppedRef.current = false;
    beginAwaitingFirstEvent();

    resetStreamingState();
    setStreamingActive(true);

    try {
      const request: SendVoiceMessageRequest = {
        sessionId: sessionId ?? 'unknown_session',
        text: text,
        branchId: null,
        chainOfThought: options.chainOfThought
      };

      const response = await chatService.sendVoiceMessage(request);
      
      if (!response.success) {
        endAwaitingFirstEvent();
        const errorMsg = response.error || 'Failed to send voice message';
        setError(errorMsg);
        addConsoleMessage(`❌ ${errorMsg}`);
      } else {
        // Clear any previous errors on successful send
        setError(null);
        addConsoleMessage(`✅ Voice message sent: "${text}"`);
      }
    } catch (error) {
      endAwaitingFirstEvent();
      const errorMsg = error instanceof Error ? error.message : 'Failed to send voice message';
      setError(errorMsg);
      addConsoleMessage(`❌ ${errorMsg}`);
      console.error('Voice message error:', error);
    }
    
  }, [chatService, resetStreamingState, addConsoleMessage, beginAwaitingFirstEvent, endAwaitingFirstEvent]);

  useEffect(() => {
    
    
    if (chatService) {
      setChatServiceReady(true);
      addConsoleMessage('✅ Chat service is ready');
    } else {
      setChatServiceReady(false);
      addConsoleMessage('❌ Chat service not available');
      return;
    }

    console.log('Speech Recognition UseEffect triggered');
    console.log('Speech Recognition UseEffect - Initializing speech recognition...');

    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      
      if (recognition.current) {
        console.log('Speech Recognition UseEffect - already initialized');
      } else {
        recognition.current = new SpeechRecognition();
        console.log('Speech Recognition UseEffect - Speech recognition initialized');
      }
      
      recognition.current.continuous = true;
      recognition.current.interimResults = false;
      recognition.current.lang = 'en-GB';
      recognition.current.maxAlternatives = 1;

      recognition.current.onresult = function(event: SpeechRecognitionEvent) {
        const lastResultIndex = event.results.length - 1;
        const result = event.results[lastResultIndex];

        if (result.isFinal) {
          const transcript = result[0].transcript.trim();
          
          if (transcript.length > 0) {
            const shouldDiscard = checkIfDiscarded(transcript);
            
            if (shouldDiscard) {
              return;
            }

            // US 7501: while agents work, a phrase is not sent (the same rule as Enter); it is kept
            // as the draft instead, and voice input stays on.
            if (isWorkingRef.current) {
              onVoiceTranscriptWhileWorkingRef.current?.(transcript);
              addConsoleMessage(`✋ Kept as draft while agents work: "${transcript}"`);
              return;
            }

            phraseCounter.current++;
        
            setTimeout(() => {
              lastAIText.current = "";
            }, 5000);
        
            // Add user message to shared messages
            const words = transcript.split(' ');

            // Send word groups progressively with 400ms delay
            const userMessageId = crypto.randomUUID();
            words.forEach((word, index) => {
              setTimeout(() => {
                let contentToAdd = `${word} `;
                
                const userMessage: SharedChatMessage = {
                  id: userMessageId,
                  type: 'user',
                  content: contentToAdd,
                  timestamp: new Date(),
                  channelMessageType: 1, // Normal
                  source: 'voice'
                };
                updateSharedMessage(userMessage);
              }, index * 200);
            });
            
            sendTextToServer(transcript, options.chatId ?? 'unknown_session');
          }
        }
      };

      recognition.current.onerror = function(event: SpeechRecognitionErrorEvent) {
        addConsoleMessage(`❌ Microphone error: ${event.error}`);

        if (event.error === 'not-allowed') {
          addConsoleMessage('❌ Microphone permission denied');
          setIsListening(false);
        } else if (event.error === 'no-speech') {
          addConsoleMessage('⚠️ No voice detected - continuing...');
        } else {
          addConsoleMessage('⚠️ Minor error - conversation continues...');
        }
      };                  

      recognition.current.onend = function() {
        if (isListeningRef.current && !isAISpeakingRef.current && !streamingActiveRef.current) {
          recognitionRestartTimeout.current = setTimeout(() => {
            if (isListeningRef.current && !isAISpeakingRef.current && !streamingActiveRef.current) {
              try {
                startRecognition();
                addConsoleMessage('🔄 Microphone restarted - ready for input');
              } catch (error) {
                console.error('Error restarting recognition:', error);
                addConsoleMessage('❌ Error restarting microphone');
              }
            }
          }, 200);
        }
      };

      recognition.current.onstart = function() {
        if (isListening && !isAISpeaking) {
          addConsoleMessage('🎤 Microphone is active - you can speak now');
        }
      };
      
      console.log('Speech recognition initialized successfully');
    } else {
      console.log('Speech Recognition API not supported in this browser');
      setTimeout(() => addConsoleMessage('❌ Speech Recognition API not supported in this browser'), 0);
      recognition.current = null;
    }

    return () => {
      console.log('Speech Recognition UseEffect unmounting');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.chatId, chatService]);

  const reconnect = useCallback(async () => {
    if (chatService) {
      try {
        setIsLoading(true);
        setError(null);
        await chatService.initialize();
        setConnectionState(chatService.getConnectionState());
        setConnectionPhase(readConnectionPhase(chatService, chatService.isConnected));
        
        // Re-join chat if chatId is available
        if (options.chatId) {
          await chatService.joinChat(options.chatId);
        }
        
        // Call onReconnect callback to refresh messages
        options.onReconnect?.();
      } catch (error) {
        console.error('Error reconnecting:', error);
        setError(error instanceof Error ? error.message : 'Failed to reconnect');
      } finally {
        setIsLoading(false);
      }
    }
  }, [chatService, options.chatId, options.onReconnect]);

  return {
    messages,
    isConnected,
    isLoading,
    connectionState,
    connectionPhase,
    restoreWorkingAgents,
    getLiveEventToken,
    isAgentTyping,
    typingAgents: typingAgentsList,
    sessionAgents: sessionAgentsList,
    activeAgent,
    activeStatus,
    clearActiveAgents,
    isWorking,
    stopAllAgents,
    sendMessage,
    joinChat,
    leaveChat,
    sendTypingIndicator,
    clearMessages,
    error,
    addMessage,
    updateMessageRating,
    reconnect,
    getAuthHeaders: useCallback(
      () => chatService?.getAuthHeaders() ?? Promise.resolve({}),
      [chatService]
    ),

    // Contact form
    submitContactForm,
    skipContactForm,
    hasMandatoryPendingContactForm,

    // Tool approval
    respondToToolApproval,
    hasPendingToolApproval,

    // Audio States
    isListening,
    isAISpeaking,
    isVoiceChatConnected: isConnected,
    streamingActive,
    isPlayingStream,
    bufferSize,
    consoleMessages,
    audioQueueLength: audioQueue.current.length,
    // Audio Functions
    startConversation,
    stopConversation,
    setBufferSize,

    // Computed state
    status: (() => {
      if (!chatService || !chatServiceReady) {
        return { type: 'inactive', text: 'Initializing chat service...' };
      } else if (!context.agentChatSettings) {
        return { type: 'inactive', text: 'Voice chat settings not available' };
      } else if (streamingActive && (isPlayingStream || audioQueue.current.length > 0)) {
        return { type: 'streaming', text: `🚀 Streaming audio... (${audioQueue.current.length} in buffer)` };
      } else if (isAISpeaking) {
        return { type: 'ai-speaking', text: '🤖 AI is speaking... (microphone muted)' };
      } else if (isListening) {
        return { type: 'listening', text: '🎤 Listening... Your turn' };
      } else if (isConnected) {
        return { type: 'inactive', text: 'Connected - Press "Start Conversation" to speak' };
      } else if (chatService) {
        return { type: 'inactive', text: 'Connecting to server...' };
      } else {
        return { type: 'inactive', text: 'Waiting for configuration...' };
      }
    })() as ChatStatus,

    micIconClass: (() => {
      if (streamingActive && (isPlayingStream || audioQueue.current.length > 0)) {
        return 'streaming';
      } else if (isAISpeaking) {
        return 'muted';
      } else if (isListening) {
        return 'active';
      } else {
        return 'inactive';
      }
    })() as 'streaming' | 'muted' | 'active' | 'inactive'

  };
}

export default useChat;