import { expect, test } from "../../support/test";
import { SettingsPage } from "../../pages/settings/settings.page";
import { installSettingsMocks } from "../../support/mocks/settings";

test.beforeEach(({ mockApi }) => {
  installSettingsMocks(mockApi);
});

test.describe("super power user", () => {
  test("sees both sections and the active one is marked", async ({ page }) => {
    const settings = new SettingsPage(page);
    await settings.goto("general");

    await expect(settings.navLink("General")).toHaveAttribute("aria-current", "page");
    await expect(settings.navLink("Super Power Users")).not.toHaveAttribute("aria-current", "page");
  });

  test("the nav switches between sections", async ({ page }) => {
    const settings = new SettingsPage(page);
    await settings.goto("general");

    await settings.navLink("Super Power Users").click();
    await expect(page).toHaveURL((url) => url.pathname === "/settings/super-power-users");
    await expect(settings.sectionTitle).toHaveText("Super Power Users");

    await settings.navLink("General").click();
    await expect(page).toHaveURL((url) => url.pathname === "/settings/general");
    await expect(settings.sectionTitle).toHaveText("General");
  });

  test("an unknown section falls back to General", async ({ page }) => {
    await page.goto("/settings/no-such-section");

    await expect(page).toHaveURL((url) => url.pathname === "/settings/general");
    await expect(page.getByRole("heading", { level: 2, name: "General" })).toBeVisible();
  });
});

test.describe("standard user", () => {
  test.use({ isSuperPowerUser: false });

  test("only sees the General section", async ({ page }) => {
    const settings = new SettingsPage(page);
    await settings.goto("general");

    await expect(settings.navLink("General")).toBeVisible();
    await expect(settings.navLink("Super Power Users")).toHaveCount(0);
    await expect(settings.navLink("Web Origins")).toHaveCount(0);
  });

  test("can read and save the general settings", async ({ page, mockApi }) => {
    const settings = new SettingsPage(page);
    await settings.goto("general");
    await page.getByRole("radio", { name: /24-hour/ }).click();

    await page.getByRole("button", { name: "Save changes" }).click();

    await expect(page.getByText("Settings saved", { exact: true })).toBeVisible();
    expect(mockApi.requestsTo("PUT", "/md/api/v1/tenant/settings")).toHaveLength(1);
  });
});
