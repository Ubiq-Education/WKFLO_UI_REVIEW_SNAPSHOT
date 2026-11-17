import { IChatApiService } from './chat-api.interface';
import { SignalRService, ConnectionPhase, MessageUpdate, ToolExecutionUpdate, TypingIndicatorUpdate, StreamingTokenUpdate, ConversationStateUpdate, ConversationStoppedUpdate, StreamingAudioUpdate, ContactFormUpdate, ContactFormCompletedUpdate, TextSuggestionUpdate, SubAgentActivityUpdate, SubAgentActivityStatus, ToolApprovalDecision, ToolApprovalRequestUpdate, ToolApprovalResolvedUpdate } from './signalr-service';
import type { ToolApprovalState } from '../utils/tool-approval';
import type { ChatErrorState } from '../utils/chat-runtime-error';
import type { ConversationSummary, SessionWorkingState } from '../models/conversation-summary';
import { GENERIC_CHAT_SEND_ERROR } from '../utils/chat-send-errors';

export type { ConversationStoppedUpdate, ContactFormUpdate, ContactFormCompletedUpdate, TextSuggestionUpdate, SubAgentActivityUpdate, SubAgentActivityStatus, ToolApprovalDecision, ToolApprovalRequestUpdate, ToolApprovalResolvedUpdate, ToolApprovalState };

export type MessageType = 'user' | 'assistant' | 'tool' | 'system';
export type ChannelMessageType = 0 | 1 | 2 | 3 | 4; // 0 = NONE, 1 = Normal, 2 = Thinking, 3 = Metadata, 4 = Forms

export interface ChatMessage {
  id: string;
  messageId?: string; // GUID from the API, used for rating
  type: MessageType;
  content: string;
  // US 7974: missing for a history entry the server has no timestamp for (no time is shown).
  timestamp?: Date;
  rawTimestamp?: string; // Original ISO string from server, used for display
  rating?: 'thumbsUp' | 'thumbsDown' | null;
  channelMessageType: ChannelMessageType;
  metadata?: Record<string, any>;
  agentId?: number;
  agentName?: string; // Name of the agent that produced this message, used to label replies when sub-agents are spun up
  chatbotIconUrl?: string; // Per-message bot avatar (the producing agent's configured WKFlo icon); falls back to the host agent's icon when absent
  file?: {
    name: string;
    data: string;
    mimeType: string;
    size: number;
  } | null;
  fileUrl?: string; // URL for file attachments, if applicable
  contentItems?: {
    name: string;
    data?: string;
    status: 'started' | 'success' | 'completed' | 'failed';
    statusCode?: number;
  }[];
  // Present when this history entry is a contact-form prompt rather than a normal chat message
  contactForm?: ContactFormUpdate;
  // Present when this history entry is a text-suggestion prompt (suggested copy for a
  // selected text feature) rather than a normal chat message
  textSuggestion?: TextSuggestionUpdate;
  // Present when this history entry is an MCP OAuth2 reconnect prompt (Task 7130 Addendum 2) —
  // sent when a PerUser MCP tool (e.g. Canva) needs the chat user to re-consent. `startPath` is
  // a relative API path (no host) the card fetches with the widget's own auth headers.
  mcpOAuthReconnect?: {
    toolName: string;
    startPath: string;
    message: string;
  };
  // Present when this history entry is a synthetic card reporting a subagent's live activity
  // (started/completed/failed) — pushed via SubagentActivityUpdate over SignalR from either
  // subagent-invocation path in wkflo_services (Task #7297). Rendered with the subagent's own
  // avatar/name rather than the generic tool icon.
  subAgentActivity?: SubAgentActivityUpdate;
  // Present when this history entry is a "wants to use a tool function" approval card (US 7575)
  // — from the live ToolApprovalRequest SignalR event or its persisted Forms-channel copy
  // (formType "ToolApproval", see hydrate-forms-metadata.ts).
  toolApproval?: ToolApprovalState;
  // Present when this history entry is the "Stopped. All agents cancelled." divider (US 7502) —
  // from the backend's marker message (metadata.isStoppedMarker) or from ConversationStopped.
  // stoppedAt identifies the Stop, so all its sources collapse into one divider.
  stoppedMarker?: { stoppedAt: string };
  // Present when this entry reports a chat turn (or a tool) that failed while the assistant was
  // answering (US 7959) - from the backend's live failed-turn marker (metadata.isError +
  // errorCode). `content` already holds the friendly text of the code.
  chatError?: ChatErrorState;
}

export interface FileAttachment {
  fileName: string;
  fileData: string; // Base64 data URL
  fileSize: number;
}

export interface SendMessageRequest {
  sessionId: string;
  chainOfThought: boolean;
  input: {
    text: string;
    files?: FileAttachment[];
  };
  // True only for the ContactFormCompleted "replay" send (use-chat.ts's
  // unsubContactFormCompleted handler) — tells the backend this turn re-runs an
  // already-classified/persisted visitor question rather than a fresh one, so it can skip
  // duplicate topic classification and Chat Logs persistence. Omitted/false everywhere else.
  isContactFormReplay?: boolean;
}

export interface SendVoiceMessageRequest {
  sessionId: string;
  text: string;
  branchId: string | null;
  chainOfThought: boolean;
}

export interface StoreMessageRequest {
  sessionId: string;
  input: {
    text: string;
    type: string; // Original file name
  };
}

export class ChatService {
  private apiService: IChatApiService;
  private signalRService: SignalRService;

  constructor(apiService: IChatApiService, signalREndpoint: string) {
    this.apiService = apiService;
    this.signalRService = new SignalRService(signalREndpoint);
  }

  async initialize(token?: string): Promise<void> {
    await this.signalRService.connect(token);
    console.log('Chat service initialized with SignalR connection');
  }

  async storeMessage(request: StoreMessageRequest): Promise<{ success: boolean; data?: any; error?: string }> {
    
    try {
      // Join the chat room for real-time updates
      if (this.signalRService.isConnected && request.sessionId) {
        await this.signalRService.joinChat(request.sessionId);
      }

      // Send message via HTTP API (which will trigger SignalR updates from the backend)
      const response = await this.apiService.storeMessage(request.input, request.sessionId);
      
      return response;
    } catch (error) {
      console.error('Failed to send message:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  async sendMessage(request: SendMessageRequest): Promise<{ success: boolean; data?: any; error?: string }> {
    
    try {
      // Join the chat room for real-time updates
      if (this.signalRService.isConnected && request.sessionId) {
        await this.signalRService.joinChat(request.sessionId);
      }

      // Send message via HTTP API (which will trigger SignalR updates from the backend)
      const response = await this.apiService.sendMessage(request.input, request.sessionId, request.chainOfThought, request.isContactFormReplay);

      return response;
    } catch (error) {
      console.error('Failed to send message:', error);
      // US 7948: shown in the chat, so never the raw error.
      return {
        success: false,
        error: GENERIC_CHAT_SEND_ERROR
      };
    }
  }

  async sendVoiceMessage(request: SendVoiceMessageRequest): Promise<{ success: boolean; data?: any; error?: string }> {
    
    try {
      // Join the chat room for real-time updates
      if (this.signalRService.isConnected && request.sessionId) {
        await this.signalRService.joinChat(request.sessionId);
      }

      // Send message via HTTP API (which will trigger SignalR updates from the backend)
      const response = await this.apiService.sendVoiceMessage(request.text, request.sessionId, request.branchId, request.chainOfThought);
      
      return response;
    } catch (error) {
      console.error('Failed to send message:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  async joinChat(chatId: string): Promise<void> {
    if (this.signalRService.isConnected) {
      await this.signalRService.joinChat(chatId);
    }
  }

  async leaveChat(chatId: string): Promise<void> {
    if (this.signalRService.isConnected) {
      await this.signalRService.leaveChat(chatId);
    }
  }

  async sendTypingIndicator(chatId: string, isTyping: boolean, userName: string): Promise<void> {
    if (this.signalRService.isConnected) {
      await this.signalRService.sendTypingIndicator(chatId, isTyping, userName);
    }
  }

  // SignalR Event Subscriptions
  onMessageUpdate(handler: (update: MessageUpdate) => void): () => void {
    return this.signalRService.onMessageUpdate(handler);
  }

  onToolExecutionUpdate(handler: (update: ToolExecutionUpdate) => void): () => void {
    return this.signalRService.onToolExecutionUpdate(handler);
  }

  onSubAgentActivityUpdate(handler: (update: SubAgentActivityUpdate) => void): () => void {
    return this.signalRService.onSubAgentActivityUpdate(handler);
  }

  onTypingIndicator(handler: (update: TypingIndicatorUpdate) => void): () => void {
    return this.signalRService.onTypingIndicator(handler);
  }

  onStreamingToken(handler: (update: StreamingTokenUpdate) => void): () => void {
    return this.signalRService.onStreamingToken(handler);
  }

  onStreamingAudio(handler: (update: StreamingAudioUpdate) => void): () => void {
    return this.signalRService.onStreamingAudio(handler);
  }

  onConversationStateUpdate(handler: (update: ConversationStateUpdate) => void): () => void {
    return this.signalRService.onConversationStateUpdate(handler);
  }

  onContactFormRequest(handler: (update: ContactFormUpdate) => void): () => void {
    return this.signalRService.onContactFormRequest(handler);
  }

  onContactFormCompleted(handler: (update: ContactFormCompletedUpdate) => void): () => void {
    return this.signalRService.onContactFormCompleted(handler);
  }

  onToolApprovalRequest(handler: (update: ToolApprovalRequestUpdate) => void): () => void {
    return this.signalRService.onToolApprovalRequest(handler);
  }

  onToolApprovalResolved(handler: (update: ToolApprovalResolvedUpdate) => void): () => void {
    return this.signalRService.onToolApprovalResolved(handler);
  }

  onConversationStopped(handler: (update: ConversationStoppedUpdate) => void): () => void {
    return this.signalRService.onConversationStopped(handler);
  }

  onConnectionStatusChange(handler: (isConnected: boolean) => void): () => void {
    return this.signalRService.onConnectionStatusChange(handler);
  }

  // US 7501 (Stop): drops streaming chunks received for the chat but not shown yet. Text already
  // on screen stays and the SignalR connection is not touched.
  clearQueuedStreamingTokens(chatId: string): void {
    this.signalRService.clearQueuedStreamingTokens(chatId);
  }

  async readMessages(sessionId: string) {
    return this.apiService.readMessages(sessionId);
  }

  async submitContactForm(
    sessionId: string,
    data: { subjectId: string; firstName: string; lastName: string; email: string; originalMessage?: string }
  ) {
    return this.apiService.submitContactForm(sessionId, data);
  }

  async checkContactFormExists(subjectId: string) {
    return this.apiService.checkContactFormExists(subjectId);
  }

  async rateMessage(sessionId: string, messageId: string, isThumbsUp: boolean) {
    return this.apiService.rateMessage(sessionId, messageId, isThumbsUp);
  }

  async respondToToolApproval(sessionId: string, approvalId: string, decision: ToolApprovalDecision) {
    return this.apiService.respondToToolApproval(sessionId, approvalId, decision);
  }

  // US 7501: Stop for the whole session - every agent, including queued hand-offs. Not the voice
  // feature's stopConversation, which only ends voice input/playback.
  async stopAllAgents(sessionId: string) {
    return this.apiService.stopAllAgents(sessionId);
  }

  async getAgentSettings() {
    return this.apiService.getAgentSettings();
  }

  async getSpinUpAgents() {
    return this.apiService.getSpinUpAgents();
  }

  // US 7507: the MAISY conversations list. An API without it (the tenant API) lists nothing.
  async listConversations(): Promise<{ success: boolean; data?: ConversationSummary[]; error?: string }> {
    if (!this.apiService.listConversations) {
      return { success: true, data: [] };
    }
    const response = await this.apiService.listConversations();
    if (!response.success) {
      return { success: false, error: response.error };
    }
    return { success: true, data: response.data?.data ?? [] };
  }

  // US 7506: whether agents are still working on the session. Not working when the API has no
  // such call or the request fails - the chat then simply shows the history.
  async getSessionWorkingState(sessionId: string): Promise<SessionWorkingState> {
    if (!this.apiService.getSessionWorkingState) {
      return { isWorking: false };
    }
    const response = await this.apiService.getSessionWorkingState(sessionId);
    return response.success && response.data?.data ? response.data.data : { isWorking: false };
  }

  // Authentication methods
  async login(): Promise<void> {
    return this.apiService.login();
  }

  async logout(): Promise<void> {
    return this.apiService.logout();
  }

  isAuthenticated(): boolean {
    return this.apiService.isAuthenticated();
  }

  getCurrentUser(): any {
    return this.apiService.getCurrentUser();
  }

  getAuthHeaders(): Promise<Record<string, string>> {
    return this.apiService.getAuthHeaders();
  }

  get isConnected(): boolean {
    return this.signalRService.isConnected;
  }

  // US 7550: connecting / connected / reconnecting / disconnected - see ConnectionPhase.
  getConnectionPhase(): ConnectionPhase {
    return this.signalRService.getConnectionPhase();
  }

  getConnectionState(): string {
    if (!this.signalRService.isConnected) {
      return 'Disconnected';
    }
    return this.signalRService.getConnectionState();
  }

  async disconnect(): Promise<void> {
    // US 7550: always - a connection that is still connecting or reconnecting by itself must be
    // stopped too, or it reconnects after the chat that created it is gone.
    await this.signalRService.disconnect();
  }
}