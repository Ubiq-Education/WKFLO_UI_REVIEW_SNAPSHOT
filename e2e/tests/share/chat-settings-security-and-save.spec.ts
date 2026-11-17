import { expect, test } from "../../support/test";
import { TENANT_A } from "../../support/fixtures";
import { SharePage } from "../../pages/share/share-page";
import { FAKE_API_KEY, failShareRequest, installSharePagesMocks, SHARE_PATHS, waitForSave } from "../../support/mocks/share-pages";

type Mock = Parameters<typeof waitForSave>[0];

async function save(share: SharePage, mockApi: Mock) {
  const before = mockApi.requestsTo("PUT", SHARE_PATHS.save).length;
  await share.panel.saveButton.click();
  return waitForSave(mockApi, before);
}

test.describe("authentication types", () => {
  test("None sends no security details", async ({ page, mockApi }) => {
    installSharePagesMocks(mockApi);
    const share = new SharePage(page, "chat-ui");
    await share.goto();

    const body = await save(share, mockApi);

    expect(body.securityConfiguration).toEqual({ type: "none" });
  });

  test("Azure AD shows its fields and saves them, splitting the scopes on commas", async ({ page, mockApi }) => {
    installSharePagesMocks(mockApi);
    const share = new SharePage(page, "chat-ui");
    await share.goto();

    await share.panel.choose(share.panel.authType, "Azure AD");
    await page.getByRole("textbox", { name: "Client ID" }).fill("e2e-client-id");
    await page.getByRole("textbox", { name: "Tenant ID" }).fill("e2e-tenant-id");
    await page.getByRole("textbox", { name: "Scopes" }).fill("api://e2e/read, api://e2e/write");

    const body = await save(share, mockApi);
    expect(body.securityConfiguration).toEqual({
      type: "azure-ad",
      azureAd: { clientId: "e2e-client-id", tenantId: "e2e-tenant-id", scopes: ["api://e2e/read", "api://e2e/write"] },
    });
  });

  test("JWT Token Callback saves the allowed domains", async ({ page, mockApi }) => {
    installSharePagesMocks(mockApi);
    const share = new SharePage(page, "chat-ui");
    await share.goto();

    await share.panel.choose(share.panel.authType, "JWT Token Callback");
    await page.getByRole("textbox", { name: "Allowed Domains" }).fill("example.test, app.example.test");

    const body = await save(share, mockApi);
    expect(body.securityConfiguration).toEqual({ type: "jwt-token-callback", jwt: { domains: ["example.test", "app.example.test"] } });
  });

  test("switching the type swaps the visible settings", async ({ page, mockApi }) => {
    installSharePagesMocks(mockApi);
    const share = new SharePage(page, "chat-ui");
    await share.goto();

    await share.panel.choose(share.panel.authType, "Azure AD");
    await expect(page.getByText("Azure AD Settings")).toBeVisible();
    await share.panel.choose(share.panel.authType, "API Key");
    await expect(page.getByText("API Key Settings")).toBeVisible();
    await expect(page.getByText("Azure AD Settings")).toHaveCount(0);
    await share.panel.choose(share.panel.authType, "JWT Token Callback");
    await expect(page.getByText("JWT Token Callback Settings")).toBeVisible();
    await share.panel.choose(share.panel.authType, "None");
    await expect(page.getByText("JWT Token Callback Settings")).toHaveCount(0);
  });

  test("loads a saved Azure AD configuration into the fields", async ({ page, mockApi }) => {
    installSharePagesMocks(mockApi, {
      setting: { securityConfiguration: { type: "azure-ad", azureAd: { clientId: "saved-client", tenantId: "saved-tenant", scopes: ["a", "b"] } } },
    });
    const share = new SharePage(page, "chat-ui");
    await share.goto();

    await expect(share.panel.authType).toContainText("Azure AD");
    await expect(page.getByRole("textbox", { name: "Client ID" })).toHaveValue("saved-client");
    await expect(page.getByRole("textbox", { name: "Tenant ID" })).toHaveValue("saved-tenant");
    await expect(page.getByRole("textbox", { name: "Scopes" })).toHaveValue("a,b");
  });
});

test.describe("API key authentication", () => {
  test("generates a 100-character alphanumeric key, can show and hide it, and saves it with the tenant name", async ({ page, mockApi }) => {
    installSharePagesMocks(mockApi);
    const share = new SharePage(page, "chat-ui");
    await share.goto();
    await share.panel.choose(share.panel.authType, "API Key");
    const keyField = page.getByLabel("API Key Value", { exact: true });
    await expect(keyField).toHaveAttribute("type", "password");
    // The tenant name is read-only and comes from the selected tenant.
    const tenantName = page.getByRole("textbox", { name: "Tenant Name" });
    await expect(tenantName).toHaveValue(TENANT_A.name);
    await expect(tenantName).toHaveAttribute("readonly", "");

    await page.getByRole("button", { name: "Generate 100-character API key" }).click();

    await share.toast.expectShown("A new 100-character API key has been generated");
    const key = await keyField.inputValue();
    expect(key).toMatch(/^[A-Za-z0-9]{100}$/);

    await page.getByRole("button", { name: "Show API key" }).click();
    await expect(keyField).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: "Hide API key" }).click();
    await expect(keyField).toHaveAttribute("type", "password");

    await page.getByRole("textbox", { name: "Tenant Domains" }).fill("example.test, app.example.test");
    const body = await save(share, mockApi);
    expect(body.securityConfiguration).toEqual({
      type: "api-key",
      apiKey: { value: key, tenantName: TENANT_A.name, tenantDomains: ["example.test", "app.example.test"] },
    });
  });

  test("a typed key is saved as it is", async ({ page, mockApi }) => {
    installSharePagesMocks(mockApi);
    const share = new SharePage(page, "chat-ui");
    await share.goto();
    await share.panel.choose(share.panel.authType, "API Key");

    await page.getByLabel("API Key Value", { exact: true }).fill(FAKE_API_KEY);

    const body = await save(share, mockApi);
    expect(body.securityConfiguration).toMatchObject({ type: "api-key", apiKey: { value: FAKE_API_KEY, tenantName: TENANT_A.name } });
  });

  test("blocks saving without a key and marks the field", async ({ page, mockApi }) => {
    installSharePagesMocks(mockApi);
    const share = new SharePage(page, "chat-ui");
    await share.goto();
    await share.panel.choose(share.panel.authType, "API Key");

    await share.panel.saveButton.click();

    await share.toast.expectShown("API Key Value is required when using API Key authentication.");
    await expect(page.getByText("API Key Value is required", { exact: true })).toBeVisible();
    expect(mockApi.requestsTo("PUT", SHARE_PATHS.save)).toHaveLength(0);
  });

  test("a whitespace-only key counts as missing", async ({ page, mockApi }) => {
    installSharePagesMocks(mockApi);
    const share = new SharePage(page, "chat-ui");
    await share.goto();
    await share.panel.choose(share.panel.authType, "API Key");
    await page.getByLabel("API Key Value", { exact: true }).fill("   ");

    await share.panel.saveButton.click();

    await share.toast.expectShown("API Key Value is required when using API Key authentication.");
    expect(mockApi.requestsTo("PUT", SHARE_PATHS.save)).toHaveLength(0);
  });
});

test.describe("saving", () => {
  test("sends the whole panel state in the PUT body for the Chat UI page", async ({ page, mockApi }) => {
    installSharePagesMocks(mockApi);
    const share = new SharePage(page, "chat-ui");
    await share.goto();

    const body = await save(share, mockApi);

    expect(body).toEqual({
      headerTitle: "",
      primaryColor: "#3b82f6",
      foregroundColor: "#ffffff",
      bubbleStyle: "rounded",
      floatingPosition: "right",
      launcherStyle: "circle",
      launcherText: "",
      showDescription: true,
      chainOfThought: false,
      apiEndpoint: "https://api.e2e.test",
      isWidget: false,
      securityConfiguration: { type: "none" },
      bubbleIconPath: undefined,
      chatbotIconPath: undefined,
      cssUrl: undefined,
      welcomeMessage: "Welcome to the E2E assistant.",
      footerMessage: "E2E footer message.",
      predefinedPrompts: [],
    });
    expect(mockApi.requestsTo("PUT", SHARE_PATHS.save)[0].url).toBe("/md/api/v1/tenant/agent/1/chat-setting");
  });

  test("marks the PUT as a widget save on the widget page", async ({ page, mockApi }) => {
    installSharePagesMocks(mockApi);
    const share = new SharePage(page, "chat-widget");
    await share.goto();

    expect(await save(share, mockApi)).toMatchObject({ isWidget: true });
  });

  test("shows a success toast and refetches the setting for the page's own kind", async ({ page, mockApi }) => {
    installSharePagesMocks(mockApi);
    const share = new SharePage(page, "chat-widget");
    await share.goto();
    const before = mockApi.requestsTo("GET", SHARE_PATHS.get).length;

    await share.panel.headerTitle.fill("Saved title");
    await share.panel.saveButton.click();

    await share.toast.expectShown("Settings Saved");
    await expect.poll(() => mockApi.requestsTo("GET", SHARE_PATHS.get).length).toBeGreaterThan(before);
    const refetch = mockApi.requestsTo("GET", SHARE_PATHS.get).at(-1);
    expect(refetch?.path).toBe("/md/api/v1/tenant/agent/1/chat-setting/widget");
    await expect(share.panel.headerTitle).toHaveValue("Saved title");
  });

  for (const kind of ["chat-ui", "chat-widget"] as const) {
    test(`${kind}: the panel's "Settings Saved" toast is replaced by the page's second one`, async ({ page, mockApi }) => {
      installSharePagesMocks(mockApi);
      const share = new SharePage(page, kind);
      await share.goto();

      await share.panel.saveButton.click();

      // Known bug: see US 8186 item 5. The panel and the page each raise a "Settings Saved" toast, and only
      // one toast shows at a time, so the page's message wins and the panel's never stays on screen.
      const pageMessage = kind === "chat-ui" ? "Chat UI settings have been updated successfully" : "Chat widget settings have been updated successfully";
      await share.toast.expectShown(pageMessage);
      await share.toast.expectNotShown("Chat settings have been saved successfully");
    });
  }

  for (const kind of ["chat-ui", "chat-widget"] as const) {
    test(`${kind}: ignores the share id returned by the save because it reads the raw response envelope`, async ({ page, mockApi }) => {
      installSharePagesMocks(mockApi, { isShareable: true });
      // The save answers with a share id that the GET never serves.
      mockApi.on("PUT", SHARE_PATHS.save, () => ({ shareId: "e2e-share-from-save" }));
      const share = new SharePage(page, kind);
      await share.goto();
      const before = await share.snippet.inputValue();

      await share.panel.saveButton.click();
      await expect.poll(() => mockApi.requestsTo("PUT", SHARE_PATHS.save).length).toBe(1);
      await share.toast.expectShown("Settings Saved");

      // Known bug: see US 8186 item 5. onSave gets the `{ data }` envelope, so result.shareId is undefined
      // and the page never adopts the returned share id: the snippet stays exactly as it was.
      await expect(share.snippet).toHaveValue(before);
      expect(before).not.toContain("e2e-share-from-save");
    });
  }

  test.describe("when the API rejects the save", () => {
    test.use({ allowedConsoleErrors: [/Failed to load resource|Error saving chat settings/] });

    test("shows a Save Failed toast and no success toast", async ({ page, mockApi }) => {
      installSharePagesMocks(mockApi);
      failShareRequest(mockApi, "save", "WKFLO0001", 500);
      const share = new SharePage(page, "chat-ui");
      await share.goto();

      await share.panel.saveButton.click();

      await share.toast.expectShown("Failed to save setting: An unexpected error occurred. Please try again later.");
      await share.toast.expectNotShown("Settings Saved");
      await expect(share.panel.saveButton).toBeEnabled();
    });
  });
});

test.describe("API endpoint validation", () => {
  test("an invalid URL blocks the save with a toast and an inline message", async ({ page, mockApi }) => {
    installSharePagesMocks(mockApi);
    const share = new SharePage(page, "chat-ui");
    await share.goto();

    await share.panel.apiEndpoint.fill("not a url");
    await share.panel.saveButton.click();

    await share.toast.expectShown("Please provide a valid URL for the API Endpoint");
    await expect(page.getByText("Please provide a valid URL (e.g., https://api.example.com)")).toBeVisible();
    expect(mockApi.requestsTo("PUT", SHARE_PATHS.save)).toHaveLength(0);
  });

  test("an empty endpoint is stopped by the browser's required check, so the app's own toast never shows", async ({ page, mockApi }) => {
    installSharePagesMocks(mockApi);
    const share = new SharePage(page, "chat-ui");
    await share.goto();

    await share.panel.apiEndpoint.fill("");
    await share.panel.saveButton.click();

    // Known bug: see US 8186 item 7. The native `required` fires first: the browser focuses the field and the
    // submit handler (with its "API Endpoint is required" toast and inline message) never runs.
    await expect(share.panel.apiEndpoint).toBeFocused();
    expect(await share.panel.apiEndpoint.evaluate((input: HTMLInputElement) => input.validity.valueMissing)).toBe(true);
    await share.toast.expectNotShown("API Endpoint is required");
    await expect(page.getByText("API Endpoint is required for chat functionality")).toHaveCount(0);
    expect(mockApi.requestsTo("PUT", SHARE_PATHS.save)).toHaveLength(0);
  });

  test("a whitespace-only endpoint gets past the browser check and shows the app's required toast", async ({ page, mockApi }) => {
    installSharePagesMocks(mockApi);
    const share = new SharePage(page, "chat-ui");
    await share.goto();

    await share.panel.apiEndpoint.fill("   ");
    await share.panel.saveButton.click();

    await share.toast.expectShown("API Endpoint is required. Please provide a valid API endpoint URL.");
    await expect(page.getByText("API Endpoint is required for chat functionality")).toBeVisible();
    expect(mockApi.requestsTo("PUT", SHARE_PATHS.save)).toHaveLength(0);
  });

  test("the endpoint is saved as typed", async ({ page, mockApi }) => {
    installSharePagesMocks(mockApi);
    const share = new SharePage(page, "chat-ui");
    await share.goto();

    await share.panel.apiEndpoint.fill("https://chat.e2e.test");

    expect(await save(share, mockApi)).toMatchObject({ apiEndpoint: "https://chat.e2e.test" });
  });
});
