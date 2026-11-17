import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * The "Tags" card on an entity's page (client/src/components/tags/entity-tags-panel.tsx). The card
 * has no landmark or accessible name of its own, so every locator is page-wide and keyed on the
 * panel's own labels ("Add a tag…", "Remove tag {name}"). Use it on pages that show one panel.
 */
export class TagsPanel {
  readonly picker: Locator;
  readonly addButton: Locator;
  readonly emptyMessage: Locator;

  constructor(private readonly page: Page) {
    this.picker = page.getByRole("combobox").filter({ hasText: "Add a tag…" });
    this.addButton = page.getByRole("button", { name: "Add", exact: true });
    this.emptyMessage = page.getByText("No tags assigned yet.");
  }

  assignedTag(name: string): Locator {
    return this.page.getByRole("button", { name: `Remove tag ${name}` });
  }

  async assign(tagName: string): Promise<void> {
    await this.picker.click();
    await this.page.getByRole("option", { name: tagName }).click();
    await this.addButton.click();
  }

  async remove(tagName: string): Promise<void> {
    await this.assignedTag(tagName).click();
  }

  async expectAssigned(tagName: string): Promise<void> {
    await expect(this.assignedTag(tagName)).toBeVisible();
  }

  async expectNotAssigned(tagName: string): Promise<void> {
    await expect(this.assignedTag(tagName)).toHaveCount(0);
  }

  async expectNoTags(): Promise<void> {
    await expect(this.emptyMessage).toBeVisible();
  }
}
