import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { ConfirmDialog } from "../components/confirm-dialog";

/** The Settings shell: the section nav and the section title. */
export class SettingsPage {
  readonly heading: Locator;
  readonly nav: Locator;
  readonly sectionTitle: Locator;

  constructor(readonly page: Page) {
    this.heading = page.getByRole("heading", { level: 1, name: "Settings" });
    this.nav = page.getByRole("navigation", { name: "Settings sections" });
    this.sectionTitle = page.getByRole("heading", { level: 2 });
  }

  async goto(section: "general" | "super-power-users" | "web-origins"): Promise<void> {
    await this.page.goto(`/settings/${section}`);
    await expect(this.heading).toBeVisible();
  }

  navLink(name: string): Locator {
    return this.nav.getByRole("link", { name });
  }
}

/** The General section: date and time settings form. */
export class GeneralSettingsPage extends SettingsPage {
  readonly timeZone: Locator;
  readonly dateFormat: Locator;
  readonly twentyFourHour: Locator;
  readonly twelveHour: Locator;
  readonly preview: Locator;
  readonly saveButton: Locator;
  readonly discardButton: Locator;
  readonly loadError: Locator;
  readonly tryAgainButton: Locator;

  constructor(page: Page) {
    super(page);
    this.timeZone = page.getByRole("combobox", { name: "Time zone" });
    this.dateFormat = page.getByRole("combobox", { name: "Date format" });
    this.twentyFourHour = page.getByRole("radio", { name: /24-hour/ });
    this.twelveHour = page.getByRole("radio", { name: /12-hour/ });
    this.preview = page.getByTestId("time-preview");
    this.saveButton = page.getByRole("button", { name: "Save changes" });
    this.discardButton = page.getByRole("button", { name: "Discard changes" });
    this.loadError = page.getByText("Couldn't load settings");
    this.tryAgainButton = page.getByRole("button", { name: /Try again/ });
  }

  async gotoGeneral(): Promise<void> {
    await this.goto("general");
    await expect(this.timeZone).toBeVisible();
  }

  async pickTimeZone(search: string, optionName: RegExp): Promise<void> {
    await this.timeZone.click();
    await this.page.getByPlaceholder("Search time zones...").fill(search);
    await this.page.getByRole("option", { name: optionName }).click();
  }

  async pickDateFormat(optionName: RegExp): Promise<void> {
    await this.dateFormat.click();
    await this.page.getByRole("option", { name: optionName }).click();
  }
}

/** One of the two lists on the Super Power Users section: users, or tenant access. */
export class EmailListCard {
  readonly emailInput: Locator;
  readonly addButton: Locator;
  readonly validationMessage: Locator;
  readonly removeDialog: ConfirmDialog;

  constructor(
    private readonly page: Page,
    readonly root: Locator,
    addButtonName: string,
    dialogName: string,
  ) {
    this.emailInput = root.getByLabel("Email", { exact: true });
    this.addButton = root.getByRole("button", { name: addButtonName });
    this.validationMessage = root.locator("p.text-destructive");
    this.removeDialog = new ConfirmDialog(page, dialogName);
  }

  row(email: string): Locator {
    return this.root.getByRole("row").filter({ has: this.page.getByText(email, { exact: true }) });
  }

  removeButton(email: string): Locator {
    return this.root.getByRole("button", { name: `Remove ${email}`, exact: true });
  }

  async add(email: string): Promise<void> {
    await this.emailInput.fill(email);
    await this.addButton.click();
  }

  async remove(email: string): Promise<void> {
    await this.removeButton(email).click();
    await this.removeDialog.confirm("Remove");
  }
}

export class SuperPowerUsersPage extends SettingsPage {
  readonly users: EmailListCard;
  readonly tenantAccess: EmailListCard;
  readonly searchBox: Locator;
  readonly noAccessRow: Locator;

  constructor(page: Page) {
    super(page);
    const card = (title: string | RegExp) =>
      page.locator("div.rounded-lg.border").filter({ has: page.getByText(title, typeof title === "string" ? { exact: true } : {}) });
    this.users = new EmailListCard(page, card("Super Power Users"), "Add super power user", "Remove super power user?");
    this.tenantAccess = new EmailListCard(page, card(/^Who can access /), "Add access", "Remove tenant access?");
    this.searchBox = page.getByLabel("Search by email");
    this.noAccessRow = page.getByText("No tenant access found.");
  }

  async gotoSection(): Promise<void> {
    await this.goto("super-power-users");
    await expect(this.users.addButton).toBeVisible();
  }
}
