import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";
import type { SignalRHub } from "../../support/signalr-hub";

/** The public chat in the preview card of the Chat UI share page (`/agents/:id/share/chat-ui`). */
export class ShareChatPage {
  readonly input: Locator;
  readonly sendButton: Locator;
  readonly resetButton: Locator;
  readonly loadHistoryButton: Locator;
  readonly copyButtons: Locator;
  readonly thumbsUpButtons: Locator;
  readonly thumbsDownButtons: Locator;
  readonly promptChips: Locator;
  readonly connectionLabel: Locator;
  readonly reconnectIcon: Locator;

  constructor(
    readonly page: Page,
    private readonly hub: SignalRHub,
    agentName = "E2E Support Agent",
  ) {
    this.input = page.getByRole("textbox", { name: `Ask ${agentName}` });
    this.sendButton = page.getByRole("button", { name: "Send message" });
    this.resetButton = page.getByRole("button", { name: "Reset Session" });
    this.loadHistoryButton = page.getByRole("button", {
      name: "Load Message History",
    });
    this.copyButtons = page.getByRole("button", { name: "Copy message" });
    this.thumbsUpButtons = page.getByRole("button", { name: "Thumbs up" });
    this.thumbsDownButtons = page.getByRole("button", { name: "Thumbs down" });
    // The quick-reply chips under the welcome message (rounded-full outlined buttons).
    this.promptChips = page.locator("button.rounded-full.border.text-xs");
    this.connectionLabel = page.getByTitle(/^Connected via /);
    this.reconnectIcon = page.getByTitle("Click to reconnect");
  }

  /** Opens the share page and waits until the preview chat is connected (its input is enabled). */
  async open(agentId = 1): Promise<void> {
    await this.page.goto(`/agents/${agentId}/share/chat-ui`);
    await expect(this.input).toBeEnabled();
    await expect.poll(() => this.hub.joinedSessions.length).toBeGreaterThan(0);
  }

  /** The id of the chat session the page joined most recently. */
  get sessionId(): string {
    return this.hub.joinedSessions[this.hub.joinedSessions.length - 1];
  }

  async send(text: string): Promise<void> {
    await this.input.fill(text);
    await this.input.press("Enter");
  }

  /** A chat bubble by its text. Scoped to bubbles because the settings panel beside the chat repeats some texts in its fields. */
  message(text: string | RegExp): Locator {
    return this.page.locator(".bubble-content").filter({ hasText: text });
  }

  /** A quick-reply chip under the welcome message. */
  promptChip(title: string): Locator {
    return this.page.getByRole("button", { name: title, exact: true });
  }
}
