import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

/** The Audit Log page (`/audit`): filters, the entries table, the pager and the changes dialog. */
export class AuditPage {
  readonly heading: Locator;
  readonly entityCombobox: Locator;
  readonly actorInput: Locator;
  readonly dateFrom: Locator;
  readonly dateTo: Locator;
  readonly clearFilters: Locator;
  readonly bodyRows: Locator;
  readonly next: Locator;
  readonly previous: Locator;
  readonly pageIndicator: Locator;
  readonly emptyHeading: Locator;
  readonly errorAlert: Locator;
  readonly retryButton: Locator;
  readonly changesDialog: Locator;

  constructor(readonly page: Page) {
    this.heading = page.getByRole("heading", { level: 1, name: "Audit Log" });
    // The header has its own tenant combobox, which comes first in the DOM; the entity type filter is the second.
    this.entityCombobox = page.getByRole("combobox").nth(1);
    this.actorInput = page.getByPlaceholder("Filter by actor (name or email)...");
    this.dateFrom = page.getByLabel("From date");
    this.dateTo = page.getByLabel("To date");
    this.clearFilters = page.getByRole("button", { name: "Clear filters" });
    this.bodyRows = page.locator("tbody tr");
    this.next = page.getByRole("link", { name: /next/i });
    this.previous = page.getByRole("link", { name: /previous/i });
    this.pageIndicator = page.getByText(/^Page \d+ of \d+$/);
    this.emptyHeading = page.getByRole("heading", { name: "No audit log entries found" });
    this.errorAlert = page.getByRole("alert");
    this.retryButton = page.getByRole("button", { name: "Retry" });
    this.changesDialog = page.getByRole("dialog", { name: "Changes" });
  }

  async goto(): Promise<void> {
    await this.page.goto("/audit");
    await expect(this.heading).toBeVisible();
  }

  /**
   * Opens the page and lets its 400 ms actor debounce (which also resets the page to 1 when it fires, even when the
   * actor did not change) run out first, so a quick click on Next is not overwritten by it.
   */
  async gotoSettled(): Promise<void> {
    await this.page.clock.install({ time: new Date("2026-03-01T10:00:00Z") });
    await this.goto();
    await expect(this.bodyRows.first()).toBeVisible();
    await this.page.clock.runFor(500);
  }

  actionButton(name: "All actions" | "Create" | "Update" | "Delete"): Locator {
    return this.page.getByRole("button", { name, exact: true });
  }

  /** The table row with this entity type and entity id cells. */
  row(entityType: string, entityId: string): Locator {
    return this.page
      .getByRole("row")
      .filter({ has: this.page.getByRole("cell", { name: entityType, exact: true }) })
      .filter({ has: this.page.getByRole("cell", { name: entityId, exact: true }) });
  }

  viewChanges(entityType: string, entityId: string): Locator {
    return this.page.getByRole("button", { name: `View changes for ${entityType} ${entityId}` });
  }

  async chooseEntityType(label: string): Promise<void> {
    await this.entityCombobox.click();
    await this.page.getByRole("option", { name: label, exact: true }).click();
  }

  /** The query string of a recorded request URL. */
  static query(url: string): URLSearchParams {
    return new URL(url, "http://e2e.local").searchParams;
  }
}
