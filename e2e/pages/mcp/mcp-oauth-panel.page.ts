import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

/** The "Connection" card of an OAuth2 MCP tool. The card has no landmark, so locators are page-wide (one panel per page). */
export class McpOAuthPanel {
  readonly connectButton: Locator;
  readonly reconnectButton: Locator;
  readonly disconnectButton: Locator;
  readonly resetNotice: Locator;
  readonly saveFirstHint: Locator;

  constructor(private readonly page: Page) {
    this.connectButton = page.getByRole("button", { name: "Connect", exact: true });
    this.reconnectButton = page.getByRole("button", { name: "Reconnect", exact: true });
    this.disconnectButton = page.getByRole("button", { name: "Disconnect", exact: true });
    this.resetNotice = page.getByTestId("mcp-oauth-connections-reset");
    this.saveFirstHint = page.getByText("Save the tool before connecting so the new endpoint, client credentials and scopes are used.");
  }

  get title(): Locator {
    return this.page.getByText("Connection", { exact: true });
  }

  badge(text: string): Locator {
    return this.page.getByText(text, { exact: true });
  }

  async expectStatus(text: "Not connected" | "Connected" | "Connected — issue" | "Status unavailable"): Promise<void> {
    await expect(this.badge(text)).toBeVisible();
  }
}
