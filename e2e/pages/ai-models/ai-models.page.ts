import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { ConfirmDialog } from "../components/confirm-dialog";

/** The AI Models page (`/aimodels`): the card list and the Add / Edit dialog. */
export class AiModelsPage {
  readonly heading: Locator;
  readonly addButton: Locator;
  readonly searchBox: Locator;
  readonly listViewButton: Locator;
  readonly gridViewButton: Locator;
  readonly dialog: Locator;
  readonly deleteDialog: ConfirmDialog;

  constructor(readonly page: Page) {
    this.heading = page.getByRole("heading", { level: 1, name: "AI Models" });
    this.addButton = page.getByRole("button", { name: "Add Model" });
    this.searchBox = page.getByPlaceholder("Search models...");
    this.listViewButton = page.getByRole("button", { name: "List view" });
    this.gridViewButton = page.getByRole("button", { name: "Grid view" });
    this.dialog = page.getByRole("dialog");
    this.deleteDialog = new ConfirmDialog(page, "Delete Model");
  }

  async goto(): Promise<void> {
    await this.page.goto("/aimodels");
    await expect(this.heading).toBeVisible();
  }

  cardTitle(name: string): Locator {
    return this.page.getByRole("heading", { level: 3, name, exact: true });
  }

  /** The card of the model with this name (the Card root is the nearest ancestor with the shadow transition). */
  card(name: string): Locator {
    return this.cardTitle(name).locator("xpath=ancestor::div[contains(@class,'transition-shadow')][1]");
  }

  activeSwitch(name: string): Locator {
    return this.page.getByRole("switch", { name: `Toggle ${name} active` });
  }

  editButton(name: string): Locator {
    return this.card(name).getByRole("button", { name: "Edit Model" });
  }

  manageTagsButton(name: string): Locator {
    return this.card(name).getByRole("button", { name: "Manage Tags" });
  }

  aiCreditButton(name: string): Locator {
    return this.card(name).getByRole("button", { name: "AI Credit" });
  }

  deleteButton(name: string): Locator {
    return this.card(name).getByRole("button", { name: "Delete", exact: true });
  }

  // Dialog fields. Provider, Authentication, Linked Secret and Type are Radix selects (role combobox).
  get nameInput(): Locator {
    return this.dialog.getByLabel("Name", { exact: true });
  }
  get providerSelect(): Locator {
    return this.dialog.getByRole("combobox", { name: "Provider" });
  }
  get authSelect(): Locator {
    return this.dialog.getByRole("combobox", { name: "Authentication" });
  }
  get secretSelect(): Locator {
    return this.dialog.getByRole("combobox", { name: "Linked Secret" });
  }
  get endpointInput(): Locator {
    return this.dialog.getByLabel("Endpoint");
  }
  get deploymentInput(): Locator {
    return this.dialog.getByLabel("Deployment Name");
  }
  get modelInput(): Locator {
    return this.dialog.getByLabel("Model", { exact: true });
  }
  get apiVersionInput(): Locator {
    return this.dialog.getByLabel("API Version");
  }
  get typeSelect(): Locator {
    return this.dialog.getByRole("combobox", { name: /^Type/ });
  }
  get activeSwitchInDialog(): Locator {
    return this.dialog.getByRole("switch", { name: "Active" });
  }
  get saveButton(): Locator {
    return this.dialog.getByRole("button", { name: /^(Save Model|Update Model)$/ });
  }
  get cancelButton(): Locator {
    return this.dialog.getByRole("button", { name: "Cancel" });
  }

  /** Picks an option of a Radix select that is currently closed. */
  async choose(select: Locator, option: string | RegExp): Promise<void> {
    await select.click();
    await this.page.getByRole("option", typeof option === "string" ? { name: option, exact: true } : { name: option }).click();
  }

  async openAdd(): Promise<void> {
    await this.addButton.click();
    await expect(this.dialog).toBeVisible();
  }
}
