import { expect, test } from "../../support/test";
import { AiModelsPage } from "../../pages/ai-models/ai-models.page";
import { Toast } from "../../pages/components/toast";
import { installAiModelsMocks, lastBody, MODEL_IDS } from "../../support/mocks/ai-models";

// The browser logs every non-2xx response as a console error; the error-path tests mock 400 on purpose.
const FAILED_REQUEST_LOG = /Failed to load resource: the server responded with a status of 400/;

const CREATE = "/md/api/v1/ai-model";
const UPDATE = "/md/api/v1/ai-model/:id";

test.beforeEach(({ mockApi }) => installAiModelsMocks(mockApi));

test.describe("Add model", () => {
  test("the Add Model button opens an empty dialog that defaults to Azure OpenAI", async ({ page }) => {
    const models = new AiModelsPage(page);
    await models.goto();
    await models.openAdd();

    await expect(models.dialog.getByRole("heading", { name: "Add New Model" })).toBeVisible();
    await expect(models.nameInput).toHaveValue("");
    await expect(models.modelInput).toHaveValue("");
    await expect(models.typeSelect).toHaveText("");
    await expect(models.activeSwitchInDialog).toBeChecked();
    await expect(models.dialog).toContainText("This model is active");
    // resetForm() starts the dialog on Azure, so the Azure-only fields are shown.
    await expect(models.providerSelect).toHaveText("Azure OpenAI");
    await expect(models.authSelect).toHaveText("API Key");
    await expect(models.endpointInput).toBeVisible();
    await expect(models.deploymentInput).toBeVisible();
    await expect(models.apiVersionInput).toBeVisible();
    await expect(models.saveButton).toHaveText("Save Model");
  });

  test("Add First Model on the empty state opens the dialog on OpenAI instead", async ({ page, mockApi }) => {
    installAiModelsMocks(mockApi, { models: [] });
    const models = new AiModelsPage(page);
    await models.goto();

    await page.getByRole("button", { name: "Add First Model" }).click();

    // Known bug: see US 8186 item 74 (Add Model resets the form to Azure, Add First Model keeps the initial OpenAI).
    await expect(models.providerSelect).toHaveText("OpenAI");
    await expect(models.endpointInput).toHaveCount(0);
  });

  test("the linked secret choices are the active, unused secrets, plus None", async ({ page }) => {
    const models = new AiModelsPage(page);
    await models.goto();
    await models.openAdd();

    await models.secretSelect.click();

    await expect(page.getByRole("option")).toHaveText(["None", "E2E Key Three", "E2E Key Four"]);
  });

  test("an OpenAI model hides the Azure fields and posts what was entered", async ({ page, mockApi }) => {
    const models = new AiModelsPage(page);
    const toast = new Toast(page);
    await models.goto();
    await models.openAdd();

    await models.choose(models.providerSelect, "OpenAI");
    await expect(models.endpointInput).toHaveCount(0);
    await expect(models.deploymentInput).toHaveCount(0);
    await expect(models.apiVersionInput).toHaveCount(0);
    await expect(models.authSelect).toHaveCount(0);
    await models.nameInput.fill("E2E Fresh Model");
    await models.modelInput.fill("e2e-fresh");
    await models.choose(models.typeSelect, "Vision");
    await models.choose(models.secretSelect, "E2E Key Three");
    await models.saveButton.click();

    await toast.expectShown("Model Created");
    await expect(models.dialog).toBeHidden();
    expect(lastBody(mockApi, "POST", CREATE)).toEqual({
      name: "E2E Fresh Model",
      provider: "openai",
      endpoint: "",
      deploymentName: "",
      model: "e2e-fresh",
      apiVersion: "",
      type: "vision",
      secretId: 3,
      authMode: "apiKey",
      isActive: true,
    });
    await expect(models.cardTitle("E2E Fresh Model")).toBeVisible();
    await expect(models.card("E2E Fresh Model")).toContainText("Type: vision");
  });

  test("the other providers post their own provider value", async ({ page, mockApi }) => {
    const models = new AiModelsPage(page);
    await models.goto();

    for (const [label, value] of [["Google AI", "google"], ["Anthropic", "anthropic"]] as const) {
      await models.openAdd();
      await models.choose(models.providerSelect, label);
      await models.nameInput.fill(`E2E ${label}`);
      await models.modelInput.fill(`e2e-${value}`);
      await models.choose(models.typeSelect, "Text");
      await models.saveButton.click();
      await expect(models.cardTitle(`E2E ${label}`)).toBeVisible();
      expect(lastBody(mockApi, "POST", CREATE)).toMatchObject({ provider: value, model: `e2e-${value}`, type: "text", secretId: null });
    }
  });

  test("an Azure model with an API key posts the endpoint, deployment, version and secret", async ({ page, mockApi }) => {
    const models = new AiModelsPage(page);
    await models.goto();
    await models.openAdd();

    await models.nameInput.fill("E2E Azure Fresh");
    await models.choose(models.secretSelect, "E2E Key Four");
    await models.endpointInput.fill("https://e2e-fresh.example.test/");
    await models.deploymentInput.fill("e2e-fresh-deployment");
    await models.modelInput.fill("e2e-azure-fresh");
    await models.apiVersionInput.fill("2025-01-01");
    await models.choose(models.typeSelect, "Reasoning");
    await models.activeSwitchInDialog.click();
    await expect(models.dialog).toContainText("This model is inactive");
    await models.saveButton.click();

    await expect(models.cardTitle("E2E Azure Fresh")).toBeVisible();
    expect(lastBody(mockApi, "POST", CREATE)).toEqual({
      name: "E2E Azure Fresh",
      provider: "azure",
      endpoint: "https://e2e-fresh.example.test/",
      deploymentName: "e2e-fresh-deployment",
      model: "e2e-azure-fresh",
      apiVersion: "2025-01-01",
      type: "reasoning",
      secretId: 4,
      authMode: "apiKey",
      isActive: false,
    });
    await expect(models.card("E2E Azure Fresh")).toContainText("Endpoint: https://e2e-fresh.example.test/");
    await expect(models.card("E2E Azure Fresh")).toContainText("API Key");
    await expect(models.activeSwitch("E2E Azure Fresh")).not.toBeChecked();
  });

  test("Azure Managed Identity hides the linked secret and posts no secret", async ({ page, mockApi }) => {
    const models = new AiModelsPage(page);
    await models.goto();
    await models.openAdd();

    await models.choose(models.authSelect, "Azure Managed Identity");

    await expect(models.secretSelect).toHaveCount(0);
    await expect(models.dialog).toContainText("Not required");
    await models.nameInput.fill("E2E Identity Fresh");
    await models.endpointInput.fill("https://e2e-identity-fresh.example.test/");
    await models.deploymentInput.fill("e2e-identity-deployment");
    await models.modelInput.fill("e2e-identity-fresh");
    await models.apiVersionInput.fill("2025-01-01");
    await models.choose(models.typeSelect, "Chat");
    await models.saveButton.click();

    await expect(models.cardTitle("E2E Identity Fresh")).toBeVisible();
    expect(lastBody(mockApi, "POST", CREATE)).toMatchObject({ authMode: "managedIdentity", secretId: null });
    await expect(models.card("E2E Identity Fresh")).toContainText("Managed Identity");
  });

  test("switching to Managed Identity forgets the chosen secret", async ({ page }) => {
    const models = new AiModelsPage(page);
    await models.goto();
    await models.openAdd();
    await models.choose(models.secretSelect, "E2E Key Three");
    await expect(models.secretSelect).toHaveText("E2E Key Three");

    await models.choose(models.authSelect, "Azure Managed Identity");
    await models.choose(models.authSelect, "API Key");

    await expect(models.secretSelect).toHaveText("Select a secret to link (optional)");
  });

  test.describe("validation", () => {
    test("the browser blocks an empty required field and nothing is posted", async ({ page, mockApi }) => {
      const models = new AiModelsPage(page);
      await models.goto();
      await models.openAdd();
      await models.choose(models.providerSelect, "OpenAI");

      await models.saveButton.click();

      await expect(models.dialog).toBeVisible();
      expect(await models.nameInput.evaluate((input: HTMLInputElement) => input.validity.valueMissing)).toBe(true);
      expect(mockApi.requestsTo("POST", CREATE)).toHaveLength(0);
    });

    test("Azure with an API key and no secret is stopped with a Secret Required toast", async ({ page, mockApi }) => {
      const models = new AiModelsPage(page);
      const toast = new Toast(page);
      await models.goto();
      await models.openAdd();
      await models.nameInput.fill("E2E No Secret");
      await models.endpointInput.fill("https://e2e-nosecret.example.test/");
      await models.deploymentInput.fill("e2e-deployment");
      await models.modelInput.fill("e2e-nosecret");
      await models.apiVersionInput.fill("2025-01-01");
      await models.choose(models.typeSelect, "Chat");

      await models.saveButton.click();

      await toast.expectShown("Secret Required");
      await toast.expectShown("Please select a linked secret, or switch to Managed Identity authentication.");
      await expect(models.dialog).toBeVisible();
      expect(mockApi.requestsTo("POST", CREATE)).toHaveLength(0);
    });

    test.describe("rejected by the server", () => {
      test.use({ allowedConsoleErrors: [FAILED_REQUEST_LOG] });

      test("a model without a Type is rejected: the Type is required but only the server checks it", async ({ page, mockApi }) => {
        const models = new AiModelsPage(page);
        const toast = new Toast(page);
        await models.goto();
        await models.openAdd();
        await models.choose(models.providerSelect, "OpenAI");
        await models.nameInput.fill("E2E No Type");
        await models.modelInput.fill("e2e-no-type");

        await models.saveButton.click();

        // Known bug: see US 8186 item 73 (the "Type *" field has no client-side validation, the user only sees the raw server error).
        await toast.expectShown("Error Creating Model");
        await toast.expectShown(/"code":"WKFLOMD0002"/);
        await toast.expectShown(/"property":"Type"/);
        await expect(models.dialog).toBeVisible();
        expect(mockApi.requestsTo("POST", CREATE)).toHaveLength(1);
      });

      test("Managed Identity left over from Azure is rejected after switching to OpenAI", async ({ page }) => {
        const models = new AiModelsPage(page);
        const toast = new Toast(page);
        await models.goto();
        await models.openAdd();
        await models.choose(models.authSelect, "Azure Managed Identity");
        await models.choose(models.providerSelect, "OpenAI");
        await models.nameInput.fill("E2E Leftover Auth");
        await models.modelInput.fill("e2e-leftover");
        await models.choose(models.typeSelect, "Chat");
        // The Linked Secret field is back, but the hidden auth mode is still Managed Identity.
        await expect(models.secretSelect).toBeVisible();

        await models.saveButton.click();

        // Known bug: see US 8186 item 75 (a provider change does not reset the auth mode; the server answers WKFLOMD0504 as raw JSON).
        await toast.expectShown("Error Creating Model");
        await toast.expectShown(/"code":"WKFLOMD0504"/);
        await expect(models.dialog).toBeVisible();
      });

      test("a name over 300 characters is rejected by the server and the dialog keeps the entered values", async ({ page, mockApi }) => {
        // CreateAIModelCommand.Name is [MaxLength(300)] and the form has no maxlength of its own.
        const longName = "E".repeat(301);
        const models = new AiModelsPage(page);
        const toast = new Toast(page);
        await models.goto();
        await models.openAdd();
        await models.choose(models.providerSelect, "OpenAI");
        await models.nameInput.fill(longName);
        await models.modelInput.fill("e2e-too-long");
        await models.choose(models.typeSelect, "Chat");

        await models.saveButton.click();

        await toast.expectShown("Error Creating Model");
        await toast.expectShown(/"code":"WKFLOMD0004"/);
        await expect(models.dialog).toBeVisible();
        await expect(models.nameInput).toHaveValue(longName);
        await expect(models.saveButton).toBeEnabled();
        await expect(models.cardTitle(longName)).toHaveCount(0);
      });
    });
  });

  test("Cancel closes the dialog without saving, and the next Add starts empty", async ({ page, mockApi }) => {
    const models = new AiModelsPage(page);
    await models.goto();
    await models.openAdd();
    await models.nameInput.fill("E2E Abandoned");

    await models.cancelButton.click();

    await expect(models.dialog).toBeHidden();
    expect(mockApi.requestsTo("POST", CREATE)).toHaveLength(0);
    await models.openAdd();
    await expect(models.nameInput).toHaveValue("");
  });

  test("a secret taken by a new model is still offered to the next Add until an Edit refreshes the list", async ({ page, mockApi }) => {
    const models = new AiModelsPage(page);
    await models.goto();
    await models.openAdd();
    await models.choose(models.providerSelect, "OpenAI");
    await models.nameInput.fill("E2E Secret Taker");
    await models.modelInput.fill("e2e-taker");
    await models.choose(models.typeSelect, "Chat");
    await models.choose(models.secretSelect, "E2E Key Three");
    await models.saveButton.click();
    await expect(models.cardTitle("E2E Secret Taker")).toBeVisible();

    await models.openAdd();
    await models.secretSelect.click();

    // Known bug: see US 8186 item 72 (GET /secrets/available has an infinite stale time and is only invalidated
    // when Edit opens, so Key Three, which now belongs to a model, is still offered).
    await expect(page.getByRole("option")).toHaveText(["None", "E2E Key Three", "E2E Key Four"]);
    expect(mockApi.requestsTo("GET", "/md/api/v1/secrets/available")).toHaveLength(1);
  });
});

test.describe("Edit model", () => {
  test("the dialog is filled from the model and the button says Update Model", async ({ page }) => {
    const models = new AiModelsPage(page);
    await models.goto();

    await models.editButton("E2E Azure Key Model").click();

    await expect(models.dialog.getByRole("heading", { name: "Edit Model" })).toBeVisible();
    await expect(models.nameInput).toHaveValue("E2E Azure Key Model");
    await expect(models.providerSelect).toHaveText("Azure OpenAI");
    await expect(models.authSelect).toHaveText("API Key");
    await expect(models.endpointInput).toHaveValue("https://e2e-endpoint.example.test/");
    await expect(models.deploymentInput).toHaveValue("e2e-deployment");
    await expect(models.modelInput).toHaveValue("e2e-azure-gpt");
    await expect(models.apiVersionInput).toHaveValue("2024-01-01");
    await expect(models.typeSelect).toHaveText("Text");
    await expect(models.activeSwitchInDialog).toBeChecked();
    // The model's own secret is not "available" any more, it comes from GET /secret/:id.
    await expect(models.secretSelect).toHaveText("E2E Key Two");
    await expect(models.saveButton).toHaveText("Update Model");
  });

  test("a Managed Identity model shows no secret and its inactive state", async ({ page }) => {
    const models = new AiModelsPage(page);
    await models.goto();

    await models.editButton("E2E Azure Identity Model").click();

    await expect(models.authSelect).toHaveText("Azure Managed Identity");
    await expect(models.secretSelect).toHaveCount(0);
    await expect(models.activeSwitchInDialog).not.toBeChecked();
    await expect(models.dialog).toContainText("This model is inactive");
  });

  test("the secret choices include the model's own secret and the unused ones", async ({ page }) => {
    const models = new AiModelsPage(page);
    await models.goto();
    await models.editButton("E2E OpenAI Model").click();

    await models.secretSelect.click();

    await expect(page.getByRole("option")).toHaveText(["None", "E2E Key One", "E2E Key Three", "E2E Key Four"]);
  });

  test("saving changes puts the model's id in the URL and the form in the body", async ({ page, mockApi }) => {
    const models = new AiModelsPage(page);
    const toast = new Toast(page);
    await models.goto();
    await models.editButton("E2E OpenAI Model").click();

    await models.nameInput.fill("E2E OpenAI Renamed");
    await models.modelInput.fill("e2e-gpt-2");
    await models.choose(models.typeSelect, "Analytics");
    await models.choose(models.secretSelect, "E2E Key Three");
    await models.activeSwitchInDialog.click();
    await models.saveButton.click();

    await toast.expectShown("Model Updated");
    await expect(models.dialog).toBeHidden();
    const request = mockApi.requestsTo("PUT", UPDATE).at(-1)!;
    expect(request.path).toBe(`/md/api/v1/ai-model/${MODEL_IDS.openai}`);
    expect(request.body).toEqual({
      name: "E2E OpenAI Renamed",
      provider: "openai",
      endpoint: null,
      deploymentName: null,
      model: "e2e-gpt-2",
      apiVersion: null,
      type: "analytics",
      secretId: 3,
      authMode: "apiKey",
      isActive: false,
    });
    await expect(models.cardTitle("E2E OpenAI Renamed")).toBeVisible();
    await expect(models.cardTitle("E2E OpenAI Model")).toHaveCount(0);
    await expect(models.card("E2E OpenAI Renamed")).toContainText("Model: e2e-gpt-2");
    await expect(models.card("E2E OpenAI Renamed")).toContainText("Type: analytics");
    await expect(models.activeSwitch("E2E OpenAI Renamed")).not.toBeChecked();
  });

  test("choosing None unlinks the secret of a non-Azure model", async ({ page, mockApi }) => {
    const models = new AiModelsPage(page);
    await models.goto();
    await models.editButton("E2E OpenAI Model").click();

    await models.choose(models.secretSelect, "None");
    await models.saveButton.click();

    await expect(models.dialog).toBeHidden();
    expect(lastBody(mockApi, "PUT", UPDATE)).toMatchObject({ secretId: null });
    // The freed secret is offered again.
    await models.editButton("E2E Azure Key Model").click();
    await models.secretSelect.click();
    await expect(page.getByRole("option", { name: "E2E Key One" })).toBeVisible();
  });

  test("an Azure model cannot be saved after its secret is removed by switching auth and back", async ({ page, mockApi }) => {
    const models = new AiModelsPage(page);
    const toast = new Toast(page);
    await models.goto();
    await models.editButton("E2E Azure Key Model").click();

    await models.choose(models.authSelect, "Azure Managed Identity");
    await models.choose(models.authSelect, "API Key");
    await models.saveButton.click();

    await toast.expectShown("Secret Required");
    expect(mockApi.requestsTo("PUT", UPDATE)).toHaveLength(0);
  });

  test("Cancel leaves the model untouched", async ({ page, mockApi }) => {
    const models = new AiModelsPage(page);
    await models.goto();
    await models.editButton("E2E OpenAI Model").click();
    await models.nameInput.fill("E2E Not Saved");

    await models.cancelButton.click();

    await expect(models.dialog).toBeHidden();
    await expect(models.cardTitle("E2E OpenAI Model")).toBeVisible();
    expect(mockApi.requestsTo("PUT", UPDATE)).toHaveLength(0);
  });

  test.describe("rejected by the server", () => {
    test.use({ allowedConsoleErrors: [FAILED_REQUEST_LOG] });

    test("shows the raw error and keeps the dialog open", async ({ page, mockApi }) => {
      const store = installAiModelsMocks(mockApi);
      const models = new AiModelsPage(page);
      const toast = new Toast(page);
      await models.goto();
      await models.editButton("E2E OpenAI Model").click();
      // Another admin deletes the model while the dialog is open: the update validator answers 0502.
      store.models[0].isDeleted = true;

      await models.nameInput.fill("E2E Rejected");
      await models.saveButton.click();

      await toast.expectShown("Error Updating Model");
      await toast.expectShown(/"code":"WKFLOMD0502"/);
      await expect(models.dialog).toBeVisible();
      await expect(models.nameInput).toHaveValue("E2E Rejected");
      await models.cancelButton.click();
      await expect(models.cardTitle("E2E OpenAI Model")).toBeVisible();
    });
  });
});
