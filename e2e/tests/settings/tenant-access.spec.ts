import { expect, test } from "../../support/test";
import { SuperPowerUsersPage } from "../../pages/settings/settings.page";
import { HeaderPage } from "../../pages/header/header.page";
import { Toast } from "../../pages/components/toast";
import { TENANT_A, TENANT_B } from "../../support/fixtures";
import { errorReply } from "../../support/mocks/marketplace";
import { installSettingsMocks, type SettingsStore } from "../../support/mocks/settings";

const EXPECTED_FAILURES = /Failed to load resource: the server responded with a status of (400|404)/;
const ACCESS_PATH = "/md/api/v1/tenant-access";

let store: SettingsStore;

test.beforeEach(({ mockApi }) => {
  store = installSettingsMocks(mockApi);
});

test.describe("list", () => {
  test("is titled with the selected tenant and shows only that tenant's users", async ({ page }) => {
    const settings = new SuperPowerUsersPage(page);
    await settings.gotoSection();

    await expect(page.getByText(`Who can access ${TENANT_A.name}`, { exact: true })).toBeVisible();
    await expect(settings.tenantAccess.row("e2e.member@example.test")).toContainText("e2e.user@example.test");
    await expect(settings.tenantAccess.row("e2e.reviewer@example.test")).toBeVisible();
    await expect(settings.tenantAccess.row("e2e.partner@example.test")).toHaveCount(0);
  });

  test("follows the tenant chosen in the header without a reload", async ({ page }) => {
    const settings = new SuperPowerUsersPage(page);
    const header = new HeaderPage(page);
    await settings.gotoSection();
    await expect(settings.tenantAccess.row("e2e.member@example.test")).toBeVisible();

    await header.selectTenant(TENANT_B.name);

    await expect(page.getByText(`Who can access ${TENANT_B.name}`, { exact: true })).toBeVisible();
    await expect(settings.tenantAccess.row("e2e.partner@example.test")).toBeVisible();
    await expect(settings.tenantAccess.row("e2e.member@example.test")).toHaveCount(0);
  });

  test("a tenant with nobody listed says so", async ({ page }) => {
    store.tenantAccess.splice(0, store.tenantAccess.length);
    const settings = new SuperPowerUsersPage(page);
    await settings.gotoSection();

    await expect(settings.noAccessRow).toBeVisible();
  });
});

test.describe("search", () => {
  test("filters by email, ignoring case", async ({ page }) => {
    const settings = new SuperPowerUsersPage(page);
    await settings.gotoSection();

    await settings.searchBox.fill("REVIEW");

    await expect(settings.tenantAccess.row("e2e.reviewer@example.test")).toBeVisible();
    await expect(settings.tenantAccess.row("e2e.member@example.test")).toHaveCount(0);
  });

  test("a search with no match shows the empty row, and clearing it brings the list back", async ({ page }) => {
    const settings = new SuperPowerUsersPage(page);
    await settings.gotoSection();

    await settings.searchBox.fill("nobody");
    await expect(settings.noAccessRow).toBeVisible();

    await settings.searchBox.fill("");
    await expect(settings.tenantAccess.row("e2e.member@example.test")).toBeVisible();
    await expect(settings.noAccessRow).toHaveCount(0);
  });

  test("only searches the selected tenant's rows", async ({ page }) => {
    const settings = new SuperPowerUsersPage(page);
    await settings.gotoSection();

    await settings.searchBox.fill("partner");

    await expect(settings.noAccessRow).toBeVisible();
  });
});

test.describe("add", () => {
  test("posts the tenant guid and email, toasts, clears the field and lists the user", async ({ page, mockApi }) => {
    const settings = new SuperPowerUsersPage(page);
    const toast = new Toast(page);
    await settings.gotoSection();

    await settings.tenantAccess.add("person@example.test");

    await toast.expectShown("Tenant access added");
    expect(mockApi.requestsTo("POST", ACCESS_PATH).map((request) => request.body)).toEqual([
      { tenantGuid: TENANT_A.guid, email: "person@example.test" },
    ]);
    await expect(settings.tenantAccess.emailInput).toHaveValue("");
    await expect(settings.tenantAccess.row("person@example.test")).toBeVisible();
  });

  test("adds to the tenant selected in the header, not the first one", async ({ page, mockApi }) => {
    const settings = new SuperPowerUsersPage(page);
    const header = new HeaderPage(page);
    await settings.gotoSection();
    await header.selectTenant(TENANT_B.name);
    await expect(settings.tenantAccess.row("e2e.partner@example.test")).toBeVisible();

    await settings.tenantAccess.add("person@example.test");

    await expect(settings.tenantAccess.row("person@example.test")).toBeVisible();
    expect(mockApi.requestsTo("POST", ACCESS_PATH).map((request) => request.body)).toEqual([
      { tenantGuid: TENANT_B.guid, email: "person@example.test" },
    ]);
  });

  test("adding an email that already has access is a success and adds no second row", async ({ page, mockApi }) => {
    const settings = new SuperPowerUsersPage(page);
    const toast = new Toast(page);
    await settings.gotoSection();

    await settings.tenantAccess.add("e2e.member@example.test");

    await toast.expectShown("Tenant access added");
    // Wait for the list refetch that follows the add before counting rows (load, then add).
    await expect.poll(() => mockApi.requestsTo("GET", ACCESS_PATH).length).toBe(2);
    await expect(settings.tenantAccess.root.getByRole("row")).toHaveCount(3);
  });

  test("an empty or invalid email is rejected without a request", async ({ page, mockApi }) => {
    const settings = new SuperPowerUsersPage(page);
    await settings.gotoSection();

    await settings.tenantAccess.addButton.click();
    await expect(settings.tenantAccess.validationMessage).toHaveText("Enter an email address");

    await settings.tenantAccess.add("not-an-email");
    await expect(settings.tenantAccess.validationMessage).toHaveText("Enter a valid email address");
    expect(mockApi.requestsTo("POST", ACCESS_PATH)).toHaveLength(0);
  });

  test.describe("failures", () => {
    test.use({ allowedConsoleErrors: [EXPECTED_FAILURES] });

    test("a tenant the server no longer knows shows the friendly message", async ({ page, mockApi }) => {
      mockApi.on("POST", ACCESS_PATH, () => errorReply(400, ["TenantGuid", "WKFLOMD1604"]));
      const settings = new SuperPowerUsersPage(page);
      const toast = new Toast(page);
      await settings.gotoSection();

      await settings.tenantAccess.add("person@example.test");

      await toast.expectShown("Couldn't add tenant access: That workspace could not be found. Please contact Support.");
      await expect(settings.tenantAccess.emailInput).toHaveValue("person@example.test");
    });
  });
});

test.describe("remove", () => {
  test("asks first, names the tenant, then deletes the row", async ({ page, mockApi }) => {
    const settings = new SuperPowerUsersPage(page);
    const toast = new Toast(page);
    await settings.gotoSection();

    await settings.tenantAccess.removeButton("e2e.member@example.test").click();
    await settings.tenantAccess.removeDialog.expectText(`e2e.member@example.test will no longer be able to switch to ${TENANT_A.name}.`);
    expect(mockApi.requestsTo("DELETE", `${ACCESS_PATH}/:id`)).toHaveLength(0);
    await settings.tenantAccess.removeDialog.confirm("Remove");

    await toast.expectShown("Tenant access removed");
    expect(mockApi.requestsTo("DELETE", `${ACCESS_PATH}/1`)).toHaveLength(1);
    await expect(settings.tenantAccess.row("e2e.member@example.test")).toHaveCount(0);
    await expect(settings.tenantAccess.row("e2e.reviewer@example.test")).toBeVisible();
  });

  test("Cancel keeps the row", async ({ page, mockApi }) => {
    const settings = new SuperPowerUsersPage(page);
    await settings.gotoSection();

    await settings.tenantAccess.removeButton("e2e.member@example.test").click();
    await settings.tenantAccess.removeDialog.cancel();

    await settings.tenantAccess.removeDialog.expectClosed();
    expect(mockApi.requestsTo("DELETE", `${ACCESS_PATH}/:id`)).toHaveLength(0);
    await expect(settings.tenantAccess.row("e2e.member@example.test")).toBeVisible();
  });

  test.describe("failures", () => {
    test.use({ allowedConsoleErrors: [EXPECTED_FAILURES] });

    test("a row someone else already removed is a 404 with no error code", async ({ page }) => {
      const settings = new SuperPowerUsersPage(page);
      const toast = new Toast(page);
      await settings.gotoSection();
      await expect(settings.tenantAccess.row("e2e.member@example.test")).toBeVisible();
      store.tenantAccess.splice(0, 1);

      await settings.tenantAccess.remove("e2e.member@example.test");

      await toast.expectShown(/Couldn't remove tenant access: .*"resultType":4.* \(HTTP 404\)/);
    });
  });
});

test("adding refetches the access list", async ({ page, mockApi }) => {
  const settings = new SuperPowerUsersPage(page);
  await settings.gotoSection();
  const before = mockApi.requestsTo("GET", ACCESS_PATH).length;

  await settings.tenantAccess.add("person@example.test");

  await expect.poll(() => mockApi.requestsTo("GET", ACCESS_PATH).length).toBeGreaterThan(before);
});
