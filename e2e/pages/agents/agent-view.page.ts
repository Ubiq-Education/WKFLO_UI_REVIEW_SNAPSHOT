import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { ConfirmDialog } from "../components/confirm-dialog";

/** The agent view page (`/agents/view/:id`): header actions, status cards and tab list. */
export class AgentViewPage {
  readonly backButton: Locator;
  readonly deleteButton: Locator;
  readonly shareToMarketplaceButton: Locator;
  readonly publishButton: Locator;
  readonly editButton: Locator;
  readonly statusSwitch: Locator;
  readonly tabList: Locator;

  constructor(readonly page: Page) {
    this.backButton = page.getByRole("button", { name: "Back" });
    this.deleteButton = page.getByRole("button", { name: "Delete" });
    this.shareToMarketplaceButton = page.getByRole("button", { name: "Share to Marketplace" });
    this.publishButton = page.getByRole("button", { name: "Publish", exact: true });
    this.editButton = page.getByRole("button", { name: "Edit" });
    this.statusSwitch = page.getByRole("switch", { name: "Agent status" });
    this.tabList = page.getByRole("tablist");
  }

  async goto(agentId: number | string): Promise<void> {
    await this.page.goto(`/agents/view/${agentId}`);
  }

  heading(name: string): Locator {
    return this.page.getByRole("heading", { level: 1, name });
  }

  tab(name: string): Locator {
    return this.tabList.getByRole("tab", { name });
  }

  dialog(name: string | RegExp): ConfirmDialog {
    return new ConfirmDialog(this.page, name);
  }

  /**
   * The Short Term / Long Term Memory status card. Both cards have a button named "Wipe", so the
   * button is scoped to the card with the matching title.
   */
  memoryCard(title: "Short Term Memory" | "Long Term Memory"): Locator {
    return this.page.locator("div.rounded-lg").filter({ hasText: title }).last();
  }

  wipeButton(title: "Short Term Memory" | "Long Term Memory"): Locator {
    return this.memoryCard(title).getByRole("button", { name: "Wipe" });
  }

  async expectPath(path: string): Promise<void> {
    await expect(this.page).toHaveURL((url) => url.pathname === path);
  }
}
