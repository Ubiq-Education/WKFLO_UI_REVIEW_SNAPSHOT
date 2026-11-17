import { expect, test } from "../../support/test";
import { VaultPage } from "../../pages/vault/vault.page";
import { Toast } from "../../pages/components/toast";
import { FAKE_KEYS, installVaultMocks, SECRET_IDS } from "../../support/mocks/vault";

// The browser logs every non-2xx response as a console error; the error-path tests mock a 400 on purpose.
const FAILED_REQUEST_LOG = /Failed to load resource: the server responded with a status of 400/;

const PRIMARY = "e2e_primary";
const DORMANT = "e2e_dormant";
const NEW_KEY = "e2e-fake-new-key-9999";

test.describe("Vault: add and edit", () => {
  test.describe("add", () => {
    test("the dialog opens with empty fields, a masked key input and the active switch on", async ({ page, mockApi }) => {
      installVaultMocks(mockApi);
      const vault = new VaultPage(page);
      await vault.goto();

      await vault.addButton.click();

      await expect(vault.dialog.getByRole("heading", { name: "Add New API Key" })).toBeVisible();
      await expect(vault.nameInput).toHaveValue("");
      await expect(vault.apiKeyInput).toHaveValue("");
      await expect(vault.apiKeyInput).toHaveAttribute("type", "password");
      await expect(vault.activeSwitch).toBeChecked();
      await expect(vault.dialog.getByText("This API key is active and usable")).toBeVisible();
      await expect(vault.saveButton()).toHaveText("Save API Key");
    });

    test("saving posts the name, key and active flag, closes the dialog and lists the new secret", async ({ page, mockApi }) => {
      const store = installVaultMocks(mockApi);
      const toast = new Toast(page);
      const vault = new VaultPage(page);
      await vault.goto();

      await vault.addButton.click();
      await vault.nameInput.fill("e2e_new");
      await vault.apiKeyInput.fill(NEW_KEY);
      await vault.saveButton().click();

      await toast.expectShown("Secret Created");
      await expect(vault.dialog).toHaveCount(0);
      await expect(vault.cardHeading("e2e_new")).toBeVisible();
      await expect(vault.card("e2e_new")).toContainText("{{secrets_e2e_new}}");
      await expect(vault.keyText("e2e_new")).toHaveText("e2e-••••••••9999");
      const posts = mockApi.requestsTo("POST", "/md/api/v1/secret");
      expect(posts).toHaveLength(1);
      expect(posts[0].body).toEqual({ name: "e2e_new", apiKey: NEW_KEY, isActive: true });
      expect(store.secrets.map((secret) => secret.name)).toContain("e2e_new");
    });

    test("switching Active off before saving creates an inactive secret", async ({ page, mockApi }) => {
      installVaultMocks(mockApi);
      const vault = new VaultPage(page);
      await vault.goto();

      await vault.addButton.click();
      await vault.activeSwitch.click();
      await expect(vault.dialog.getByText("This API key is inactive")).toBeVisible();
      await vault.nameInput.fill("e2e_off");
      await vault.apiKeyInput.fill(NEW_KEY);
      await vault.saveButton().click();

      await expect(vault.activeToggle("e2e_off")).not.toBeChecked();
      expect(mockApi.requestsTo("POST", "/md/api/v1/secret")[0].body).toEqual({ name: "e2e_off", apiKey: NEW_KEY, isActive: false });
    });

    test("Cancel closes the dialog without a request, and reopening starts empty", async ({ page, mockApi }) => {
      installVaultMocks(mockApi);
      const vault = new VaultPage(page);
      await vault.goto();

      await vault.addButton.click();
      await vault.nameInput.fill("e2e_draft");
      await vault.cancelButton.click();
      await expect(vault.dialog).toHaveCount(0);

      await vault.addButton.click();
      await expect(vault.nameInput).toHaveValue("");
      expect(mockApi.requestsTo("POST", "/md/api/v1/secret")).toHaveLength(0);
    });

    test("an empty form cannot be submitted: the browser's required check blocks the request", async ({ page, mockApi }) => {
      installVaultMocks(mockApi);
      const vault = new VaultPage(page);
      await vault.goto();

      await vault.addButton.click();
      await vault.saveButton().click();
      await expect(vault.dialog).toBeVisible();
      await expect(vault.nameInput).toHaveJSProperty("validity.valueMissing", true);
      expect(mockApi.requestsTo("POST", "/md/api/v1/secret")).toHaveLength(0);

      // Filling only the name still leaves the key missing.
      await vault.nameInput.fill("e2e_half");
      await vault.saveButton().click();
      await expect(vault.apiKeyInput).toHaveJSProperty("validity.valueMissing", true);
      expect(mockApi.requestsTo("POST", "/md/api/v1/secret")).toHaveLength(0);

      await vault.apiKeyInput.fill(NEW_KEY);
      await vault.saveButton().click();
      await expect(vault.cardHeading("e2e_half")).toBeVisible();
      expect(mockApi.requestsTo("POST", "/md/api/v1/secret")).toHaveLength(1);
    });

    test.describe("server validation", () => {
      test.use({ allowedConsoleErrors: [FAILED_REQUEST_LOG] });

      test("a whitespace-only name passes the browser check but the API rejects it, and the dialog stays open", async ({ page, mockApi }) => {
        installVaultMocks(mockApi);
        const toast = new Toast(page);
        const vault = new VaultPage(page);
        await vault.goto();

        await vault.addButton.click();
        await vault.nameInput.fill("   ");
        await vault.apiKeyInput.fill(NEW_KEY);
        await vault.saveButton().click();

        await toast.expectShown("Error Creating Secret");
        // Known bug: see US 8186 item 59. The description is the raw response text, not a friendly message.
        await toast.expectShown(/"code":"WKFLOMD0002","property":"Name"/);
        await expect(vault.dialog).toBeVisible();
        await expect(vault.nameInput).toHaveValue("   ");
        await expect(vault.saveButton()).toHaveText("Save API Key");
      });

      test("a name over 500 characters is rejected with the maximum-length code", async ({ page, mockApi }) => {
        installVaultMocks(mockApi);
        const toast = new Toast(page);
        const vault = new VaultPage(page);
        await vault.goto();

        await vault.addButton.click();
        await vault.nameInput.fill("n".repeat(501));
        await vault.apiKeyInput.fill(NEW_KEY);
        await vault.saveButton().click();

        await toast.expectShown("Error Creating Secret");
        await toast.expectShown(/"code":"WKFLOMD0004","property":"Name"/);
        await expect(vault.dialog).toBeVisible();
        expect(mockApi.requestsTo("POST", "/md/api/v1/secret")).toHaveLength(1);
      });

      test("whitespace in both fields lists both errors, name first", async ({ page, mockApi }) => {
        installVaultMocks(mockApi);
        const toast = new Toast(page);
        const vault = new VaultPage(page);
        await vault.goto();

        await vault.addButton.click();
        await vault.nameInput.fill(" ");
        await vault.apiKeyInput.fill(" ");
        await vault.saveButton().click();

        await toast.expectShown(/"code":"WKFLOMD0002","property":"Name"\},\{"code":"WKFLOMD0002","property":"ApiKey"/);
      });
    });
  });

  test.describe("edit", () => {
    test("the pencil opens the dialog filled with the secret", async ({ page, mockApi }) => {
      installVaultMocks(mockApi);
      const vault = new VaultPage(page);
      await vault.goto();

      await vault.editButton(DORMANT).click();

      await expect(vault.dialog.getByRole("heading", { name: "Edit API Key" })).toBeVisible();
      await expect(vault.nameInput).toHaveValue(DORMANT);
      await expect(vault.activeSwitch).not.toBeChecked();
      await expect(vault.saveButton()).toHaveText("Update API Key");
      // Known bug: see US 8186 item 66. The code comment says the key is not pre-filled "for security reasons"
      // and the dialog says to leave it blank to keep it, but the field is pre-filled with the stored key.
      await expect(vault.apiKeyInput).toHaveValue(FAKE_KEYS.inactive);
      await expect(vault.dialog.getByText("Leave the API Key field blank to keep the existing value.")).toBeVisible();
    });

    test("saving a new name puts the whole secret and updates the card", async ({ page, mockApi }) => {
      const store = installVaultMocks(mockApi);
      const toast = new Toast(page);
      const vault = new VaultPage(page);
      await vault.goto();

      await vault.editButton(PRIMARY).click();
      await vault.nameInput.fill("e2e_renamed");
      await vault.saveButton().click();

      await toast.expectShown("Secret Updated");
      await expect(vault.dialog).toHaveCount(0);
      await expect(vault.cardHeading("e2e_renamed")).toBeVisible();
      await expect(vault.cardHeading(PRIMARY)).toHaveCount(0);
      const puts = mockApi.requestsTo("PUT", "/md/api/v1/secret/:id");
      expect(puts.map((request) => request.path)).toEqual([`/md/api/v1/secret/${SECRET_IDS.long}`]);
      expect(puts[0].body).toEqual({ name: "e2e_renamed", apiKey: FAKE_KEYS.long, isActive: true });
      expect(store.secrets[0].name).toBe("e2e_renamed");
    });

    test("typing a new key replaces the stored one", async ({ page, mockApi }) => {
      const store = installVaultMocks(mockApi);
      const vault = new VaultPage(page);
      await vault.goto();

      await vault.editButton(PRIMARY).click();
      await vault.apiKeyInput.fill(NEW_KEY);
      await vault.saveButton().click();

      await expect(vault.dialog).toHaveCount(0);
      await vault.revealButton(PRIMARY).click();
      await expect(vault.keyText(PRIMARY)).toHaveText(NEW_KEY);
      expect(store.secrets[0].apiKey).toBe(NEW_KEY);
    });

    test("the dialog's Active switch changes the flag that is saved", async ({ page, mockApi }) => {
      const store = installVaultMocks(mockApi);
      const vault = new VaultPage(page);
      await vault.goto();

      await vault.editButton(DORMANT).click();
      await vault.activeSwitch.click();
      await vault.saveButton().click();

      await expect(vault.activeToggle(DORMANT)).toBeChecked();
      expect(mockApi.requestsTo("PUT", "/md/api/v1/secret/:id")[0].body).toMatchObject({ isActive: true });
      expect(store.secrets[2].isActive).toBe(true);
    });

    test("Cancel keeps the secret unchanged, and Add API Key afterwards starts from an empty form", async ({ page, mockApi }) => {
      installVaultMocks(mockApi);
      const vault = new VaultPage(page);
      await vault.goto();

      await vault.editButton(PRIMARY).click();
      await vault.nameInput.fill("e2e_unsaved");
      await vault.cancelButton.click();
      await expect(vault.dialog).toHaveCount(0);
      await expect(vault.cardHeading(PRIMARY)).toBeVisible();

      await vault.addButton.click();
      await expect(vault.dialog.getByRole("heading", { name: "Add New API Key" })).toBeVisible();
      await expect(vault.nameInput).toHaveValue("");
      await expect(vault.apiKeyInput).toHaveValue("");
      await expect(vault.activeSwitch).toBeChecked();
      expect(mockApi.requestsTo("PUT", "/md/api/v1/secret/:id")).toHaveLength(0);
    });

    test.describe("server validation", () => {
      test.use({ allowedConsoleErrors: [FAILED_REQUEST_LOG] });

      test("clearing the key sends no apiKey and the API rejects it, although the dialog says blank keeps the value", async ({ page, mockApi }) => {
        installVaultMocks(mockApi);
        const toast = new Toast(page);
        const vault = new VaultPage(page);
        await vault.goto();

        await vault.editButton(PRIMARY).click();
        await vault.apiKeyInput.fill("");
        await vault.saveButton().click();

        await toast.expectShown("Error Updating Secret");
        // Known bug: see US 8186 item 67. The mock answers WKFLOMD0002 for the missing ApiKey; that backend behaviour
        // is verified by code reading (UpdateSecretCommand mapping has no IgnoreNullValues); not run against a live API.
        await toast.expectShown(/"code":"WKFLOMD0002","property":"ApiKey"/);
        const puts = mockApi.requestsTo("PUT", "/md/api/v1/secret/:id");
        expect(puts).toHaveLength(1);
        expect(puts[0].body).toEqual({ name: PRIMARY, isActive: true });
        await expect(vault.dialog).toBeVisible();
      });

      test("editing a secret deleted elsewhere shows the raw not-found validation error", async ({ page, mockApi }) => {
        const store = installVaultMocks(mockApi);
        const toast = new Toast(page);
        const vault = new VaultPage(page);
        await vault.goto();
        await expect(vault.cardHeading(PRIMARY)).toBeVisible();
        store.secrets[0].isDeleted = true;

        await vault.editButton(PRIMARY).click();
        await vault.nameInput.fill("e2e_ghost");
        await vault.saveButton().click();

        await toast.expectShown("Error Updating Secret");
        await toast.expectShown(/"code":"WKFLOMD0602","property":"Secret"/);
        await expect(vault.dialog).toBeVisible();
      });
    });
  });
});
