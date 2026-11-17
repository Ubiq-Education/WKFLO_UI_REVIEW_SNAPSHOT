import { IInitialState } from '@shared/models/chat-models';
import type { SpinUpAgentTarget } from '../schema';
import { ChatMessage, FileAttachment, ToolApprovalDecision } from './chat-service';
import type { ConversationSummary, SessionWorkingState } from '../models/conversation-summary';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  // HTTP status of a failed request, when the caller needs to tell failures apart
  // (e.g. respondToToolApproval: 409 already answered, 410 expired).
  statusCode?: number;
}

// US 7501: what the Stop endpoint returns (inside the usual SuccessResult envelope).
export interface StopAllAgentsResult {
  sessionId: string;
  stoppedAt: string; // ISO 8601, UTC
}

export interface IChatApiService {
  /**
   * Store a message without processing it
   */
  storeMessage(input: { text: string; type: string }, sessionId: string): Promise<ApiResponse<{ data: { message: string } }>>;

  /**
   * Send a message for processing
   *
   * @param isContactFormReplay - True only when this send is the ContactFormCompleted "replay"
   * of an already-shown question (see use-chat.ts's unsubContactFormCompleted handler) — tells
   * the backend this turn is re-running an already-classified/persisted visitor question, not a
   * fresh utterance, so it can skip duplicate topic classification and Chat Logs persistence.
   * Defaults to false/omitted for every ordinary send.
   */
  sendMessage(
    input: { text: string; files?: FileAttachment[] },
    sessionId: string,
    chainOfThought: boolean,
    isContactFormReplay?: boolean
  ): Promise<ApiResponse<{ data: { message: string } }>>;

  /**
   * Send a message for processing
   */
  sendVoiceMessage(
    text: string,
    sessionId: string,
    branchId: string | null,
    chainOfThought: boolean
  ): Promise<ApiResponse<{ data: { message: string } }>>;

  /**
   * Read all messages for a given session
   */
  readMessages(sessionId: string): Promise<ApiResponse<{ 
    resultType: number; 
    data: Array<ChatMessage>;
  }>>;

  /**
   * Get agent settings and configuration
   */
  getAgentSettings(): Promise<IInitialState>;

  /**
   * US 7507: the caller's MAISY conversations, newest activity first. Only the public share-id
   * API has it (test chats, on the tenant API, are never listed).
   */
  listConversations?(): Promise<ApiResponse<{
    resultType: number;
    data: Array<ConversationSummary>;
  }>>;

  /**
   * US 7506: whether agents are still working on a session. Public share-id API only.
   */
  getSessionWorkingState?(sessionId: string): Promise<ApiResponse<{
    resultType: number;
    data: SessionWorkingState;
  }>>;

  /**
   * Get the agents this agent can spin up / reference via @mention, each with its
   * display name and (when configured) its chat icon URL.
   */
  getSpinUpAgents(): Promise<ApiResponse<{
    resultType: number;
    data: Array<SpinUpAgentTarget>;
  }>>;

  /**
   * Authenticate the user
   */
  login(): Promise<void>;

  /**
   * Log out the user
   */
  logout(): Promise<void>;

  /**
   * Check if the user is currently authenticated
   */
  isAuthenticated(): boolean;

  /**
   * Submit a contact form for the current session
   */
  submitContactForm(
    sessionId: string,
    data: { subjectId: string; firstName: string; lastName: string; email: string; originalMessage?: string }
  ): Promise<ApiResponse<void>>;

  /**
   * Check whether the subject already submitted the contact form for this agent.
   * Returns true if already submitted (form should be skipped).
   */
  checkContactFormExists(subjectId: string): Promise<ApiResponse<boolean>>;

  /**
   * Rate an assistant message with thumbs up or thumbs down
   */
  rateMessage(sessionId: string, messageId: string, isThumbsUp: boolean): Promise<ApiResponse<boolean>>;

  /**
   * Answer a pending "Ask for permission" tool call (US 7575). Single-use on the server:
   * 409 = already answered, 410 = expired (reported through `statusCode`).
   */
  respondToToolApproval(sessionId: string, approvalId: string, decision: ToolApprovalDecision): Promise<ApiResponse<void>>;

  /**
   * Stop (US 7501): cancels every agent working in the session, including queued hand-offs.
   * The server then sends typing off, the "idle" state and a ConversationStopped event.
   * 400 = unknown tenant, agent or session (reported through `statusCode`).
   */
  stopAllAgents(sessionId: string): Promise<ApiResponse<StopAllAgentsResult>>;

  /**
   * Get the current user information
   */
  getCurrentUser(): any;

  /**
   * Get the headers (auth + tenant) needed to make an authenticated request,
   * e.g. for fetching a protected image referenced in a message.
   */
  getAuthHeaders(): Promise<Record<string, string>>;
}