import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

/** The create (`/tags/create`) and edit (`/tags/:id/edit`) pages. */
export class TagFormPage {
  readonly nameInput: Locator;
  readonly colorInput: Locator;
  readonly clearColorButton: Locator;
  readonly cancelButton: Locator;
  readonly backButton: Locator;

  constructor(readonly page: Page) {
    this.nameInput = page.getByLabel("Tag Name");
    this.colorInput = page.getByPlaceholder("#6366f1");
    this.clearColorButton = page.getByRole("button", { name: "Clear" });
    this.cancelButton = page.getByRole("button", { name: "Cancel" });
    this.backButton = page.getByRole("button", { name: "Back" });
  }

  get createButton(): Locator {
    return this.page.getByRole("button", { name: "Create Tag" });
  }

  get saveButton(): Locator {
    return this.page.getByRole("button", { name: "Save Tag" });
  }

  async gotoCreate(): Promise<void> {
    await this.page.goto("/tags/create");
    await expect(this.page.getByRole("heading", { level: 1, name: "Create New Tag" })).toBeVisible();
  }

  async gotoEdit(id: number): Promise<void> {
    await this.page.goto(`/tags/${id}/edit`);
    await expect(this.page.getByRole("heading", { level: 1, name: "Edit Tag" })).toBeVisible();
  }

  async expectPath(path: string): Promise<void> {
    await expect(this.page).toHaveURL((url) => url.pathname === path);
  }
}
