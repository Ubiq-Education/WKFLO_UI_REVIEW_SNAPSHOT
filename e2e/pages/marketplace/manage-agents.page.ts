import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

/** Manage Marketplace Agents (`/marketplace/manage-agents`), its edit dialog and its tags dialog. */
export class ManageAgentsPage {
  readonly heading: Locator;
  readonly searchBox: Locator;
  readonly emptyState: Locator;
  readonly loadError: Locator;
  readonly retryButton: Locator;

  readonly editDialog: Locator;
  readonly nameInput: Locator;
  readonly descriptionInput: Locator;
  readonly modelSelect: Locator;
  readonly memorySwitch: Locator;
  readonly iconInput: Locator;
  readonly uploadError: Locator;
  readonly saveButton: Locator;
  readonly cancelButton: Locator;

  readonly tagsDialog: Locator;

  constructor(readonly page: Page) {
    this.heading = page.getByRole("heading", { level: 1, name: "Manage Marketplace Agents" });
    this.searchBox = page.getByPlaceholder("Search Marketplace agents...");
    this.emptyState = page.getByRole("heading", { name: "No Marketplace agents found" });
    this.loadError = page.getByText("Failed to load Marketplace agents");
    this.retryButton = page.getByRole("button", { name: "Retry" });

    this.editDialog = page.getByRole("dialog", { name: "Edit Marketplace Agent" });
    this.nameInput = this.editDialog.getByLabel("Name");
    this.descriptionInput = this.editDialog.getByLabel("Description");
    this.modelSelect = this.editDialog.getByRole("combobox");
    this.memorySwitch = this.editDialog.getByRole("switch", { name: "Short Term Memory (STM)" });
    this.iconInput = this.editDialog.locator("#marketplace-agent-icon-upload");
    this.uploadError = this.editDialog.locator("p.text-destructive");
    this.saveButton = this.editDialog.getByRole("button", { name: "Save" });
    this.cancelButton = this.editDialog.getByRole("button", { name: "Cancel" });

    this.tagsDialog = page.getByRole("dialog", { name: /^Manage Tags/ });
  }

  async goto(): Promise<void> {
    await this.page.goto("/marketplace/manage-agents");
    await expect(this.heading).toBeVisible();
  }

  row(name: string): Locator {
    return this.page.getByRole("row").filter({ has: this.page.getByText(name, { exact: true }) });
  }

  async openEdit(name: string): Promise<void> {
    await this.row(name).getByRole("button", { name: "Edit" }).click();
    await expect(this.editDialog).toBeVisible();
  }

  async openTags(name: string): Promise<void> {
    await this.row(name).getByRole("button", { name: "Manage Tags" }).click();
    await expect(this.tagsDialog).toBeVisible();
  }

  async pickModel(name: string): Promise<void> {
    await this.modelSelect.click();
    await this.page.getByRole("option", { name, exact: true }).click();
  }
}
