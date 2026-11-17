import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

/** The "Knowledge Search" tab of the Knowledge page. */
export class KnowledgeSearchPage {
  readonly queryBox: Locator;
  readonly tagInput: Locator;
  readonly searchButton: Locator;
  readonly resultsHeading: Locator;

  constructor(readonly page: Page) {
    this.queryBox = page.getByLabel("Query");
    this.tagInput = page.getByPlaceholder("Add a tag and press Enter");
    this.searchButton = page.getByRole("button", { name: /^(Search|Searching\.\.\.)$/ });
    this.resultsHeading = page.getByText("Search Results", { exact: true });
  }

  async open(): Promise<void> {
    await this.page.getByRole("tab", { name: "Knowledge Search" }).click();
    await expect(this.queryBox).toBeVisible();
  }

  async addTag(tag: string): Promise<void> {
    await this.tagInput.fill(tag);
    await this.tagInput.press("Enter");
  }

  tagRemoveButton(tag: string): Locator {
    return this.page.getByRole("button", { name: `Remove search tag ${tag}` });
  }

  /** Submits the form and waits for the query request to be answered. */
  async search(query: string): Promise<void> {
    await this.queryBox.fill(query);
    const response = this.page.waitForResponse((r) => r.url().endsWith("/md/api/v1/tenant/knowledge/query"));
    await this.searchButton.click();
    await response;
  }
}
