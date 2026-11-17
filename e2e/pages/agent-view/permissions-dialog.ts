import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

export type PermissionLabel = "Always allow" | "Ask for permission" | "Always block";

/** The per-agent tool permissions dialog opened from the Tools tab. */
export class PermissionsDialog {
  readonly root: Locator;
  readonly saveButton: Locator;
  readonly cancelButton: Locator;
  readonly closeButton: Locator;
  readonly error: Locator;
  readonly savedMessage: Locator;

  constructor(page: Page, toolName: string) {
    this.root = page.getByRole("dialog", { name: `Permissions: ${toolName}` });
    this.saveButton = this.root.getByRole("button", { name: "Save", exact: true });
    this.cancelButton = this.root.getByRole("button", { name: "Cancel", exact: true });
    // The dialog's corner X is also named "Close"; the footer button comes first in the DOM.
    this.closeButton = this.root.getByRole("button", { name: "Close", exact: true }).first();
    this.error = this.root.getByRole("alert");
    this.savedMessage = this.root.getByRole("status");
  }

  /** The three-way control of one row (a function name, or "All functions"). */
  control(rowLabel: string): Locator {
    return this.root.getByRole("group", { name: `Permission for ${rowLabel}` });
  }

  option(rowLabel: string, option: PermissionLabel): Locator {
    return this.root.getByRole("radio", { name: `${option}: ${rowLabel}` });
  }

  async choose(rowLabel: string, option: PermissionLabel): Promise<void> {
    await this.option(rowLabel, option).click();
  }

  async expectChosen(rowLabel: string, option: PermissionLabel): Promise<void> {
    await expect(this.option(rowLabel, option)).toBeChecked();
  }

  bulkButton(option: PermissionLabel): Locator {
    return this.root.getByRole("button", { name: `Set all functions to ${option}` });
  }
}
