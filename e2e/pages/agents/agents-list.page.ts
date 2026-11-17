import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { ConfirmDialog } from "../components/confirm-dialog";

/** The Agents list page (`/agents`) and its agent cards. */
export class AgentsListPage {
  readonly heading: Locator;
  readonly createButton: Locator;
  readonly searchBox: Locator;
  readonly listViewButton: Locator;
  readonly gridViewButton: Locator;
  readonly emptyStateHeading: Locator;
  /** The "Are you sure?" dialog behind a card's trash button. */
  readonly deleteDialog: ConfirmDialog;

  constructor(readonly page: Page) {
    this.heading = page.getByRole("heading", { level: 1, name: "Agents" });
    this.createButton = page.getByRole("button", { name: "Create Agent" }).first();
    this.searchBox = page.getByPlaceholder("Search agents...");
    this.listViewButton = page.getByRole("button", { name: "List view" });
    this.gridViewButton = page.getByRole("button", { name: "Grid view" });
    this.emptyStateHeading = page.getByRole("heading", { name: "No agents found" });
    this.deleteDialog = new ConfirmDialog(page, "Are you sure?");
  }

  async goto(): Promise<void> {
    await this.page.goto("/agents");
    await expect(this.heading).toBeVisible();
  }

  /** A card is identified by its agent name (the card's `<h3>`). */
  cardTitle(name: string): Locator {
    return this.page.getByRole("heading", { level: 3, name, exact: true });
  }

  /** The grid container that holds the cards; its classes tell grid from list layout. */
  cardsContainer(): Locator {
    return this.page.locator("div.grid").filter({ has: this.page.getByRole("heading", { level: 3 }) }).last();
  }

  activeSwitch(name: string): Locator {
    return this.page.getByRole("switch", { name: `Toggle ${name} active` });
  }

  editButton(name: string): Locator {
    return this.page.getByRole("button", { name: `Edit ${name}`, exact: true });
  }

  deleteButton(name: string): Locator {
    return this.page.getByRole("button", { name: `Delete ${name}`, exact: true });
  }

  /** The hidden file input behind the card's avatar. */
  imageInput(name: string): Locator {
    return this.page.getByLabel(`Upload image for ${name}`);
  }

  async expectPath(path: string): Promise<void> {
    await expect(this.page).toHaveURL((url) => url.pathname === path);
  }
}
