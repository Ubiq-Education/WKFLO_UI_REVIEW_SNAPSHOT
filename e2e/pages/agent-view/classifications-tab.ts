import type { Locator, Page } from "@playwright/test";

/** The Classifications tab: date-range buttons and the topic list. */
export class ClassificationsTab {
  readonly emptyMessage: Locator;
  readonly errorMessage: Locator;
  readonly total: Locator;

  constructor(private readonly page: Page) {
    this.emptyMessage = page.getByText("No classifications in this period.");
    this.errorMessage = page.getByText("Failed to load classification data.");
    this.total = page.getByText(/^Total classified messages:/);
  }

  range(label: string): Locator {
    return this.page.getByRole("button", { name: label, exact: true });
  }

  async selectRange(label: string): Promise<void> {
    await this.range(label).click();
  }
}
