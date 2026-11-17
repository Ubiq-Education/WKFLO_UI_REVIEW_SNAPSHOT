import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { AppLayoutPage } from "../app-layout.page";

/**
 * The tenant switcher and the account area of the app header. It composes the shared AppLayoutPage
 * (greeting, logout, signed-in wait) and adds the tenant combobox, which has the label "Tenant:".
 */
export class HeaderPage {
  readonly layout: AppLayoutPage;
  readonly tenantCombobox: Locator;
  readonly tenantSearch: Locator;
  readonly noTenantsText: Locator;
  readonly noWorkspacesMessage: Locator;

  constructor(readonly page: Page) {
    this.layout = new AppLayoutPage(page);
    this.tenantCombobox = page.getByRole("combobox", { name: "Tenant:" });
    this.tenantSearch = page.getByPlaceholder("Search tenants...");
    this.noTenantsText = page.getByText("No tenants found.");
    this.noWorkspacesMessage = this.layout.header.getByRole("status");
  }

  async open(): Promise<void> {
    await this.tenantCombobox.click();
    await expect(this.tenantSearch).toBeVisible();
  }

  option(name: string): Locator {
    return this.page.getByRole("option", { name, exact: true });
  }

  async selectTenant(name: string): Promise<void> {
    await this.open();
    await this.option(name).click();
    await expect(this.tenantCombobox).toHaveText(name);
  }

  async logout(): Promise<void> {
    await this.layout.logoutButton.click();
  }
}
