import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";
import type { SignalRHub } from "../../support/signalr-hub";

/** The "Test Agent" tab of the agent view: the main app's admin chat with the agent. */
export class TestAgentChatPage {
  readonly input: Locator;
  readonly sendButton: Locator;
  readonly stopButton: Locator;
  readonly attachInput: Locator;
  readonly moreOptionsButton: Locator;
  readonly connectionIndicator: Locator;

  constructor(
    readonly page: Page,
    private readonly hub: SignalRHub,
  ) {
    this.input = page.getByRole("textbox", { name: "Message" });
    this.sendButton = page.getByRole("button", { name: "Send message" });
    this.stopButton = page.getByRole("button", { name: "Stop all agents" });
    this.attachInput = page.getByLabel("Attach files");
    this.moreOptionsButton = page.getByRole("button", { name: "More options" });
    this.connectionIndicator = page.getByTitle(/^Real-time connection:/);
  }

  /** Opens the agent's Test Agent tab and waits until the chat is connected (its input is enabled). */
  async open(agentId = 1): Promise<void> {
    await this.page.goto(`/agents/view/${agentId}`);
    await this.page.getByRole("tab", { name: "Test Agent" }).click();
    await expect(this.input).toBeEnabled();
    await expect.poll(() => this.hub.joinedSessions.length).toBeGreaterThan(0);
  }

  /** The id of the chat session the page joined. */
  get sessionId(): string {
    return this.hub.joinedSessions[0];
  }

  async send(text: string): Promise<void> {
    await this.input.fill(text);
    await this.input.press("Enter");
  }

  /** A chat bubble by its text. */
  message(text: string | RegExp): Locator {
    return this.page.getByText(text);
  }

  /** The red (error) or amber (warning) failure bubble of a failed turn. */
  get errorBubble(): Locator {
    return this.page.getByTestId("agent-chat-error");
  }

  get stoppedDivider(): Locator {
    return this.page.getByTestId("stopped-divider");
  }

  get approvalCard(): Locator {
    return this.page.getByRole("group", { name: /^Permission request:/ });
  }

  /** The chat's attachment preview chips, one remove button per file. */
  removeFileButton(fileName: string): Locator {
    return this.page.getByRole("button", { name: `Remove ${fileName}` });
  }
}
