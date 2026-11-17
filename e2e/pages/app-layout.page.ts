import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

/** The shell around every page: sidebar, header and the layout's loading / error / empty states. */
export class AppLayoutPage {
  readonly sidebar: Locator;
  readonly header: Locator;
  readonly tenantSelector: Locator;
  readonly greeting: Locator;
  readonly logoutButton: Locator;
  readonly pageHeading: Locator;
  readonly permissionsError: Locator;
  readonly noWorkspacesMessage: Locator;

  constructor(readonly page: Page) {
    this.sidebar = page.getByRole("navigation");
    this.header = page.getByRole("banner");
    this.tenantSelector = this.header.getByRole("combobox");
    this.greeting = this.header.getByText(/^Hello, .+!$/);
    this.logoutButton = this.header.getByRole("button", { name: "Logout" });
    this.pageHeading = page.getByRole("heading", { level: 1 });
    this.permissionsError = page.getByRole("alert");
    // The layout renders <main role="status">; toasts are role=status too, so match on the element.
    this.noWorkspacesMessage = page.locator('main[role="status"]');
  }

  /** A sidebar icon link, found by its accessible name (the item's label). */
  sidebarLink(name: string): Locator {
    return this.page.getByRole("link", { name, exact: true });
  }

  /** The Settings link sits below the nav, next to the profile badge. */
  settingsLink(): Locator {
    return this.page.getByRole("link", { name: "Settings", exact: true });
  }

  async goto(path: string): Promise<void> {
    await this.page.goto(path);
  }

  async expectHeading(heading: string | RegExp): Promise<void> {
    await expect(this.pageHeading.first()).toHaveText(heading);
  }

  async expectPath(path: string): Promise<void> {
    await expect(this.page).toHaveURL((url) => url.pathname === path);
  }

  /** Waits until the layout has finished loading permissions and tenants for the signed-in user. */
  async expectSignedIn(userName = "E2E User"): Promise<void> {
    await expect(this.greeting).toHaveText(`Hello, ${userName}!`);
    await expect(this.tenantSelector).toBeEnabled();
  }
}
