import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * The tool create (`/tools/create`) and edit (`/tools/:id/edit`) pages, seen as the MCP editor uses them.
 * The MCP editor's text fields have labels that are not wired to their inputs, so inputs are found by placeholder.
 */
export class McpEditorPage {
  readonly nameInput: Locator;
  readonly descriptionInput: Locator;
  readonly typeSelect: Locator;
  readonly permissionsCheckbox: Locator;
  readonly saveButton: Locator;
  readonly serverId: Locator;
  readonly transport: Locator;
  readonly command: Locator;
  readonly endpoint: Locator;
  readonly authType: Locator;
  readonly connectionMode: Locator;
  readonly addArgument: Locator;
  readonly addVariable: Locator;
  readonly variableNames: Locator;
  readonly variableValues: Locator;
  readonly clientId: Locator;
  readonly clientSecret: Locator;
  readonly scopes: Locator;

  constructor(readonly page: Page) {
    this.nameInput = page.getByLabel("Tool Name");
    this.descriptionInput = page.getByLabel("Description", { exact: true }).first();
    this.typeSelect = page.getByRole("combobox", { name: "Tool Type" });
    this.permissionsCheckbox = page.getByRole("checkbox", { name: "Manage permissions for this tool" });
    this.saveButton = page.getByRole("button", { name: "Save Tool" });
    this.serverId = page.getByPlaceholder(/^MCP Server ID/);
    this.transport = page.getByRole("combobox", { name: "Transport Method" });
    this.command = page.getByPlaceholder(/^MCP command/);
    this.endpoint = page.getByPlaceholder(/^Endpoint/);
    this.authType = page.getByRole("combobox", { name: "Auth Type" });
    this.connectionMode = page.getByRole("combobox", { name: "Connection Mode" });
    this.addArgument = page.getByRole("button", { name: "Add Argument" });
    // Environment variables (Stdio) and additional headers (Http, no OAuth) share the same markup and are never shown together.
    this.addVariable = page.getByRole("button", { name: "Add Variable" });
    this.variableNames = page.getByPlaceholder("Variable name");
    this.variableValues = page.getByPlaceholder("Value", { exact: true });
    this.clientId = page.getByLabel("Client ID", { exact: true });
    this.clientSecret = page.getByLabel("Client Secret", { exact: true });
    this.scopes = page.getByLabel("Scopes", { exact: true });
  }

  async gotoCreate(): Promise<void> {
    await this.page.goto("/tools/create");
    await expect(this.page.getByRole("heading", { level: 1, name: "Create New Tool" })).toBeVisible();
  }

  async gotoEdit(id: number): Promise<void> {
    await this.page.goto(`/tools/${id}/edit`);
    await expect(this.page.getByRole("heading", { level: 1, name: "Edit Tool" })).toBeVisible();
    await expect(this.nameInput).not.toHaveValue("");
  }

  async selectToolType(optionName: string): Promise<void> {
    await this.typeSelect.click();
    await this.page.getByRole("option", { name: optionName, exact: true }).click();
  }

  async chooseTransport(name: "Stdio" | "Http"): Promise<void> {
    await this.transport.click();
    await this.page.getByRole("option", { name, exact: true }).click();
  }

  async chooseAuthType(name: "None" | "OAuth 2.1"): Promise<void> {
    await this.authType.click();
    await this.page.getByRole("option", { name, exact: true }).click();
  }

  async chooseConnectionMode(name: RegExp | string): Promise<void> {
    await this.connectionMode.click();
    await this.page.getByRole("option", { name }).click();
  }

  argument(n: number): Locator {
    return this.page.getByPlaceholder(`Argument #${n}`);
  }

  removeArgument(n: number): Locator {
    return this.page.getByRole("button", { name: `Remove argument ${n}` });
  }

  removeEnvVariable(name: string): Locator {
    return this.page.getByRole("button", { name: `Remove environment variable ${name}` });
  }

  toggleEnvVariable(name: string): Locator {
    return this.page.getByRole("button", { name: `Toggle visibility of environment variable ${name}` });
  }

  removeHeader(name: string): Locator {
    return this.page.getByRole("button", { name: `Remove header ${name}` });
  }

  toggleHeader(name: string): Locator {
    return this.page.getByRole("button", { name: `Toggle visibility of header ${name}` });
  }

  /** Fills a freshly created MCP tool's name and description (both have minimum lengths). */
  async fillBasics(name: string, description = "An MCP tool created by the e2e suite."): Promise<void> {
    await this.nameInput.fill(name);
    await this.descriptionInput.fill(description);
  }

  /** The Publish control of the edit page: a real button when everything is saved, a disabled stand-in otherwise. */
  get publishButton(): Locator {
    return this.page.getByRole("button", { name: "Publish", exact: true, disabled: false });
  }

  get publishDisabled(): Locator {
    return this.page.getByTestId("publish-disabled-trigger");
  }

  get publishBadge(): Locator {
    return this.page.getByTestId("tool-publish-badge");
  }
}
