import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { ConfirmDialog } from "../components/confirm-dialog";

/** The Tags list page (`/tags`). */
export class TagsListPage {
  readonly heading: Locator;
  readonly createButton: Locator;
  readonly searchBox: Locator;
  readonly listViewButton: Locator;
  readonly gridViewButton: Locator;
  readonly emptyStateHeading: Locator;
  readonly deleteDialog: ConfirmDialog;

  constructor(readonly page: Page) {
    this.heading = page.getByRole("heading", { level: 1, name: "Tags" });
    this.createButton = page.getByRole("button", { name: "Create Tag" }).first();
    this.searchBox = page.getByPlaceholder("Search tags...");
    this.listViewButton = page.getByRole("button", { name: "List view" });
    this.gridViewButton = page.getByRole("button", { name: "Grid view" });
    this.emptyStateHeading = page.getByRole("heading", { name: "No tags found" });
    this.deleteDialog = new ConfirmDialog(page, "Are you sure?");
  }

  async goto(): Promise<void> {
    await this.page.goto("/tags");
    await expect(this.heading).toBeVisible();
  }

  cardTitle(name: string): Locator {
    return this.page.getByRole("heading", { level: 3, name, exact: true });
  }

  /** The card: the clickable block (`cursor-pointer`) that holds the tag's heading. It has no role or name. */
  card(name: string): Locator {
    return this.page.locator("div.cursor-pointer").filter({ has: this.cardTitle(name) });
  }

  cardsContainer(): Locator {
    return this.page.locator("div.grid").filter({ has: this.page.getByRole("heading", { level: 3 }) }).last();
  }

  editButton(name: string): Locator {
    return this.card(name).getByRole("button", { name: "Edit Tag" });
  }

  deleteButton(name: string): Locator {
    return this.card(name).getByRole("button", { name: "Delete Tag" });
  }

  async expectPath(path: string): Promise<void> {
    await expect(this.page).toHaveURL((url) => url.pathname === path);
  }
}
