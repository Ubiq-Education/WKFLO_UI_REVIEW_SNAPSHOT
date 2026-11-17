import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { ConfirmDialog } from "../components/confirm-dialog";

/** The Vault page (`/vault`, super power users only). */
export class VaultPage {
  readonly heading: Locator;
  readonly addButton: Locator;
  readonly searchBox: Locator;
  readonly listViewButton: Locator;
  readonly gridViewButton: Locator;
  readonly emptyMessage: Locator;
  readonly noMatchMessage: Locator;
  readonly dialog: Locator;
  readonly nameInput: Locator;
  readonly apiKeyInput: Locator;
  readonly activeSwitch: Locator;
  readonly cancelButton: Locator;
  readonly deleteDialog: ConfirmDialog;

  constructor(readonly page: Page) {
    this.heading = page.getByRole("heading", { level: 1, name: "Vault" });
    this.addButton = page.getByRole("button", { name: "Add API Key" });
    this.searchBox = page.getByPlaceholder("Search API keys...");
    this.listViewButton = page.getByRole("button", { name: "List view" });
    this.gridViewButton = page.getByRole("button", { name: "Grid view" });
    this.emptyMessage = page.getByText("Your vault is empty. Add API keys to use in your agents and tools.");
    this.noMatchMessage = page.getByText("No API keys matching your search criteria.");
    this.dialog = page.getByRole("dialog");
    this.nameInput = this.dialog.getByLabel("Name", { exact: true });
    this.apiKeyInput = this.dialog.getByLabel("API Key", { exact: true });
    this.activeSwitch = this.dialog.getByRole("switch");
    this.cancelButton = this.dialog.getByRole("button", { name: "Cancel" });
    this.deleteDialog = new ConfirmDialog(page, "Delete API Key");
  }

  async goto(): Promise<void> {
    await this.page.goto("/vault");
    await expect(this.heading).toBeVisible();
  }

  cardHeading(name: string): Locator {
    return this.page.getByRole("heading", { level: 3, name, exact: true });
  }

  /** A secret card: the Card that holds the secret's heading. It has no role or name. */
  card(name: string): Locator {
    return this.page.locator("div.bg-card").filter({ has: this.cardHeading(name) });
  }

  activeToggle(name: string): Locator {
    return this.card(name).getByRole("switch", { name: `Active: ${name}` });
  }

  revealButton(name: string): Locator {
    return this.card(name).getByRole("button", { name: `Reveal ${name}` });
  }

  hideButton(name: string): Locator {
    return this.card(name).getByRole("button", { name: `Hide ${name}` });
  }

  editButton(name: string): Locator {
    return this.card(name).getByRole("button", { name: `Edit ${name}` });
  }

  deleteButton(name: string): Locator {
    return this.card(name).getByRole("button", { name: "Delete" });
  }

  /** The masked or revealed key text, in the monospace box above the buttons. */
  keyText(name: string): Locator {
    return this.card(name).locator("div.font-mono").first();
  }

  saveButton(): Locator {
    return this.dialog.getByRole("button", { name: /^(Save API Key|Update API Key|Saving\.\.\.)$/ });
  }
}
