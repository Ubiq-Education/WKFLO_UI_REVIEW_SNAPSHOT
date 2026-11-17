import { HubConnection, HubConnectionBuilder, LogLevel, HttpTransportType } from '@microsoft/signalr';
import { getOrCreateSubjectId } from '../utils/subject-id';

export type ChannelMessageType = 1 | 2 | 3 | 4; // 1 = Normal, 2 = Thinking, 3 = Metadata, 4 = Forms

export type MessageType = 'user' | 'assistant' | 'tool' | 'system';

export type ConversationState = 'active' | 'processing' | 'idle' | 'error';

export type ExecutionStatus = 'started' | 'completed' | 'failed';

// US 7550: the connection as the chat shows it. 'connecting' is the first connect of this service
// (no banner); 'reconnecting' is a retry after it had been connected; 'disconnected' means it gave up
// and only a manual retry (reconnect) connects again.
export type ConnectionPhase = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

// US 7550: retry delays after a dropped connection (SignalR's own default). The
// 'reconnecting' state lasts while these run; after the last one the connection closes.
const AUTOMATIC_RECONNECT_DELAYS_MS = [0, 2000, 10000, 30000];

export interface MessageUpdate {
  chatId: string;
  message: {
    id: string;
    type: MessageType;
    content: string;
    fileUrl?: string;
    timestamp?: string | null; // US 7974: UTC ISO 8601
    channelMessageType: ChannelMessageType;
    metadata?: Record<string, any>;
    contentItems?: {
      name: string;
      data?: string;
      status: ExecutionStatus;
      statusCode?: number;
    }[];
  };
  agentId?: number;
  agentName?: string;
  chatbotIconUrl?: string; // Icon URL for the agent that produced this message (per-message avatar)
}

export interface ToolExecutionUpdate {
  chatId: string;
  toolName: string;
  status: ExecutionStatus;
  description?: string;
  statusCode?: number;
  error?: string;
  // US 7959: chat runtime code (WKFLOAI11xx) of a failed tool, when the backend sends one. The
  // chat shows its friendly text, never `error`.
  errorCode?: string;
  // US 7974: UTC ISO 8601 time the server sent this update; absent from an older backend.
  timestamp?: string;
}

// Pushed when a subagent starts/finishes doing work — either via the LLM-triggered spin-up
// hand-off (AgentEventPublisherPlugin) or the Dapr multi-agent orchestrator workflow — so the
// chat timeline can show live "Agent X — started/completed <action>" feedback instead of only
// the eventual result (Task #7297).
// Bug 7722: a sub-agent run can also stop on a tool approval ("Ask for permission"):
// awaiting_approval (run ended waiting for an answer), resumed (allowed; the run continues),
// denied (resumed after Deny, tool not run) and expired (nobody answered in time). Tool execution
// updates keep using ExecutionStatus only.
// US 7501: cancelled = the run was stopped by Stop (all agents cancelled).
export type SubAgentActivityStatus = ExecutionStatus | 'awaiting_approval' | 'resumed' | 'denied' | 'expired' | 'cancelled';

export interface SubAgentActivityUpdate {
  chatId: string;
  agentId: number;
  agentName: string;
  chatbotIconUrl?: string;
  action: string;
  status: SubAgentActivityStatus;
  // Present only for activity coming from the Dapr multi-agent orchestrator workflow path.
  orchestrationInstanceId?: string;
  // US 7959: chat runtime code (WKFLOAI11xx) of a failed sub-agent run, when the backend sends one.
  errorCode?: string;
  // US 7974: UTC ISO 8601 time the server sent this update; absent from an older backend.
  timestamp?: string;
}

export interface TypingIndicatorUpdate {
  chatId: string;
  isTyping: boolean;
  agentId?: number;
  agentName?: string;
  chatbotIconUrl?: string;
}

export interface StreamingTokenUpdate {
  chatId: string;
  messageId: string;
  type: MessageType;
  token: string;
  isComplete: boolean;
  channelMessageType: ChannelMessageType;
  agentId?: number;
  agentName?: string;
  chatbotIconUrl?: string; // Icon URL for the agent that produced this token (per-message avatar)
  // US 7974: UTC ISO 8601 time of the message these tokens belong to - the same for every update
  // of one messageId and equal to its persisted history timestamp. Absent from an older backend.
  timestamp?: string;
}

export interface StreamingTokensUpdate {
  chatId: string;
  messageId: string;
  type: MessageType;
  tokens: string[];
  isComplete: boolean;
  channelMessageType: ChannelMessageType;
  agentId?: number;
  agentName?: string;
  chatbotIconUrl?: string; // Icon URL for the agent that produced these tokens (per-message avatar)
  timestamp?: string; // US 7974: see StreamingTokenUpdate.timestamp
}

export interface StreamingAudioUpdate {
  chatId: string;
  base64Audio: string;
  text: string;
  isFinal: boolean;
}


export interface ConversationStateUpdate {
  chatId: string;
  state: ConversationState;
  metadata?: Record<string, any>;
}

// US 7501: pushed once the user pressed Stop and every agent of the session was cancelled. It
// follows the typing-off and "idle" updates; events from the stopped run can still arrive after it.
export interface ConversationStoppedUpdate {
  chatId: string;
  stoppedAt: string; // ISO 8601, UTC
}

export interface ContactFormUpdate {
  chatId: string;
  message: string;
  mandatory: boolean;
  firstNameRequired: boolean;
  lastNameRequired: boolean;
  emailRequired: boolean;
  submitButtonText: string;
  successMessageEnabled: boolean;
  successMessageText: string;
}

export interface ContactFormCompletedUpdate {
  chatId: string;
  originalMessage: string;
}

// Pushed when the agent calls the `suggest_text_edit` tool for a text feature the user
// selected on the host page — rendered as a suggestion card with insert-action buttons.
// No `chatId` here: this now travels as a normal chat message's metadata (see
// `shared/utils/hydrate-forms-metadata.ts`), which is already session-scoped by the regular
// message pipeline — a dedicated chatId on the payload itself would be redundant.
export interface TextSuggestionUpdate {
  featureId: number;
  suggestedText: string;
}

// US 7575 "Ask for permission": pushed when an agent wants to call a tool function the agent's
// permissions say needs approval. The turn stops until whoever is chatting answers through the
// tool-approval decision endpoint, or the request expires (`expiresAtUtc`, 10 minutes = Deny).
// The same payload (plus its current status) is also persisted as a Forms-channel message
// (`formType: "ToolApproval"`) so a history reload re-renders the card.
export type ToolApprovalDecision = 'AllowOnce' | 'AllowForConversation' | 'Deny';

export interface ToolApprovalRequestUpdate {
  chatId: string;
  sessionId: string;
  approvalId: string;
  agentId?: number;
  agentName?: string;
  chatbotIconUrl?: string;
  toolName: string;
  functionName: string;
  functionDescription?: string;
  // WI 7726: optional admin-chosen display text for the function; older payloads don't send
  // them. Display only - functionName stays the identifier.
  functionDisplayName?: string | null;
  functionDisplayDescription?: string | null;
  argumentsJson?: string;
  expiresAtUtc: string;
}

export interface ToolApprovalResolvedUpdate {
  chatId: string;
  approvalId: string;
  decision: ToolApprovalDecision | 'Expired';
}

export class SignalRService {
  private connection: HubConnection | null = null;
  private readonly hubUrl: string;
  private isConnecting = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private forcedReconnectTimer: NodeJS.Timeout | null = null;
  private readonly FORCED_RECONNECT_INTERVAL = 45000; // 45 seconds - proactive reconnection
  private lastActivityTime: number = 0;
  private readonly ACTIVITY_GRACE_PERIOD = 5000; // 5 seconds grace period after last activity
  private isReconnecting: boolean = false;
  private readonly disableForcedReconnection: boolean;
  // US 7550: drive getConnectionPhase - whether this service was ever connected, and whether a
  // retry of a failed connect() is scheduled.
  private hasConnectedOnce = false;
  private isRetryScheduled = false;
  // The scheduled retry of a failed connect(), so disconnect() can cancel it.
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  // Drops streaming chunks still waiting to be shown. Set up with the token queue in
  // setupEventHandlers, because the queue lives in that closure.
  private discardQueuedTokens: (chatId?: string) => void = () => {};
  
  // Event handlers
  private messageHandlers: ((update: MessageUpdate) => void)[] = [];
  private toolExecutionHandlers: ((update: ToolExecutionUpdate) => void)[] = [];
  private subAgentActivityHandlers: ((update: SubAgentActivityUpdate) => void)[] = [];
  private typingIndicatorHandlers: ((update: TypingIndicatorUpdate) => void)[] = [];
  private streamingTokenHandlers: ((update: StreamingTokenUpdate) => void)[] = [];
  private streamingAudioHandlers: ((update: StreamingAudioUpdate) => void)[] = [];
  private conversationStateHandlers: ((update: ConversationStateUpdate) => void)[] = [];
  private contactFormHandlers: ((update: ContactFormUpdate) => void)[] = [];
  private contactFormCompletedHandlers: ((update: ContactFormCompletedUpdate) => void)[] = [];
  private toolApprovalRequestHandlers: ((update: ToolApprovalRequestUpdate) => void)[] = [];
  private toolApprovalResolvedHandlers: ((update: ToolApprovalResolvedUpdate) => void)[] = [];
  private conversationStoppedHandlers: ((update: ConversationStoppedUpdate) => void)[] = [];
  private connectionStatusHandlers: ((isConnected: boolean) => void)[] = [];

  constructor(baseUrl: string) {
    // Use the base URL from environment or default to current origin
    this.hubUrl = `${baseUrl}/ai/api/v1/chathub`;
    
    // Check if forced reconnection should be disabled (useful for WebSockets)
    this.disableForcedReconnection = true;
  }

  async connect(token?: string): Promise<boolean> {
    
    if (this.connection?.state === 'Connected') {
      return true;
    }

    // US 7550: with automatic reconnect a dropped connection sits in 'Reconnecting' while it
    // retries by itself. Building a second connection then would leave the old one running, and
    // once it came back every event would arrive twice - so leave it to finish (onreconnected /
    // onclose report the outcome).
    if (this.connection?.state === 'Connecting' || this.connection?.state === 'Reconnecting') {
      return false;
    }

    if (this.isConnecting) {
      return false;
    }

    this.isConnecting = true;
    // US 7550: lets the chat show 'connecting'/'reconnecting' while this attempt runs.
    this.notifyConnectionStatus(false);

    let connection: HubConnection | null = null;

    try {
      // Build the connection
      const subjectId = getOrCreateSubjectId();

      const builder = new HubConnectionBuilder()
        .withUrl(this.hubUrl, {
          accessTokenFactory: () => token || '',
          transport: HttpTransportType.WebSockets | HttpTransportType.LongPolling,
          // Long polling specific optimizations
          timeout: 30000, // 30 seconds timeout for requests
          skipNegotiation: false, // this can be true for WebSockets but false for Long Polling
          headers: {
            'amais-wkflo-subject-id': subjectId,
          },
        })        
        // Long polling works better with reduced logging to minimize overhead
        .configureLogging(LogLevel.Warning)
        // Configure keep-alive for long polling
        .withServerTimeout(30000) // 30 seconds server timeout
        .withKeepAliveInterval(10000) // 10 seconds keep-alive
        // US 7550: a dropped connection retries by itself (onreconnecting / onreconnected below)
        // instead of staying closed until the page is reloaded.
        .withAutomaticReconnect(AUTOMATIC_RECONNECT_DELAYS_MS);

      connection = builder.build();
      this.connection = connection;

      // Set up event handlers
      this.setupEventHandlers();

      // Start the connection
      await connection.start();

      // disconnect() ran while this connection was starting (e.g. the chat unmounted): don't
      // leave it running - it would otherwise keep (re)connecting for a chat that is gone.
      if (this.connection !== connection) {
        await connection.stop().catch(() => {});
        return false;
      }

      this.isConnecting = false;
      this.reconnectAttempts = 0;
      this.hasConnectedOnce = true;
      
      console.log('SignalR connected successfully');
      this.notifyConnectionStatus(true);
      
      // Start forced reconnection timer (unless disabled)
      if (!this.disableForcedReconnection) {
        this.startForcedReconnectionTimer(token);
      }
    } catch (error) {

      // disconnect() ran while this attempt was starting: nothing to retry.
      if (connection && this.connection !== connection) {
        return false;
      }

      this.isConnecting = false;
      this.reconnectAttempts++;
      console.error('SignalR connection failed:', error);

      // Retry connection if we haven't exceeded max attempts
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        const delay = Math.min(2000 * Math.pow(2, this.reconnectAttempts - 1), 32000);
        this.isRetryScheduled = true;
        this.retryTimer = setTimeout(() => {
          this.retryTimer = null;
          this.isRetryScheduled = false;
          this.connect(token);
        }, delay);
      }
      // After the retry is scheduled, so the chat shows 'reconnecting' rather than 'disconnected'.
      this.notifyConnectionStatus(false);
      
      return false;
    }
    
    return this.connection.state === 'Connected';
  }

  private startForcedReconnectionTimer(token?: string, customDelay?: number): void {
    // Skip if forced reconnection is disabled
    if (this.disableForcedReconnection) {
      return;
    }
    
    // Clear existing timer
    this.clearForcedReconnectionTimer();
    
    const delay = customDelay || this.FORCED_RECONNECT_INTERVAL;
    
    // Set up forced reconnection timer
    this.forcedReconnectTimer = setTimeout(async () => {
      console.log('Forcing reconnection due to scheduled interval');
      await this.forceReconnect(token);
    }, delay);
  }

  private trackActivity(): void {
    this.lastActivityTime = Date.now();
  }

  // Check if it's safe to reconnect (no recent activity)
  private isSafeToReconnect(): boolean {
    const timeSinceLastActivity = Date.now() - this.lastActivityTime;
    return this.lastActivityTime === 0 || timeSinceLastActivity >= this.ACTIVITY_GRACE_PERIOD;
  }

  private clearForcedReconnectionTimer(): void {
    if (this.forcedReconnectTimer) {
      clearTimeout(this.forcedReconnectTimer);
      this.forcedReconnectTimer = null;
    }
  }

  private async forceReconnect(token?: string): Promise<void> {
    // Check if we're already reconnecting to prevent multiple simultaneous reconnections
    if (this.isReconnecting) {
      console.log('Reconnection already in progress, skipping');
      return;
    }

    // Check for recent activity to avoid interrupting ongoing operations
    const timeSinceLastActivity = Date.now() - this.lastActivityTime;
    if (this.lastActivityTime > 0 && timeSinceLastActivity < this.ACTIVITY_GRACE_PERIOD) {
      console.log(`Delaying reconnection due to recent activity (${timeSinceLastActivity}ms ago)`);
      // Reschedule the reconnection after the grace period
      this.startForcedReconnectionTimer(token, this.ACTIVITY_GRACE_PERIOD - timeSinceLastActivity);
      return;
    }

    console.log('Executing smart reconnection');
    this.isReconnecting = true;
    
    try {
      // Gracefully disconnect current connection
      if (this.connection) {
        console.log('Gracefully stopping connection...');
        await this.connection.stop();
        this.connection = null;
      }
      
      this.notifyConnectionStatus(false);
      
      // Small delay before reconnecting
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Reconnect
      await this.connect(token);

      console.log('Reconnection successful');
      
    } catch (error) {
      console.error('Error during forced reconnection:', error);
      this.notifyConnectionStatus(false);
    } finally {
      this.isReconnecting = false;
    }
  }

  // Public method to manually force reconnection
  async forceReconnection(token?: string): Promise<boolean> {
    console.log('Manual forced reconnection requested');
    await this.forceReconnect(token);
    return this.isConnected;
  }

  // Public method to check if it's currently safe to reconnect
  canSafelyReconnect(): boolean {
    return this.isSafeToReconnect() && !this.isReconnecting;
  }

  // Public method to check connection health and optionally force reconnection
  async checkConnectionHealth(token?: string, autoReconnect: boolean = false): Promise<{isConnected: boolean, reconnected?: boolean}> {
    const isConnected = this.isConnected;
    
    if (autoReconnect && this.canSafelyReconnect()) {
      console.log('Triggering health-based reconnection');
      await this.forceReconnect(token);
      return {
        isConnected: this.isConnected,
        reconnected: true
      };
    }
    
    return {
      isConnected,
      reconnected: false
    };
  }

  private setupEventHandlers(): void {
    if (!this.connection) return;

    // Handle new messages
    this.connection.on('ReceiveMessage', (update: MessageUpdate) => {
      this.trackActivity();
      
      console.log('Received message update:', update);
      this.messageHandlers.forEach(handler => { 
        setTimeout(() => {
          handler(update);
        }, 100);
      });
    });

    // Handle tool execution updates
    this.connection.on('ToolExecutionUpdate', (update: ToolExecutionUpdate) => {
      this.trackActivity();
      
      console.log('Received tool execution update:', update);
      this.toolExecutionHandlers.forEach(handler => handler(update));
    });

    // Handle subagent activity updates (Task #7297)
    this.connection.on('SubagentActivityUpdate', (update: SubAgentActivityUpdate) => {
      this.trackActivity();

      console.log('Received subagent activity update:', update);
      this.subAgentActivityHandlers.forEach(handler => handler(update));
    });

    // Handle typing indicators
    this.connection.on('TypingIndicator', (update: TypingIndicatorUpdate) => {
      this.trackActivity();
      
      console.log('Received typing indicator:', update);
      this.typingIndicatorHandlers.forEach(handler => handler(update));
    });

    let queue: StreamingTokenUpdate[] = [];
    let isProcessing = false;

    // US 7501 (Stop): chunks already shown stay, chunks still queued are dropped. The running
    // processQueue loop reads `queue` again after each delay, so it stops on its own.
    this.discardQueuedTokens = (chatId?: string) => {
      queue = chatId ? queue.filter(tokenUpdate => tokenUpdate.chatId !== chatId) : [];
    };

    // Handle streaming tokens
    this.connection.on('StreamingTokens', (update: StreamingTokensUpdate) => {
      this.trackActivity();
      
      console.log('Received streaming tokens:', update);
      this.streamingTokenHandlers.forEach(handler => {
        if(update.tokens.length === 0) {
          // No tokens to process
          return;
        }

        update.tokens.forEach((token, tokenIndex) => {
          const isLastToken = tokenIndex === update.tokens.length - 1 && update.isComplete;
          
          // Split token into smaller chunks (by words)
          const words = token.split(' ');
          const chunkSize = 5; // Number of words per chunk
          
          // Create chunks from words
          const chunks: string[] = [];
          for (let i = 0; i < words.length; i += chunkSize) {
            const chunk = words.slice(i, i + chunkSize).join(' ') + (i + chunkSize < words.length ? ' ' : ''); // Add space if not last chunk
            chunks.push(chunk);
          }
          
          // If no chunks were created (empty token), add an empty chunk
          if (chunks.length >= 0) {
            // Push each chunk to the queue
            chunks.forEach((chunk, chunkIndex) => {
              const isLastChunk = chunkIndex === chunks.length - 1;
              const isComplete = isLastToken && isLastChunk;
              
              queue.push({
                chatId: update.chatId,
                messageId: update.messageId,
                type: update.type,
                token: chunk,
                isComplete: isComplete,
                channelMessageType: update.channelMessageType,
                agentId: update.agentId,
                agentName: update.agentName,
                chatbotIconUrl: update.chatbotIconUrl,
                timestamp: update.timestamp,
              });
            });
          }
        });

        processQueue();

        async function processQueue() {
          if (isProcessing) return;
          isProcessing = true;

          while (queue.length > 0) {
            const tokenUpdate = queue.shift();
            if(tokenUpdate) {
              handler(tokenUpdate);
            }
            console.log('Processed a token, remaining in queue:', tokenUpdate?.token, 'Queue length:', queue.length);
            await new Promise((res) => setTimeout(res, 50)); // 👈 guaranteed order
          }

          isProcessing = false;
        }

      });
    });

    

    // Handle streaming audio
    this.connection.on('StreamingAudio', (update: StreamingAudioUpdate) => {
      this.trackActivity();
      
      console.log('Received streaming audio:', update);
      this.streamingAudioHandlers.forEach(handler => handler(update));
    });

    // Handle conversation state updates
    this.connection.on('ConversationStateUpdate', (update: ConversationStateUpdate) => {
      this.trackActivity();

      console.log('Received conversation state update:', update);
      this.conversationStateHandlers.forEach(handler => handler(update));
    });

    // Handle contact form requests
    this.connection.on('ContactFormRequest', (update: ContactFormUpdate) => {
      this.trackActivity();

      console.log('Received contact form request:', update);
      this.contactFormHandlers.forEach(handler => handler(update));
    });

    // Handle contact form completion — signals the frontend to replay the original question
    this.connection.on('ContactFormCompleted', (update: ContactFormCompletedUpdate) => {
      this.trackActivity();

      console.log('Received contact form completed:', update);
      this.contactFormCompletedHandlers.forEach(handler => handler(update));
    });

    // US 7575: an agent is waiting for approval to call a tool function
    this.connection.on('ToolApprovalRequest', (update: ToolApprovalRequestUpdate) => {
      this.trackActivity();

      console.log('Received tool approval request:', update);
      this.toolApprovalRequestHandlers.forEach(handler => handler(update));
    });

    // US 7575: a pending approval was answered (possibly from another tab) or expired
    this.connection.on('ToolApprovalResolved', (update: ToolApprovalResolvedUpdate) => {
      this.trackActivity();

      console.log('Received tool approval resolved:', update);
      this.toolApprovalResolvedHandlers.forEach(handler => handler(update));
    });

    // US 7501: every agent of the session was cancelled by Stop
    this.connection.on('ConversationStopped', (update: ConversationStoppedUpdate) => {
      this.trackActivity();

      console.log('Received conversation stopped:', update);
      this.conversationStoppedHandlers.forEach(handler => handler(update));
    });

    // Handle connection state changes
    this.connection.onreconnecting(() => {
      console.log('SignalR reconnecting...');
      this.notifyConnectionStatus(false);
    });

    this.connection.onreconnected((connectionId) => {
      console.log('SignalR reconnected:', connectionId);
      this.reconnectAttempts = 0;
      this.isReconnecting = false;
      this.notifyConnectionStatus(true);
      if (!this.disableForcedReconnection) {
        this.startForcedReconnectionTimer();
      }
    });

    this.connection.onclose((error) => {
      console.log('SignalR connection closed:', error);
      this.clearForcedReconnectionTimer();
      this.isReconnecting = false;
      this.notifyConnectionStatus(false);
    });
  }

  async joinChat(chatId: string): Promise<void> {
    if (this.connection?.state === 'Connected') {
      try {
        await this.connection.invoke('JoinChat', chatId);
        console.log(`Joined chat: ${chatId}`);
      } catch (error) {
        console.error('Failed to join chat:', error);
      }
    }
  }

  async leaveChat(chatId: string): Promise<void> {
    if (this.connection?.state === 'Connected') {
      try {
        await this.connection.invoke('LeaveChat', chatId);
        console.log(`Left chat: ${chatId}`);
      } catch (error) {
        console.error('Failed to leave chat:', error);
      }
    }
  }

  async sendTypingIndicator(chatId: string, isTyping: boolean, userName: string): Promise<void> {
    if (this.connection?.state === 'Connected') {
      try {
        await this.connection.invoke('SendTypingIndicator', chatId, isTyping, userName);
      } catch (error) {
        console.error('Failed to send typing indicator:', error);
      }
    }
  }

  // Event subscription methods
  onMessageUpdate(handler: (update: MessageUpdate) => void): () => void {
    this.messageHandlers.push(handler);
    return () => {
      const index = this.messageHandlers.indexOf(handler);
      if (index > -1) {
        this.messageHandlers.splice(index, 1);
      }
    };
  }

  onToolExecutionUpdate(handler: (update: ToolExecutionUpdate) => void): () => void {
    this.toolExecutionHandlers.push(handler);
    return () => {
      const index = this.toolExecutionHandlers.indexOf(handler);
      if (index > -1) {
        this.toolExecutionHandlers.splice(index, 1);
      }
    };
  }

  onSubAgentActivityUpdate(handler: (update: SubAgentActivityUpdate) => void): () => void {
    this.subAgentActivityHandlers.push(handler);
    return () => {
      const index = this.subAgentActivityHandlers.indexOf(handler);
      if (index > -1) {
        this.subAgentActivityHandlers.splice(index, 1);
      }
    };
  }

  onTypingIndicator(handler: (update: TypingIndicatorUpdate) => void): () => void {
    this.typingIndicatorHandlers.push(handler);
    return () => {
      const index = this.typingIndicatorHandlers.indexOf(handler);
      if (index > -1) {
        this.typingIndicatorHandlers.splice(index, 1);
      }
    };
  }

  onStreamingToken(handler: (update: StreamingTokenUpdate) => void): () => void {
    this.streamingTokenHandlers.push(handler);
    return () => {
      const index = this.streamingTokenHandlers.indexOf(handler);
      if (index > -1) {
        this.streamingTokenHandlers.splice(index, 1);
      }
    };
  }

  onStreamingAudio(handler: (update: StreamingAudioUpdate) => void): () => void {
    this.streamingAudioHandlers.push(handler);
    return () => {
      const index = this.streamingAudioHandlers.indexOf(handler);
      if (index > -1) {
        this.streamingAudioHandlers.splice(index, 1);
      }
    };
  }

  onConversationStateUpdate(handler: (update: ConversationStateUpdate) => void): () => void {
    this.conversationStateHandlers.push(handler);
    return () => {
      const index = this.conversationStateHandlers.indexOf(handler);
      if (index > -1) {
        this.conversationStateHandlers.splice(index, 1);
      }
    };
  }

  onContactFormRequest(handler: (update: ContactFormUpdate) => void): () => void {
    this.contactFormHandlers.push(handler);
    return () => {
      const index = this.contactFormHandlers.indexOf(handler);
      if (index > -1) {
        this.contactFormHandlers.splice(index, 1);
      }
    };
  }

  onContactFormCompleted(handler: (update: ContactFormCompletedUpdate) => void): () => void {
    this.contactFormCompletedHandlers.push(handler);
    return () => {
      const index = this.contactFormCompletedHandlers.indexOf(handler);
      if (index > -1) {
        this.contactFormCompletedHandlers.splice(index, 1);
      }
    };
  }

  onToolApprovalRequest(handler: (update: ToolApprovalRequestUpdate) => void): () => void {
    this.toolApprovalRequestHandlers.push(handler);
    return () => {
      const index = this.toolApprovalRequestHandlers.indexOf(handler);
      if (index > -1) {
        this.toolApprovalRequestHandlers.splice(index, 1);
      }
    };
  }

  onToolApprovalResolved(handler: (update: ToolApprovalResolvedUpdate) => void): () => void {
    this.toolApprovalResolvedHandlers.push(handler);
    return () => {
      const index = this.toolApprovalResolvedHandlers.indexOf(handler);
      if (index > -1) {
        this.toolApprovalResolvedHandlers.splice(index, 1);
      }
    };
  }

  onConversationStopped(handler: (update: ConversationStoppedUpdate) => void): () => void {
    this.conversationStoppedHandlers.push(handler);
    return () => {
      const index = this.conversationStoppedHandlers.indexOf(handler);
      if (index > -1) {
        this.conversationStoppedHandlers.splice(index, 1);
      }
    };
  }

  // US 7501 (Stop): drops the streaming chunks of `chatId` (all chats when omitted) that were
  // received but not shown yet. The connection itself is left alone.
  clearQueuedStreamingTokens(chatId?: string): void {
    this.discardQueuedTokens(chatId);
  }

  onConnectionStatusChange(handler: (isConnected: boolean) => void): () => void {
    this.connectionStatusHandlers.push(handler);
    // Immediately call with current status
    handler(this.isConnected);
    
    return () => {
      const index = this.connectionStatusHandlers.indexOf(handler);
      if (index > -1) {
        this.connectionStatusHandlers.splice(index, 1);
      }
    };
  }

  private notifyConnectionStatus(isConnected: boolean): void {
    this.connectionStatusHandlers.forEach(handler => handler(isConnected));
  }

  get isConnected(): boolean {
    return this.connection?.state === 'Connected';
  }

  // US 7550: see ConnectionPhase.
  getConnectionPhase(): ConnectionPhase {
    if (this.isConnected) return 'connected';

    const isTrying = this.isConnecting
      || this.isRetryScheduled
      || this.connection?.state === 'Connecting'
      || this.connection?.state === 'Reconnecting';
    if (isTrying) return this.hasConnectedOnce ? 'reconnecting' : 'connecting';

    return 'disconnected';
  }

  async disconnect(): Promise<void> {
    this.clearForcedReconnectionTimer();

    // US 7550: cancel a scheduled retry of a failed connect(), so nothing reconnects afterwards.
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.isRetryScheduled = false;
    this.isConnecting = false;
    this.reconnectAttempts = 0;

    // Stop the connection whatever its state: stop() also cancels an automatic reconnect that is
    // under way ('Reconnecting'), and a connect() still starting sees it was replaced and stops.
    const connection = this.connection;
    this.connection = null;
    if (connection) {
      try {
        await connection.stop();
        console.log('SignalR disconnected');
      } catch (error) {
        console.error('Error disconnecting SignalR:', error);
      }
    }
  }

  // Utility method to get connection state
  getConnectionState(): string {
    return this.connection?.state || 'Disconnected';
  }
}
