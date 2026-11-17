import { expect, test } from "../../support/test";
import { SettingsPage } from "../../pages/settings/settings.page";
import { HeaderPage } from "../../pages/header/header.page";
import { TENANT_A, TENANT_B } from "../../support/fixtures";
import { unexpectedReply } from "../../support/mocks/marketplace";

const WEB_ORIGINS_PATH = "/md/api/v1/tenant/web-origins";
const CREATED_ON = "2026-01-15T09:00:00Z";
const EXPECTED_FAILURES = /Failed to load resource: the server responded with a status of 500/;

const origin = (tenantGuid: string, id: number, name: string, overrides: Record<string, unknown> = {}) => ({
  tenantGuid,
  id,
  webOriginType: "SignalR",
  name,
  isActive: true,
  isDeleted: false,
  createdOn: CREATED_ON,
  lastUpdatedOn: null,
  ...overrides,
});

test.beforeEach(({ mockApi }) => {
  mockApi.seed.webOrigins.splice(
    0,
    mockApi.seed.webOrigins.length,
    origin(TENANT_A.guid, 1, "https://live.e2e.test"),
    origin(TENANT_A.guid, 2, "https://paused.e2e.test", { isActive: false }),
    origin(TENANT_A.guid, 3, "https://gone.e2e.test", { isDeleted: true }),
    origin(TENANT_A.guid, 4, "https://other-type.e2e.test", { webOriginType: "Other" }),
    origin(TENANT_B.guid, 5, "https://partner.e2e.test"),
  );
});

const rowFor = (page: import("@playwright/test").Page, name: string) =>
  page.getByRole("row").filter({ has: page.getByText(name, { exact: true }) });

test.describe("list", () => {
  test("is titled with the selected tenant and shows its origins with the In use flag", async ({ page }) => {
    await new SettingsPage(page).goto("web-origins");

    await expect(page.getByText(`Web origins for ${TENANT_A.name}`, { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/accepted from the active SignalR origins/)).toBeVisible();
    await expect(rowFor(page, "https://live.e2e.test")).toContainText("Active");
    await expect(rowFor(page, "https://live.e2e.test").getByRole("cell").nth(3)).toHaveText("Yes");
    await expect(rowFor(page, "https://paused.e2e.test")).toContainText("Inactive");
    await expect(rowFor(page, "https://paused.e2e.test").getByRole("cell").nth(3)).toHaveText("No");
    await expect(rowFor(page, "https://other-type.e2e.test").getByRole("cell").nth(3)).toHaveText("No");
    await expect(rowFor(page, "https://partner.e2e.test")).toHaveCount(0);
  });

  test("follows the tenant chosen in the header without a reload", async ({ page }) => {
    await new SettingsPage(page).goto("web-origins");
    const header = new HeaderPage(page);
    await expect(rowFor(page, "https://live.e2e.test")).toBeVisible();

    await header.selectTenant(TENANT_B.name);

    await expect(page.getByText(`Web origins for ${TENANT_B.name}`, { exact: true }).first()).toBeVisible();
    await expect(rowFor(page, "https://partner.e2e.test")).toBeVisible();
    await expect(rowFor(page, "https://live.e2e.test")).toHaveCount(0);
  });

  test("is read-only", async ({ page }) => {
    await new SettingsPage(page).goto("web-origins");
    await expect(rowFor(page, "https://live.e2e.test")).toBeVisible();

    await expect(page.getByRole("table").getByRole("button")).toHaveCount(0);
  });
});

test.describe("Show deleted", () => {
  test("hides deleted rows by default and reveals them with a Deleted badge", async ({ page }) => {
    await new SettingsPage(page).goto("web-origins");
    await expect(rowFor(page, "https://live.e2e.test")).toBeVisible();
    await expect(rowFor(page, "https://gone.e2e.test")).toHaveCount(0);

    await page.getByRole("switch", { name: "Show deleted" }).click();

    await expect(rowFor(page, "https://gone.e2e.test")).toContainText("Deleted");
    await expect(rowFor(page, "https://gone.e2e.test").getByRole("cell").nth(3)).toHaveText("No");

    await page.getByRole("switch", { name: "Show deleted" }).click();
    await expect(rowFor(page, "https://gone.e2e.test")).toHaveCount(0);
  });
});

test.describe("states", () => {
  test("a tenant without origins shows the empty state", async ({ page, mockApi }) => {
    mockApi.seed.webOrigins.splice(0, mockApi.seed.webOrigins.length);
    await new SettingsPage(page).goto("web-origins");

    await expect(page.getByText("No web origins found.")).toBeVisible();
  });

  test.describe("failure", () => {
    test.use({ allowedConsoleErrors: [EXPECTED_FAILURES] });

    test("a failed load shows the error alert", async ({ page, mockApi }) => {
      mockApi.on("GET", WEB_ORIGINS_PATH, () => unexpectedReply());
      await new SettingsPage(page).goto("web-origins");

      await expect(page.getByRole("alert")).toContainText("Couldn't load web origins. Please contact Support.");
    });
  });
});
