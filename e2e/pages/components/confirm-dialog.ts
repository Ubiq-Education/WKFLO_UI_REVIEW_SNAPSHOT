import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

/** A Radix alert dialog ("Are you sure?" style confirmation), found by role. */
export class ConfirmDialog {
  readonly root: Locator;

  constructor(page: Page, name?: string | RegExp) {
    this.root = page.getByRole("alertdialog", name ? { name } : {});
  }

  button(name: string | RegExp): Locator {
    return this.root.getByRole("button", { name });
  }

  async expectVisible(): Promise<void> {
    await expect(this.root).toBeVisible();
  }

  async expectText(text: string | RegExp): Promise<void> {
    await expect(this.root).toContainText(text);
  }

  async confirm(name: string | RegExp = /^(confirm|delete|remove|yes|continue)/i): Promise<void> {
    await this.button(name).click();
  }

  async cancel(): Promise<void> {
    await this.button(/^cancel/i).click();
  }

  async expectClosed(): Promise<void> {
    await expect(this.root).toBeHidden();
  }
}
