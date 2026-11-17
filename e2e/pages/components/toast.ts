import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

/** The app's Radix toasts. They render as `<li role="status">` inside the toast viewport. */
export class Toast {
  constructor(private readonly page: Page) {}

  /** A toast whose title or description contains `text`. */
  withText(text: string | RegExp): Locator {
    return this.page.locator('li[role="status"]').filter({ hasText: text });
  }

  async expectShown(text: string | RegExp): Promise<void> {
    await expect(this.withText(text).first()).toBeVisible();
  }

  async expectNotShown(text: string | RegExp): Promise<void> {
    await expect(this.withText(text)).toHaveCount(0);
  }
}
