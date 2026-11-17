import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { ConfirmDialog } from "../components/confirm-dialog";

/** Browse Marketplace (`/marketplace/browse`). */
export class BrowseMarketplacePage {
  readonly heading: Locator;
  readonly searchBox: Locator;
  readonly emptyState: Locator;
  readonly deleteDialog: ConfirmDialog;
  readonly warningDialog: ConfirmDialog;

  constructor(readonly page: Page) {
    this.heading = page.getByRole("heading", { level: 1, name: "Browse Marketplace" });
    this.searchBox = page.getByPlaceholder("Search marketplace items...");
    this.emptyState = page.getByRole("heading", { name: "No items found" });
    this.deleteDialog = new ConfirmDialog(page, "Are you sure?");
    this.warningDialog = new ConfirmDialog(page, "Installation Warning");
  }

  async goto(): Promise<void> {
    await this.page.goto("/marketplace/browse");
    await expect(this.heading).toBeVisible();
  }

  category(name: "All" | "AI Agents" | "Tools"): Locator {
    return this.page.getByRole("button", { name, exact: true });
  }

  /** A card is a plain `div` (no role); it is found by the exact item name it contains. */
  card(name: string): Locator {
    return this.page.locator("div.rounded-lg.border").filter({ has: this.page.getByText(name, { exact: true }) });
  }

  cardNames(): Locator {
    return this.page.locator("div.rounded-lg.border .text-lg");
  }

  star(name: string, rating: number): Locator {
    return this.page.getByLabel(`Rate ${name} ${rating} out of 5 stars`, { exact: true });
  }

  /** The filled stars of a card: only they carry `fill-yellow-400`. */
  filledStars(name: string): Locator {
    return this.card(name).locator("svg.fill-yellow-400");
  }

  installButton(name: string): Locator {
    return this.card(name).getByRole("button", { name: /^(Install|Re-install|Installing\.\.\.)$/ });
  }

  /** The download count: the only text in a card that is just digits. */
  downloads(name: string): Locator {
    return this.card(name).getByText(/^\d+$/);
  }

  deleteButton(name: string): Locator {
    return this.page.getByRole("button", { name: `Delete ${name}`, exact: true });
  }
}
