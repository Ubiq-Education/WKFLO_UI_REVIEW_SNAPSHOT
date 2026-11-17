import type { Page, WebSocketRoute } from "@playwright/test";

/** SignalR's JSON protocol ends every frame with this record separator. */
const RS = "\x1e";

/** Event names and payload shapes mirror shared/services/signalr-service.ts. */
export interface StreamReplyOptions {
  messageId?: string;
  agentName?: string;
  agentId?: number;
}

export interface ToolApprovalOptions {
  approvalId?: string;
  toolName?: string;
  functionName?: string;
  functionDescription?: string;
  argumentsJson?: string;
  expiresAtUtc?: string;
}

export interface ContactFormOptions {
  message?: string;
  mandatory?: boolean;
  firstNameRequired?: boolean;
  lastNameRequired?: boolean;
  emailRequired?: boolean;
  submitButtonText?: string;
  successMessageEnabled?: boolean;
  successMessageText?: string;
}

/**
 * A fake SignalR chat hub. It answers the JSON-protocol handshake, completes every invocation
 * (JoinChat, LeaveChat, ...), echoes pings and lets a test push server events with `emit()`.
 * The HTTP negotiate call is answered by MockApi. Nothing here talks to a real server.
 *
 * Sync point for tests: the chat textarea is enabled once the hub is connected.
 */
export class SignalRHub {
  /** Session ids the chat joined, in order. */
  readonly joinedSessions: string[] = [];
  /** Every invocation the client made (JoinChat, LeaveChat, SendTypingIndicator, ...). */
  readonly invocations: Array<{ target: string; args: unknown[] }> = [];
  private readonly sockets = new Set<WebSocketRoute>();
  private readonly pingTimers = new Set<ReturnType<typeof setInterval>>();
  private messageCounter = 0;

  async install(page: Page): Promise<void> {
    await page.routeWebSocket(/\/ai\/api\/v1\/chathub/, (ws) => this.accept(ws));
  }

  /** Stops the keep-alive timers. Called by the test fixture at teardown. */
  dispose(): void {
    this.pingTimers.forEach((timer) => clearInterval(timer));
    this.pingTimers.clear();
    this.sockets.clear();
  }

  get connectionCount(): number {
    return this.sockets.size;
  }

  private accept(ws: WebSocketRoute): void {
    this.sockets.add(ws);
    // The client drops the connection when the server stays silent for 30 seconds.
    const timer = setInterval(() => ws.send(`{"type":6}${RS}`), 10_000);
    this.pingTimers.add(timer);
    ws.onClose(() => {
      clearInterval(timer);
      this.pingTimers.delete(timer);
      this.sockets.delete(ws);
    });
    ws.onMessage((message) => {
      const text = typeof message === "string" ? message : message.toString("utf8");
      for (const frame of text.split(RS).filter(Boolean)) {
        this.handleFrame(ws, JSON.parse(frame) as Record<string, unknown>);
      }
    });
  }

  private handleFrame(ws: WebSocketRoute, frame: Record<string, unknown>): void {
    if (typeof frame.protocol === "string") {
      ws.send(`{}${RS}`);
    } else if (frame.type === 6) {
      ws.send(`{"type":6}${RS}`);
    } else if (frame.type === 1 && typeof frame.target === "string") {
      const args = (frame.arguments as unknown[]) ?? [];
      this.invocations.push({ target: frame.target, args });
      if (frame.target === "JoinChat" && typeof args[0] === "string") {
        this.joinedSessions.push(args[0]);
      }
      // Without a completion the client's invoke() never resolves (the HTTP send waits for JoinChat).
      if (typeof frame.invocationId === "string") {
        ws.send(`${JSON.stringify({ type: 3, invocationId: frame.invocationId, result: null })}${RS}`);
      }
    }
  }

  /** Pushes one server-to-client event to every open connection. */
  emit(target: string, payload: unknown): void {
    // Fail loudly: an event sent before the chat connects would otherwise vanish and the test
    // would time out later with an unrelated message. Wait for the chat input to be enabled first.
    if (this.sockets.size === 0) {
      throw new Error(`SignalRHub.emit("${target}") called with no open connection; wait for the chat to connect first`);
    }
    const frame = `${JSON.stringify({ type: 1, target, arguments: [payload] })}${RS}`;
    this.sockets.forEach((ws) => ws.send(frame));
  }

  typing(chatId: string, isTyping: boolean): void {
    this.emit("TypingIndicator", { chatId, isTyping });
  }

  idle(chatId: string): void {
    this.emit("ConversationStateUpdate", { chatId, state: "idle" });
  }

  /** The full sequence the backend sends for a streamed answer. */
  streamReply(chatId: string, chunks: string[], options: StreamReplyOptions = {}): void {
    const { messageId = `e2e-msg-${++this.messageCounter}`, agentName = "E2E Support Agent", agentId } = options;
    const tokens = (list: string[], isComplete: boolean) =>
      this.emit("StreamingTokens", {
        chatId,
        messageId,
        type: "assistant",
        tokens: list,
        isComplete,
        channelMessageType: 1,
        agentName,
        agentId,
      });
    this.typing(chatId, true);
    const partial = chunks.slice(0, -1);
    if (partial.length > 0) tokens(partial, false);
    // The client ignores an empty token list, so an empty reply still sends one "" to complete.
    tokens(chunks.length > 0 ? chunks.slice(-1) : [""], true);
    this.typing(chatId, false);
    this.idle(chatId);
  }

  /** A failed turn, as the live Metadata-channel marker message the chat turns into friendly text. */
  runtimeError(chatId: string, code: string, options: { severity?: "error" | "warning"; isTerminal?: boolean } = {}): void {
    const { severity = "error", isTerminal = true } = options;
    this.emit("ReceiveMessage", {
      chatId,
      message: {
        id: `e2e-error-${code}`,
        type: "assistant",
        content: "",
        channelMessageType: 3,
        metadata: { isError: true, errorCode: code, severity, isTerminal, turnId: "e2e-turn" },
      },
    });
    if (severity === "error" && isTerminal) {
      this.typing(chatId, false);
      this.idle(chatId);
    }
  }

  toolApproval(chatId: string, options: ToolApprovalOptions = {}): void {
    this.emit("ToolApprovalRequest", {
      chatId,
      sessionId: chatId,
      approvalId: "e2e-approval-1",
      toolName: "E2E Lookup Tool",
      functionName: "lookup_record",
      functionDescription: "Looks up a record.",
      argumentsJson: "{}",
      expiresAtUtc: new Date(Date.now() + 10 * 60_000).toISOString(),
      ...options,
    });
  }

  contactForm(chatId: string, options: ContactFormOptions = {}): void {
    this.emit("ContactFormRequest", {
      chatId,
      message: "Leave your details and we will get back to you.",
      mandatory: false,
      firstNameRequired: true,
      lastNameRequired: false,
      emailRequired: true,
      submitButtonText: "Send",
      successMessageEnabled: true,
      successMessageText: "Thanks, we will be in touch.",
      ...options,
    });
  }

  stopped(chatId: string): void {
    this.emit("ConversationStopped", { chatId, stoppedAt: new Date().toISOString() });
  }

  /**
   * Closes every connection from the server side, so the client starts reconnecting.
   * Not covered by a self-test yet. The SignalR client logs the 1011 close as an error, so callers
   * need `test.use({ allowedConsoleErrors: [/WebSocket closed with status code: 1011/] })`.
   */
  drop(): void {
    this.sockets.forEach((ws) => void ws.close({ code: 1011, reason: "e2e drop" }));
  }
}
