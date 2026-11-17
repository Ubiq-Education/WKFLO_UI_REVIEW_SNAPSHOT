import { expect, test } from "../../support/test";
import { VaultPage } from "../../pages/vault/vault.page";
import { Toast } from "../../pages/components/toast";
import { errorReply, FAKE_KEYS, installVaultMocks, SECRET_IDS } from "../../support/mocks/vault";

// The browser logs every non-2xx response as a console error; the error-path tests mock a 400 on purpose.
const FAILED_REQUEST_LOG = /Failed to load resource: the server responded with a status of 400/;

const PRIMARY = "e2e_primary";
const SHORT = "e2e_short";
const DORMANT = "e2e_dormant";
const MASK = "••••••••";

test.describe("Vault: list", () => {
  test("shows a card per secret with its template, masked key and creation date", async ({ page, mockApi }) => {
    installVaultMocks(mockApi);
    const vault = new VaultPage(page);
    await vault.goto();

    for (const name of [PRIMARY, SHORT, DORMANT]) await expect(vault.cardHeading(name)).toBeVisible();
    await expect(vault.card(PRIMARY)).toContainText("{{secrets_e2e_primary}}");
    await expect(vault.card(PRIMARY)).toContainText(/Created: \S+/);
    // Longer than 8 characters: first four and last four stay visible.
    await expect(vault.keyText(PRIMARY)).toHaveText(`e2e-${MASK}wxyz`);
    // 8 characters or fewer: fully masked.
    await expect(vault.keyText(SHORT)).toHaveText(MASK);
    await expect(vault.activeToggle(PRIMARY)).toBeChecked();
    await expect(vault.activeToggle(DORMANT)).not.toBeChecked();
    // Inactive secrets are dimmed.
    await expect(vault.card(DORMANT)).toHaveClass(/opacity-70/);
    await expect(vault.card(PRIMARY)).not.toHaveClass(/opacity-70/);
  });

  test("the list holds every key in clear text while the card only shows the masked value", async ({ page, mockApi }) => {
    installVaultMocks(mockApi);
    const vault = new VaultPage(page);
    // The list response is the only place the key travels; capture it from the wire.
    const listResponse = page.waitForResponse((r) => r.url().endsWith("/md/api/v1/secrets"));
    await vault.goto();
    const body = (await (await listResponse).json()) as { data: Array<{ apiKey: string }> };

    expect(body.data.map((secret) => secret.apiKey)).toContain(FAKE_KEYS.long);
    await expect(page.getByText(FAKE_KEYS.long)).toHaveCount(0);
  });

  test("shows an empty state whose button opens the add dialog", async ({ page, mockApi }) => {
    installVaultMocks(mockApi, { secrets: [] });
    const vault = new VaultPage(page);
    await vault.goto();

    await expect(vault.emptyMessage).toBeVisible();
    await page.getByRole("button", { name: "Add First API Key" }).click();
    await expect(vault.dialog).toBeVisible();
    await expect(vault.dialog.getByRole("heading", { name: "Add New API Key" })).toBeVisible();
  });

  test.describe("search", () => {
    test("filters the cards by name, case-insensitively, and shows a message when nothing matches", async ({ page, mockApi }) => {
      installVaultMocks(mockApi);
      const vault = new VaultPage(page);
      await vault.goto();

      await vault.searchBox.fill("PRIM");
      await expect(vault.cardHeading(PRIMARY)).toBeVisible();
      await expect(vault.cardHeading(SHORT)).toHaveCount(0);
      await expect(vault.cardHeading(DORMANT)).toHaveCount(0);

      await vault.searchBox.fill("no such key");
      await expect(vault.noMatchMessage).toBeVisible();
      // The vault is not empty, so the empty-state text must not show.
      await expect(vault.emptyMessage).toHaveCount(0);

      await vault.searchBox.fill("");
      for (const name of [PRIMARY, SHORT, DORMANT]) await expect(vault.cardHeading(name)).toBeVisible();
    });

    test("matches the name only, not the key value", async ({ page, mockApi }) => {
      installVaultMocks(mockApi);
      const vault = new VaultPage(page);
      await vault.goto();

      await vault.searchBox.fill("fake-key-0001");

      await expect(vault.noMatchMessage).toBeVisible();
      await expect(vault.cardHeading(PRIMARY)).toHaveCount(0);
    });
  });

  test("the view toggle switches between a multi-column grid and a single-column list", async ({ page, mockApi }) => {
    installVaultMocks(mockApi);
    const vault = new VaultPage(page);
    await vault.goto();

    const container = page.locator("div.grid").filter({ has: vault.cardHeading(PRIMARY) });
    await expect(container).toHaveClass(/md:grid-cols-2/);

    await vault.listViewButton.click();
    await expect(page.locator("div.grid").filter({ has: vault.cardHeading(PRIMARY) })).toHaveCount(0);
    await expect(vault.card(PRIMARY)).toHaveClass(/w-full/);

    await vault.gridViewButton.click();
    await expect(container).toHaveClass(/md:grid-cols-2/);
  });

  test.describe("reveal", () => {
    test("the eye button shows the whole key and hides it again, without another API call", async ({ page, mockApi }) => {
      installVaultMocks(mockApi);
      const vault = new VaultPage(page);
      await vault.goto();
      await expect(vault.cardHeading(PRIMARY)).toBeVisible();
      const callsBefore = mockApi.requests.length;

      await vault.revealButton(PRIMARY).click();
      await expect(vault.keyText(PRIMARY)).toHaveText(FAKE_KEYS.long);
      // Only the clicked card is revealed.
      await expect(vault.keyText(SHORT)).toHaveText(MASK);

      await vault.hideButton(PRIMARY).click();
      await expect(vault.keyText(PRIMARY)).toHaveText(`e2e-${MASK}wxyz`);
      expect(mockApi.requests).toHaveLength(callsBefore);
    });

    test("a short key is revealed in full too", async ({ page, mockApi }) => {
      installVaultMocks(mockApi);
      const vault = new VaultPage(page);
      await vault.goto();

      await vault.revealButton(SHORT).click();

      await expect(vault.keyText(SHORT)).toHaveText(FAKE_KEYS.short);
    });
  });

  test.describe("active toggle", () => {
    test("switching a secret off saves the whole secret with isActive false", async ({ page, mockApi }) => {
      const store = installVaultMocks(mockApi);
      const toast = new Toast(page);
      const vault = new VaultPage(page);
      await vault.goto();

      await vault.activeToggle(PRIMARY).click();

      await toast.expectShown("Secret Updated");
      await expect(vault.activeToggle(PRIMARY)).not.toBeChecked();
      await expect(vault.card(PRIMARY)).toHaveClass(/opacity-70/);
      const puts = mockApi.requestsTo("PUT", "/md/api/v1/secret/:id");
      expect(puts.map((request) => request.path)).toEqual([`/md/api/v1/secret/${SECRET_IDS.long}`]);
      // The toggle re-sends the key in clear text, the update endpoint requires it.
      expect(puts[0].body).toMatchObject({ id: SECRET_IDS.long, name: PRIMARY, apiKey: FAKE_KEYS.long, isActive: false });
      expect(store.secrets.find((secret) => secret.id === SECRET_IDS.long)?.isActive).toBe(false);
    });

    test("switching an inactive secret on saves isActive true", async ({ page, mockApi }) => {
      const store = installVaultMocks(mockApi);
      const vault = new VaultPage(page);
      await vault.goto();

      await vault.activeToggle(DORMANT).click();

      await expect(vault.activeToggle(DORMANT)).toBeChecked();
      await expect(vault.card(DORMANT)).not.toHaveClass(/opacity-70/);
      expect(store.secrets.find((secret) => secret.id === SECRET_IDS.inactive)?.isActive).toBe(true);
    });

    test.describe("failure", () => {
      test.use({ allowedConsoleErrors: [FAILED_REQUEST_LOG] });

      test("a rejected save shows a toast with the raw response and leaves the switch where it was", async ({ page, mockApi }) => {
        const store = installVaultMocks(mockApi);
        const toast = new Toast(page);
        const vault = new VaultPage(page);
        await vault.goto();
        await expect(vault.cardHeading(PRIMARY)).toBeVisible();
        // The secret was deleted in another session: BeExistingSecret answers WKFLOMD0602.
        store.secrets[0].isDeleted = true;

        await vault.activeToggle(PRIMARY).click();

        await toast.expectShown("Error Updating Secret");
        // Known bug: see US 8186 item 59. The description is the raw response text, not a friendly message.
        await toast.expectShown(/"code":"WKFLOMD0602"/);
        await expect(vault.activeToggle(PRIMARY)).toBeChecked();
      });
    });
  });

  test.describe("delete", () => {
    test("confirming deletes the secret, shows a toast and removes the card", async ({ page, mockApi }) => {
      installVaultMocks(mockApi);
      const toast = new Toast(page);
      const vault = new VaultPage(page);
      await vault.goto();

      await vault.deleteButton(SHORT).click();
      await vault.deleteDialog.expectVisible();
      await vault.deleteDialog.expectText("Are you sure you want to delete this API key?");
      await vault.deleteDialog.confirm("Delete");

      await toast.expectShown("Secret Deleted");
      await expect(vault.cardHeading(SHORT)).toHaveCount(0);
      await expect(vault.cardHeading(PRIMARY)).toBeVisible();
      expect(mockApi.requestsTo("DELETE", "/md/api/v1/secret/:id").map((request) => request.path)).toEqual([
        `/md/api/v1/secret/${SECRET_IDS.short}`,
      ]);
    });

    test("cancelling closes the dialog and keeps the secret", async ({ page, mockApi }) => {
      installVaultMocks(mockApi);
      const vault = new VaultPage(page);
      await vault.goto();

      await vault.deleteButton(SHORT).click();
      await vault.deleteDialog.cancel();

      await vault.deleteDialog.expectClosed();
      await expect(vault.cardHeading(SHORT)).toBeVisible();
      expect(mockApi.requestsTo("DELETE", "/md/api/v1/secret/:id")).toHaveLength(0);
    });

    test("deleting the last secret leaves the empty state", async ({ page, mockApi }) => {
      const store = installVaultMocks(mockApi);
      store.secrets.splice(1);
      const vault = new VaultPage(page);
      await vault.goto();

      await vault.deleteButton(PRIMARY).click();
      await vault.deleteDialog.confirm("Delete");

      await expect(vault.emptyMessage).toBeVisible();
    });

    test.describe("failure", () => {
      test.use({ allowedConsoleErrors: [FAILED_REQUEST_LOG] });

      test("a secret that is already gone shows a toast with the raw response and the card stays", async ({ page, mockApi }) => {
        const store = installVaultMocks(mockApi);
        const toast = new Toast(page);
        const vault = new VaultPage(page);
        await vault.goto();
        await expect(vault.cardHeading(SHORT)).toBeVisible();
        store.secrets[1].isDeleted = true;

        await vault.deleteButton(SHORT).click();
        await vault.deleteDialog.confirm("Delete");

        await toast.expectShown("Error Deleting Secret");
        // Known bug: see US 8186 item 59. The description is the raw response text, not a friendly message.
        await toast.expectShown(/"code":"WKFLOMD0602"/);
        // Known bug: see US 8186 item 68. The list is not refreshed after the failure, so the stale card stays.
        await expect(vault.cardHeading(SHORT)).toBeVisible();
      });
    });
  });

  test.describe("standard user", () => {
    test.use({ isSuperPowerUser: false });

    test("is redirected home and the vault API is never called", async ({ page, mockApi }) => {
      installVaultMocks(mockApi);
      await page.goto("/vault");

      await expect(page).toHaveURL((url) => url.pathname === "/");
      await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
      expect(mockApi.requestsTo("GET", "/md/api/v1/secrets")).toHaveLength(0);
    });
  });

  test("a super power user reaches the vault page", async ({ page, mockApi }) => {
    installVaultMocks(mockApi);
    const vault = new VaultPage(page);
    await vault.goto();

    await expect(page).toHaveURL((url) => url.pathname === "/vault");
    await expect.poll(() => mockApi.requestsTo("GET", "/md/api/v1/secrets").length).toBe(1);
  });
});

test.describe("Vault: load failure", () => {
  test.use({ allowedConsoleErrors: [/Failed to load resource: the server responded with a status of 500/] });

  test("a failed list shows the empty state", async ({ page, mockApi }) => {
    installVaultMocks(mockApi);
    mockApi.on("GET", "/md/api/v1/secrets", () => errorReply(500, ["", "WKFLO0001"]));
    const vault = new VaultPage(page);
    await vault.goto();

    // Known bug: see US 8186 item 58. A failed list is indistinguishable from an empty vault, no error is shown.
    await expect(vault.emptyMessage).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
  });
});
