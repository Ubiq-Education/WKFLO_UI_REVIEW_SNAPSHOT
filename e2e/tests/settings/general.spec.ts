import { expect, test } from "../../support/test";
import { GeneralSettingsPage } from "../../pages/settings/settings.page";
import { Toast } from "../../pages/components/toast";
import { TENANT_A } from "../../support/fixtures";
import { errorReply, unexpectedReply } from "../../support/mocks/marketplace";
import { installSettingsMocks, type SettingsStore } from "../../support/mocks/settings";

const EXPECTED_FAILURES = /Failed to load resource: the server responded with a status of (400|500)/;
const SETTINGS_PATH = "/md/api/v1/tenant/settings";

let store: SettingsStore;

test.beforeEach(({ mockApi }) => {
  store = installSettingsMocks(mockApi);
});

test.describe("loading", () => {
  test("shows the saved values of the selected tenant", async ({ page }) => {
    const settings = new GeneralSettingsPage(page);
    await settings.gotoGeneral();

    await expect(settings.sectionTitle).toHaveText("General");
    await expect(settings.timeZone).toHaveText(/\(GMT[+-]\d{2}:\d{2}\) Europe\/London/);
    await expect(settings.dateFormat).toHaveText(/^dd\/MM\/yyyy/);
    await expect(settings.twelveHour).toBeChecked();
    await expect(settings.twentyFourHour).not.toBeChecked();
  });

  test("shows when the settings were last updated, in the saved zone and formats", async ({ page }) => {
    const settings = new GeneralSettingsPage(page);
    await settings.gotoGeneral();

    // 13:05 UTC on 10 Feb is 13:05 in London (no daylight saving yet), in the 12-hour format.
    await expect(page.getByText("Last updated 10/02/2026 1:05 PM")).toBeVisible();
  });

  test("a tenant that never saved settings shows the defaults and no last-updated text", async ({ page }) => {
    // The API returns lastUpdatedOn null only when no settings row exists, and then the values are the defaults.
    Object.assign(store.settings.get(TENANT_A.guid)!, { timeZone: "UTC", timeFormat: "24h", dateFormat: "yyyy-MM-dd", lastUpdatedOn: null });
    const settings = new GeneralSettingsPage(page);
    await settings.gotoGeneral();

    await expect(settings.timeZone).toHaveText(/\(GMT\+00:00\) UTC/);
    await expect(settings.twentyFourHour).toBeChecked();
    await expect(page.getByText(/^Last updated/)).toHaveCount(0);
  });

  test("Save and Discard are disabled until something changes", async ({ page }) => {
    const settings = new GeneralSettingsPage(page);
    await settings.gotoGeneral();

    await expect(settings.saveButton).toBeDisabled();
    await expect(settings.discardButton).toBeDisabled();
  });

  test.describe("when loading fails", () => {
    test.use({ allowedConsoleErrors: [EXPECTED_FAILURES] });

    test("shows the raw error and Try again loads the form", async ({ page, mockApi }) => {
      mockApi.on("GET", SETTINGS_PATH, () => unexpectedReply());
      const settings = new GeneralSettingsPage(page);
      await settings.goto("general");
      await expect(settings.loadError).toBeVisible();
      await expect(page.getByText(/^500: .*"code":"WKFLO0001"/)).toBeVisible();
      await expect(settings.saveButton).toHaveCount(0);

      installSettingsMocks(mockApi, { store });
      await settings.tryAgainButton.click();

      await expect(settings.timeZone).toBeVisible();
      await expect(settings.loadError).toHaveCount(0);
    });
  });
});

test.describe("editing", () => {
  test("changing the time format enables Save and Discard and updates the preview", async ({ page }) => {
    const settings = new GeneralSettingsPage(page);
    await settings.gotoGeneral();
    await expect(settings.preview).toHaveText(/^\d{2}\/\d{2}\/\d{4} \d{1,2}:\d{2} (AM|PM)$/);

    await settings.twentyFourHour.click();

    await expect(settings.saveButton).toBeEnabled();
    await expect(settings.discardButton).toBeEnabled();
    await expect(settings.preview).toHaveText(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
  });

  test("changing the date format updates the preview", async ({ page }) => {
    const settings = new GeneralSettingsPage(page);
    await settings.gotoGeneral();

    await settings.pickDateFormat(/^ddd, dd MMMM, yyyy/);

    await expect(settings.dateFormat).toHaveText(/^ddd, dd MMMM, yyyy/);
    await expect(settings.preview).toHaveText(/^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]+, \d{4} \d{1,2}:\d{2} (AM|PM)$/);
  });

  test("the date format list offers every supported format with an example", async ({ page }) => {
    const settings = new GeneralSettingsPage(page);
    await settings.gotoGeneral();

    await settings.dateFormat.click();

    await expect(page.getByRole("option")).toHaveCount(11);
    await expect(page.getByRole("option", { name: /^yyyy-MM-dd \(\d{4}-\d{2}-\d{2}\)$/ })).toBeVisible();
  });

  test("the time zone list is searchable", async ({ page }) => {
    const settings = new GeneralSettingsPage(page);
    await settings.gotoGeneral();

    await settings.timeZone.click();
    await page.getByPlaceholder("Search time zones...").fill("New_York");

    await expect(page.getByRole("option", { name: /America\/New_York/ })).toBeVisible();
    await expect(page.getByRole("option", { name: /Europe\/London/ })).toHaveCount(0);

    await page.getByPlaceholder("Search time zones...").fill("no such zone");
    await expect(page.getByText("No time zone found.")).toBeVisible();
  });

  test("Discard restores the saved values and disables both buttons again", async ({ page, mockApi }) => {
    const settings = new GeneralSettingsPage(page);
    await settings.gotoGeneral();
    await settings.twentyFourHour.click();
    await settings.pickDateFormat(/^MM\/dd\/yyyy/);

    await settings.discardButton.click();

    await expect(settings.twelveHour).toBeChecked();
    await expect(settings.dateFormat).toHaveText(/^dd\/MM\/yyyy/);
    await expect(settings.saveButton).toBeDisabled();
    await expect(settings.discardButton).toBeDisabled();
    expect(mockApi.requestsTo("PUT", SETTINGS_PATH)).toHaveLength(0);
  });
});

test.describe("saving", () => {
  test("sends all three values, toasts, and the form becomes clean with a new last-updated time", async ({ page, mockApi }) => {
    const settings = new GeneralSettingsPage(page);
    const toast = new Toast(page);
    await settings.gotoGeneral();

    await settings.pickTimeZone("New_York", /America\/New_York/);
    await settings.pickDateFormat(/^MM\/dd\/yyyy/);
    await settings.twentyFourHour.click();
    await settings.saveButton.click();

    await toast.expectShown("Settings saved");
    await toast.expectShown("Date and time settings have been updated.");
    const [put] = mockApi.requestsTo("PUT", SETTINGS_PATH);
    expect(put.body).toEqual({ timeZone: "America/New_York", dateFormat: "MM/dd/yyyy", timeFormat: "24h" });
    await expect(settings.saveButton).toBeDisabled();
    await expect(settings.discardButton).toBeDisabled();
    await expect(settings.timeZone).toHaveText(/America\/New_York/);
    await expect(settings.twentyFourHour).toBeChecked();
    await expect(page.getByText(/^Last updated 03\/01\/2026 /)).toBeVisible();
    expect(store.settings.get(TENANT_A.guid)).toMatchObject({ timeZone: "America/New_York", dateFormat: "MM/dd/yyyy", timeFormat: "24h" });
  });

  test("the saved values survive a reload", async ({ page }) => {
    const settings = new GeneralSettingsPage(page);
    const toast = new Toast(page);
    await settings.gotoGeneral();
    await settings.twentyFourHour.click();
    await settings.saveButton.click();
    await toast.expectShown("Settings saved");

    await page.reload();

    await expect(settings.twentyFourHour).toBeChecked();
    await expect(settings.saveButton).toBeDisabled();
  });

  test.describe("rejections", () => {
    test.use({ allowedConsoleErrors: [EXPECTED_FAILURES] });

    test("a time zone the server does not accept is a raw 400 and the form stays dirty", async ({ page, mockApi }) => {
      // Assumption: a browser can list a zone (such as the legacy alias Asia/Calcutta) that the server's own list lacks.
      // The explicit 400 override below is what the test relies on; it names the property.
      mockApi.on("PUT", SETTINGS_PATH, () => errorReply(400, ["TimeZone", "WKFLOMD1501"]));
      const settings = new GeneralSettingsPage(page);
      const toast = new Toast(page);
      await settings.gotoGeneral();
      await settings.pickTimeZone("Calcutta", /Asia\/Calcutta/);
      await settings.saveButton.click();

      await toast.expectShown("Couldn't save settings");
      await toast.expectShown(/400: .*"code":"WKFLOMD1501".*"property":"TimeZone"/);
      await expect(settings.saveButton).toBeEnabled();
      await expect(settings.discardButton).toBeEnabled();
      expect(store.settings.get(TENANT_A.guid)?.timeZone).toBe("Europe/London");
    });

    test("an unexpected server error shows the raw 500 body and keeps the edits", async ({ page, mockApi }) => {
      mockApi.on("PUT", SETTINGS_PATH, () => unexpectedReply());
      const settings = new GeneralSettingsPage(page);
      const toast = new Toast(page);
      await settings.gotoGeneral();
      await settings.twentyFourHour.click();

      await settings.saveButton.click();

      await toast.expectShown("Couldn't save settings");
      await toast.expectShown(/500: .*"code":"WKFLO0001"/);
      await expect(settings.twentyFourHour).toBeChecked();
      await expect(settings.saveButton).toBeEnabled();
    });
  });
});

test.describe("form validation", () => {
  // The three fields are pickers over fixed lists, so the form's own messages ("Select a time zone", ...)
  // cannot be produced through the UI. The schema rules are covered by the unit tests in
  // client/src/components/settings/sections/general-settings-form.test.tsx.
  test("a saved value outside the lists falls back to the defaults", async ({ page, mockApi }) => {
    mockApi.on("GET", SETTINGS_PATH, () => ({ timeZone: "", timeFormat: "weird", dateFormat: "weird", lastUpdatedOn: null }));
    const settings = new GeneralSettingsPage(page);
    await settings.goto("general");

    await expect(settings.timeZone).toHaveText(/\(GMT\+00:00\) UTC/);
    await expect(settings.dateFormat).toHaveText(/^yyyy-MM-dd/);
    await expect(settings.twentyFourHour).toBeChecked();
  });
});
