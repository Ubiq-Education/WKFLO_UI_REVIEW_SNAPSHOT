import { expect, test } from "../../support/test";
import { AiModelsPage } from "../../pages/ai-models/ai-models.page";
import { Toast } from "../../pages/components/toast";
import { createModelFixtures, installAiModelsMocks, lastBody, MODEL_IDS, serverError } from "../../support/mocks/ai-models";
import { installAiCreditMocks } from "../../support/mocks/ai-credit";

// The browser logs every non-2xx response as a console error; the error-path tests mock 400 / 500 on purpose.
const FAILED_REQUEST_LOG = /Failed to load resource: the server responded with a status of (400|500)/;

const OPENAI = "E2E OpenAI Model";
const AZURE_KEY = "E2E Azure Key Model";
const AZURE_IDENTITY = "E2E Azure Identity Model";

test.describe("AI Models list", () => {
  test.beforeEach(({ mockApi }) => installAiModelsMocks(mockApi));

  test("shows one card per model with its provider, model and type", async ({ page }) => {
    const models = new AiModelsPage(page);
    await models.goto();

    await expect(models.cardTitle(OPENAI)).toBeVisible();
    await expect(models.cardTitle(AZURE_KEY)).toBeVisible();
    await expect(models.cardTitle(AZURE_IDENTITY)).toBeVisible();
    await expect(models.card(OPENAI)).toContainText("Provider: openai");
    await expect(models.card(OPENAI)).toContainText("Model: e2e-gpt");
    await expect(models.card(OPENAI)).toContainText("Type: chat");
    // Endpoint and the auth badge are Azure-only.
    await expect(models.card(OPENAI)).not.toContainText("Endpoint:");
    await expect(models.card(AZURE_KEY)).toContainText("Endpoint: https://e2e-endpoint.example.test/");
    await expect(models.card(AZURE_KEY)).toContainText("API Key");
    await expect(models.card(AZURE_IDENTITY)).toContainText("Managed Identity");
    await expect(models.card(OPENAI)).toContainText("Created:");
  });

  test("the active switches reflect each model's state", async ({ page }) => {
    const models = new AiModelsPage(page);
    await models.goto();

    await expect(models.activeSwitch(OPENAI)).toBeChecked();
    await expect(models.activeSwitch(AZURE_IDENTITY)).not.toBeChecked();
  });

  test("a card shows its tags, at most three, with a counter for the rest", async ({ page }) => {
    const models = new AiModelsPage(page);
    await models.goto();

    await expect(models.card(OPENAI)).toContainText("E2E Tag");
    await expect(models.card(AZURE_KEY)).not.toContainText("E2E Tag");
    // Model 3 has four tags: the first three are shown and "+1" stands for the fourth.
    await expect(models.card(AZURE_IDENTITY)).toContainText("E2E Tag");
    await expect(models.card(AZURE_IDENTITY)).toContainText("E2E Priority");
    await expect(models.card(AZURE_IDENTITY)).toContainText("E2E Archive");
    await expect(models.card(AZURE_IDENTITY)).not.toContainText("E2E Review");
    await expect(models.card(AZURE_IDENTITY)).toContainText("+1");
  });

  test.describe("search", () => {
    test("filters by name", async ({ page }) => {
      const models = new AiModelsPage(page);
      await models.goto();

      await models.searchBox.fill("identity");

      await expect(models.cardTitle(AZURE_IDENTITY)).toBeVisible();
      await expect(models.cardTitle(OPENAI)).toHaveCount(0);
      await expect(models.cardTitle(AZURE_KEY)).toHaveCount(0);
    });

    test("filters by provider", async ({ page }) => {
      const models = new AiModelsPage(page);
      await models.goto();

      await models.searchBox.fill("azure");

      await expect(models.cardTitle(AZURE_KEY)).toBeVisible();
      await expect(models.cardTitle(AZURE_IDENTITY)).toBeVisible();
      await expect(models.cardTitle(OPENAI)).toHaveCount(0);
    });

    test("shows a message when nothing matches and recovers when cleared", async ({ page }) => {
      const models = new AiModelsPage(page);
      await models.goto();

      await models.searchBox.fill("zzz-no-such-model");
      await expect(page.getByText("No models matching your search criteria.")).toBeVisible();
      await expect(models.cardTitle(OPENAI)).toHaveCount(0);

      await models.searchBox.fill("");
      await expect(models.cardTitle(OPENAI)).toBeVisible();
    });
  });

  test("the view toggles switch between a grid and a stacked list", async ({ page }) => {
    const models = new AiModelsPage(page);
    await models.goto();
    const box = async (name: string) => (await models.card(name).boundingBox())!;

    // Grid (default): the first two cards sit side by side.
    await expect(models.cardTitle(OPENAI)).toBeVisible();
    const gridFirst = await box(OPENAI);
    const gridSecond = await box(AZURE_KEY);
    expect(gridSecond.y).toBe(gridFirst.y);
    expect(gridSecond.x).toBeGreaterThan(gridFirst.x);
    await expect(models.gridViewButton).toHaveAttribute("aria-pressed", "true");
    await expect(models.listViewButton).toHaveAttribute("aria-pressed", "false");

    await models.listViewButton.click();
    await expect.poll(async () => (await box(AZURE_KEY)).y).toBeGreaterThan((await box(OPENAI)).y);
    expect((await box(AZURE_KEY)).x).toBe((await box(OPENAI)).x);
    await expect(models.listViewButton).toHaveAttribute("aria-pressed", "true");
    await expect(models.gridViewButton).toHaveAttribute("aria-pressed", "false");

    await models.gridViewButton.click();
    await expect.poll(async () => (await box(AZURE_KEY)).y).toBe((await box(OPENAI)).y);
    await expect(models.gridViewButton).toHaveAttribute("aria-pressed", "true");
  });

  test.describe("active switch", () => {
    test("turning a model off sends the whole model with isActive false and shows a toast", async ({ page, mockApi }) => {
      const models = new AiModelsPage(page);
      const toast = new Toast(page);
      await models.goto();

      await models.activeSwitch(OPENAI).click();

      await toast.expectShown("Model Updated");
      await expect(models.activeSwitch(OPENAI)).not.toBeChecked();
      expect(lastBody(mockApi, "PUT", "/md/api/v1/ai-model/:id")).toMatchObject({
        id: MODEL_IDS.openai,
        name: OPENAI,
        provider: "openai",
        model: "e2e-gpt",
        type: "chat",
        authMode: "apiKey",
        secretId: 1,
        isActive: false,
      });
      expect(mockApi.requestsTo("PUT", "/md/api/v1/ai-model/:id")[0].path).toBe(`/md/api/v1/ai-model/${MODEL_IDS.openai}`);
    });

    test("turning an inactive model on sends isActive true", async ({ page, mockApi }) => {
      const models = new AiModelsPage(page);
      await models.goto();

      await models.activeSwitch(AZURE_IDENTITY).click();

      await expect(models.activeSwitch(AZURE_IDENTITY)).toBeChecked();
      expect(lastBody(mockApi, "PUT", "/md/api/v1/ai-model/:id")).toMatchObject({ id: MODEL_IDS.azureIdentity, authMode: "managedIdentity", isActive: true });
    });

    test.describe("when the server rejects it", () => {
      test.use({ allowedConsoleErrors: [FAILED_REQUEST_LOG] });

      test("shows the raw error and leaves the switch as it was", async ({ page, mockApi }) => {
        const store = installAiModelsMocks(mockApi);
        const models = new AiModelsPage(page);
        const toast = new Toast(page);
        await models.goto();
        // goto() only waits for the page heading, so wait for the list itself before changing the
        // store; otherwise a slow first load could already leave the model out of the list.
        await expect(models.cardTitle(OPENAI)).toBeVisible();
        // Another admin deletes the model after the list was loaded: the update validator answers 0502.
        store.models[0].isDeleted = true;

        await models.activeSwitch(OPENAI).click();

        await toast.expectShown("Error Updating Model");
        await toast.expectShown(/"code":"WKFLOMD0502"/);
        await expect(models.activeSwitch(OPENAI)).toBeChecked();
      });
    });
  });

  test.describe("delete", () => {
    test("asks for confirmation and Cancel keeps the model", async ({ page, mockApi }) => {
      const models = new AiModelsPage(page);
      await models.goto();

      await models.deleteButton(OPENAI).click();
      await models.deleteDialog.expectVisible();
      await models.deleteDialog.expectText("Are you sure you want to delete this model?");
      await models.deleteDialog.cancel();

      await models.deleteDialog.expectClosed();
      await expect(models.cardTitle(OPENAI)).toBeVisible();
      expect(mockApi.requestsTo("DELETE", "/md/api/v1/ai-model/:id")).toHaveLength(0);
    });

    test("confirming deletes the model, shows a toast and removes the card", async ({ page, mockApi }) => {
      const models = new AiModelsPage(page);
      const toast = new Toast(page);
      await models.goto();

      await models.deleteButton(AZURE_KEY).click();
      await models.deleteDialog.confirm("Delete");

      await toast.expectShown("Model Deleted");
      await expect(models.cardTitle(AZURE_KEY)).toHaveCount(0);
      await expect(models.cardTitle(OPENAI)).toBeVisible();
      expect(mockApi.requestsTo("DELETE", "/md/api/v1/ai-model/:id").map((request) => request.path)).toEqual([
        `/md/api/v1/ai-model/${MODEL_IDS.azureKey}`,
      ]);
    });

    test("deleting the last model shows the empty state", async ({ page, mockApi }) => {
      installAiModelsMocks(mockApi, { models: [createModelFixtures()[0]] });
      const models = new AiModelsPage(page);
      await models.goto();

      await models.deleteButton(OPENAI).click();
      await models.deleteDialog.confirm("Delete");

      await expect(page.getByText("No AI models found. Add a model to get started.")).toBeVisible();
      await expect(models.cardTitle(OPENAI)).toHaveCount(0);
    });

    test.describe("when the server rejects it", () => {
      test.use({ allowedConsoleErrors: [FAILED_REQUEST_LOG] });

      test("shows the raw error and keeps the card", async ({ page, mockApi }) => {
        const store = installAiModelsMocks(mockApi);
        const models = new AiModelsPage(page);
        const toast = new Toast(page);
        await models.goto();
        // Same as the update case above: wait for the list before deleting the model behind its back.
        await expect(models.cardTitle(OPENAI)).toBeVisible();
        // Another admin already deleted the model: the delete validator answers 0502.
        store.models[0].isDeleted = true;

        await models.deleteButton(OPENAI).click();
        await models.deleteDialog.confirm("Delete");

        await toast.expectShown("Error Deleting Model");
        await toast.expectShown(/"code":"WKFLOMD0502"/);
        await expect(models.cardTitle(OPENAI)).toBeVisible();
      });
    });
  });

  test("the AI Credit button opens that model's credit page", async ({ page, mockApi }) => {
    installAiCreditMocks(mockApi);
    const models = new AiModelsPage(page);
    await models.goto();

    await models.aiCreditButton(OPENAI).click();

    await expect(page).toHaveURL((url) => url.pathname === `/aimodels/${MODEL_IDS.openai}/ai-credit`);
    await expect(page.getByRole("heading", { level: 1, name: "AI Credit Configuration" })).toBeVisible();
  });
});

test.describe("AI Models empty and failing list", () => {
  test("an empty list shows the empty state and Add First Model opens the dialog", async ({ page, mockApi }) => {
    installAiModelsMocks(mockApi, { models: [] });
    const models = new AiModelsPage(page);
    await models.goto();

    await expect(page.getByText("No AI models found. Add a model to get started.")).toBeVisible();
    await page.getByRole("button", { name: "Add First Model" }).click();
    await expect(models.dialog.getByRole("heading", { name: "Add New Model" })).toBeVisible();
  });

  test.describe("when the list fails to load", () => {
    test.use({ allowedConsoleErrors: [FAILED_REQUEST_LOG] });

    test("shows the empty state, as there is no error state", async ({ page, mockApi }) => {
      installAiModelsMocks(mockApi);
      mockApi.on("GET", "/md/api/v1/ai-models", () => serverError());
      const models = new AiModelsPage(page);
      await models.goto();

      await expect.poll(() => mockApi.requestsTo("GET", "/md/api/v1/ai-models").length).toBe(1);
      // Known bug: see US 8186 item 71 (a failed list load is shown as "No AI models found. Add a model to get started.").
      await expect(page.getByText("No AI models found. Add a model to get started.")).toBeVisible();
      await expect(page.getByText(/WKFLO0001/)).toHaveCount(0);
    });
  });
});

test.describe("access", () => {
  test.use({ isSuperPowerUser: false });

  test("a standard user is redirected away without the model list being requested", async ({ page, mockApi }) => {
    installAiModelsMocks(mockApi);
    await page.goto("/aimodels");

    await expect(page).toHaveURL((url) => url.pathname === "/");
    await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
    expect(mockApi.requestsTo("GET", "/md/api/v1/ai-models")).toHaveLength(0);
  });
});
