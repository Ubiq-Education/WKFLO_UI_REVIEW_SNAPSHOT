import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

/** Visible names of the Tool Type options, by tool type value. */
export const TOOL_TYPE_OPTIONS = {
  HTTP: "HTTP API",
  Knowledge: "Document Library",
  Integration_Amais: "AMAIS Integration",
  Priority_QA: "Priority Q&A",
  Chat_Classification: "Chat Classification",
  Contact_Form: "Contact Form",
  Image_Generation: "Image to Image",
} as const;

/** Heading of each type's config editor. */
export const EDITOR_HEADINGS = {
  HTTP: "API Configuration",
  Knowledge: "Knowledge Configuration",
  Integration_Amais: "Integration Amais Configuration",
  Priority_QA: "Priority Q&A Configuration",
  Chat_Classification: "Chat Classification Configuration",
  Contact_Form: "Contact Form Configuration",
  Image_Generation: "Image to Image Configuration",
} as const;

/** The create (`/tools/create`) and edit (`/tools/:id/edit`) pages, which share one form. */
export class ToolFormPage {
  readonly nameInput: Locator;
  readonly descriptionInput: Locator;
  readonly typeSelect: Locator;
  readonly maxOutputInput: Locator;
  readonly permissionsCheckbox: Locator;
  readonly saveButton: Locator;
  readonly cancelButton: Locator;
  readonly backButton: Locator;
  readonly rawConfig: Locator;

  constructor(readonly page: Page) {
    this.nameInput = page.getByLabel("Tool Name");
    this.descriptionInput = page.getByLabel("Description", { exact: true }).first();
    this.typeSelect = page.getByRole("combobox", { name: "Tool Type" });
    this.maxOutputInput = page.getByLabel("Max Output Length");
    this.permissionsCheckbox = page.getByRole("checkbox", { name: "Manage permissions for this tool" });
    this.saveButton = page.getByRole("button", { name: "Save Tool" });
    this.cancelButton = page.getByRole("button", { name: "Cancel" });
    this.backButton = page.getByRole("button", { name: "Back" });
    this.rawConfig = page.getByPlaceholder("Tool configuration in JSON format...");
  }

  async gotoCreate(): Promise<void> {
    await this.page.goto("/tools/create");
    await expect(this.page.getByRole("heading", { level: 1, name: "Create New Tool" })).toBeVisible();
  }

  async gotoEdit(id: number): Promise<void> {
    await this.page.goto(`/tools/${id}/edit`);
    await expect(this.page.getByRole("heading", { level: 1, name: "Edit Tool" })).toBeVisible();
    // The form is filled from the loaded tool.
    await expect(this.nameInput).not.toHaveValue("");
  }

  async selectType(optionName: string): Promise<void> {
    await this.typeSelect.click();
    await this.page.getByRole("option", { name: optionName, exact: true }).click();
  }

  editorHeading(name: string): Locator {
    return this.page.getByRole("heading", { level: 3, name, exact: true });
  }

  /** Publish / Delete in the edit page header. */
  get publishButton(): Locator {
    return this.page.getByRole("button", { name: "Publish", exact: true });
  }

  get deleteButton(): Locator {
    return this.page.getByRole("button", { name: "Delete", exact: true });
  }

  get publishBadge(): Locator {
    return this.page.getByTestId("tool-publish-badge");
  }

  async expectPath(path: string): Promise<void> {
    await expect(this.page).toHaveURL((url) => url.pathname === path);
  }
}
