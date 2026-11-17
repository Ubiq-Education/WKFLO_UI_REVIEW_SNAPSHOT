import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { ConfirmDialog } from "../components/confirm-dialog";

/** The Tools list page (`/tools`) and its tool cards. */
export class ToolsListPage {
  readonly heading: Locator;
  readonly createButton: Locator;
  readonly searchBox: Locator;
  readonly listViewButton: Locator;
  readonly gridViewButton: Locator;
  readonly emptyStateHeading: Locator;

  constructor(readonly page: Page) {
    this.heading = page.getByRole("heading", { level: 1, name: "Tools" });
    this.createButton = page.getByRole("button", { name: "Create Tool" }).first();
    this.searchBox = page.getByPlaceholder("Search tools...");
    this.listViewButton = page.getByRole("button", { name: "List view" });
    this.gridViewButton = page.getByRole("button", { name: "Grid view" });
    this.emptyStateHeading = page.getByRole("heading", { name: "No tools found" });
  }

  async goto(): Promise<void> {
    await this.page.goto("/tools");
    await expect(this.heading).toBeVisible();
  }

  cardTitle(name: string): Locator {
    return this.page.getByRole("heading", { level: 3, name, exact: true });
  }

  /**
   * The card for a tool. The card has no role or name, so this takes the innermost block that holds
   * the tool's heading and its Edit button (the card itself in grid view, its row in list view).
   */
  card(name: string): Locator {
    return this.page
      .locator("div")
      .filter({ has: this.cardTitle(name) })
      .filter({ has: this.page.getByRole("button", { name: "Edit Tool" }) })
      .last();
  }

  /** The grid container that holds the cards; its classes tell grid from list layout. */
  cardsContainer(): Locator {
    return this.page.locator("div.grid").filter({ has: this.page.getByRole("heading", { level: 3 }) }).last();
  }

  activeSwitch(name: string): Locator {
    return this.page.getByRole("switch", { name: `Toggle ${name} active` });
  }

  editButton(name: string): Locator {
    return this.card(name).getByRole("button", { name: "Edit Tool" });
  }

  deleteButton(name: string): Locator {
    return this.card(name).getByRole("button", { name: "Delete Tool" });
  }

  publishButton(name: string): Locator {
    return this.card(name).getByRole("button", { name: "Publish Tool" });
  }

  shareButton(name: string): Locator {
    return this.card(name).getByRole("button", { name: "Share Tool to Marketplace" });
  }

  publishDialog(): ConfirmDialog {
    return new ConfirmDialog(this.page, "Publish Tool");
  }

  shareDialog(): ConfirmDialog {
    return new ConfirmDialog(this.page, "Share Tool to Marketplace");
  }

  deleteDialog(): ConfirmDialog {
    return new ConfirmDialog(this.page, "Are you sure?");
  }

  async expectPath(path: string): Promise<void> {
    await expect(this.page).toHaveURL((url) => url.pathname === path);
  }
}
