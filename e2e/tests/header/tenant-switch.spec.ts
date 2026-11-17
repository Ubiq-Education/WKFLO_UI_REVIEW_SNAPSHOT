import { expect, test } from "../../support/test";
import { HeaderPage } from "../../pages/header/header.page";
import { GeneralSettingsPage } from "../../pages/settings/settings.page";
import { TENANT_A, TENANT_B } from "../../support/fixtures";
import { installTenantScopedAgents, TENANT_B_AGENT_NAME } from "../../support/mocks/header";
import { installSettingsMocks } from "../../support/mocks/settings";
import { unexpectedReply } from "../../support/mocks/marketplace";

const TENANT_STORAGE_KEY = "wkflo.tenantGuid";

const storedTenant = (page: import("@playwright/test").Page) =>
  page.evaluate((key) => window.localStorage.getItem(key), TENANT_STORAGE_KEY);

test.describe("super power user", () => {
  test("the combobox is labelled Tenant: and starts on the first tenant", async ({ page }) => {
    const header = new HeaderPage(page);
    await page.goto("/");
    await header.layout.expectSignedIn();

    await expect(page.getByLabel("Tenant:")).toHaveText(TENANT_A.name);
    await expect(header.tenantCombobox).toHaveText(TENANT_A.name);
    expect(await storedTenant(page)).toBe(TENANT_A.guid);
  });

  test("lists every tenant, with the current one checked", async ({ page }) => {
    const header = new HeaderPage(page);
    await page.goto("/");
    await header.layout.expectSignedIn();

    await header.open();

    await expect(page.getByRole("option")).toHaveText([TENANT_A.name, TENANT_B.name]);
    // The check mark is an icon that is only visible on the current tenant's option.
    await expect(header.option(TENANT_A.name).locator("svg.opacity-100")).toHaveCount(1);
    await expect(header.option(TENANT_B.name).locator("svg.opacity-100")).toHaveCount(0);
  });

  test("choosing a tenant updates the combobox and remembers the choice", async ({ page }) => {
    const header = new HeaderPage(page);
    await page.goto("/");
    await header.layout.expectSignedIn();

    await header.selectTenant(TENANT_B.name);

    expect(await storedTenant(page)).toBe(TENANT_B.guid);
    await expect(header.tenantSearch).toBeHidden();
  });

  test("the search box filters the tenants, and an unknown name says so", async ({ page }) => {
    const header = new HeaderPage(page);
    await page.goto("/");
    await header.layout.expectSignedIn();
    await header.open();

    await header.tenantSearch.fill("Tenant B");
    await expect(page.getByRole("option")).toHaveText([TENANT_B.name]);

    await header.tenantSearch.fill("zzz");
    await expect(header.noTenantsText).toBeVisible();
    await expect(page.getByRole("option")).toHaveCount(0);
  });

  test("switching tenants refetches the page's data for the new tenant", async ({ page, mockApi }) => {
    const scoped = installTenantScopedAgents(mockApi);
    const header = new HeaderPage(page);
    await page.goto("/agents");
    await header.layout.expectSignedIn();
    await expect(page.getByText("E2E Support Agent", { exact: true })).toBeVisible();
    await expect(page.getByText(TENANT_B_AGENT_NAME)).toHaveCount(0);
    expect(scoped.agentListTenants).toEqual([TENANT_A.guid]);

    await header.selectTenant(TENANT_B.name);

    await expect(page.getByText(TENANT_B_AGENT_NAME, { exact: true })).toBeVisible();
    await expect(page.getByText("E2E Support Agent")).toHaveCount(0);
    expect(scoped.agentListTenants).toEqual([TENANT_A.guid, TENANT_B.guid]);
  });

  test("switching back shows the first tenant's data again, from the per-tenant cache", async ({ page, mockApi }) => {
    const scoped = installTenantScopedAgents(mockApi);
    const header = new HeaderPage(page);
    await page.goto("/agents");
    await header.layout.expectSignedIn();
    await header.selectTenant(TENANT_B.name);
    await expect(page.getByText(TENANT_B_AGENT_NAME, { exact: true })).toBeVisible();

    await header.selectTenant(TENANT_A.name);

    await expect(page.getByText("E2E Support Agent", { exact: true })).toBeVisible();
    await expect(page.getByText(TENANT_B_AGENT_NAME)).toHaveCount(0);
    // The query key includes the tenant and the default staleTime is Infinity, so the first tenant's list is
    // served from the cache: no third request.
    expect(scoped.agentListTenants).toEqual([TENANT_A.guid, TENANT_B.guid]);
  });

  test("the settings page loads the new tenant's settings", async ({ page, mockApi }) => {
    installSettingsMocks(mockApi);
    const header = new HeaderPage(page);
    const settings = new GeneralSettingsPage(page);
    await settings.gotoGeneral();
    await expect(settings.timeZone).toHaveText(/Europe\/London/);
    await expect(settings.twelveHour).toBeChecked();

    await header.selectTenant(TENANT_B.name);

    await expect(settings.timeZone).toHaveText(/\(GMT\+00:00\) UTC/);
    await expect(settings.twentyFourHour).toBeChecked();
    await expect(settings.saveButton).toBeDisabled();
  });

  test("the chosen tenant survives a reload and is the one the API is asked about", async ({ page, mockApi }) => {
    const scoped = installTenantScopedAgents(mockApi);
    const header = new HeaderPage(page);
    await page.goto("/agents");
    await header.layout.expectSignedIn();
    await header.selectTenant(TENANT_B.name);
    await expect(page.getByText(TENANT_B_AGENT_NAME, { exact: true })).toBeVisible();

    await page.reload();

    await header.layout.expectSignedIn();
    await expect(header.tenantCombobox).toHaveText(TENANT_B.name);
    await expect(page.getByText(TENANT_B_AGENT_NAME, { exact: true })).toBeVisible();
    expect(scoped.agentListTenants.at(-1)).toBe(TENANT_B.guid);
  });
});

test.describe("standard user", () => {
  test.use({ isSuperPowerUser: false });

  test("only sees the tenants they have access to", async ({ page, mockApi }) => {
    mockApi.on("GET", "/md/api/v1/me/permissions", () => ({ isSuperPowerUser: false, accessibleTenantGuids: [TENANT_B.guid] }));
    const header = new HeaderPage(page);
    await page.goto("/");
    await header.layout.expectSignedIn();

    await expect(header.tenantCombobox).toHaveText(TENANT_B.name);
    await header.open();
    await expect(page.getByRole("option")).toHaveText([TENANT_B.name]);
  });

  test("a stored tenant they can no longer access is replaced by the first allowed one", async ({ page, mockApi }) => {
    mockApi.on("GET", "/md/api/v1/me/permissions", () => ({ isSuperPowerUser: false, accessibleTenantGuids: [TENANT_B.guid] }));
    await page.addInitScript(
      ([key, guid]) => window.localStorage.setItem(key, guid),
      [TENANT_STORAGE_KEY, TENANT_A.guid],
    );
    const header = new HeaderPage(page);
    await page.goto("/");
    await header.layout.expectSignedIn();

    await expect(header.tenantCombobox).toHaveText(TENANT_B.name);
    await expect.poll(() => storedTenant(page)).toBe(TENANT_B.guid);
  });

  test("with no tenant access the header and the page say no workspace is available, and no tenant data is requested", async ({
    page,
    mockApi,
  }) => {
    mockApi.on("GET", "/md/api/v1/me/permissions", () => ({ isSuperPowerUser: false, accessibleTenantGuids: [] }));
    const header = new HeaderPage(page);
    await page.addInitScript(
      ([key, guid]) => window.localStorage.setItem(key, guid),
      [TENANT_STORAGE_KEY, TENANT_A.guid],
    );
    await page.goto("/agents");

    await expect(header.noWorkspacesMessage).toHaveText("No workspaces are available. Please contact Support.");
    await expect(header.layout.noWorkspacesMessage).toHaveText("No workspaces are available. Please contact Support.");
    await expect(header.tenantCombobox).toHaveCount(0);
    await expect.poll(() => storedTenant(page)).toBeNull();
    expect(mockApi.requestsTo("GET", "/md/api/v1/tenant/agents")).toHaveLength(0);
  });
});

test.describe("when the tenant list cannot be loaded", () => {
  test.use({ allowedConsoleErrors: [/Failed to load resource: the server responded with a status of 500|Failed to fetch tenants/] });

  test("the combobox stays on its placeholder with no options", async ({ page, mockApi }) => {
    mockApi.on("GET", "/md/api/v1/tenants", () => unexpectedReply());
    const header = new HeaderPage(page);
    await page.goto("/");
    await expect(header.layout.greeting).toBeVisible();

    await expect(header.tenantCombobox).toHaveText("Select a tenant");
    await header.open();
    await expect(header.noTenantsText).toBeVisible();
  });
});
