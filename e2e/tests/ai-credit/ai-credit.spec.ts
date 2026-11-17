import { expect, test } from "../../support/test";
import { AiCreditPage } from "../../pages/ai-credit/ai-credit.page";
import { Toast } from "../../pages/components/toast";
import { lastBody, MODEL_IDS, serverError } from "../../support/mocks/ai-models";
import { installAiCreditMocks } from "../../support/mocks/ai-credit";

// The browser logs every non-2xx response as a console error; these tests mock 400 / 404 / 500 on purpose.
const FAILED_REQUEST_LOG = /Failed to load resource: the server responded with a status of (400|404|500)/;

const CREATE = "/md/api/v1/ai-credit";
const UPDATE = "/md/api/v1/ai-credit/:id";

// Model 1 ("E2E OpenAI Model") has a credit configuration, model 2 ("E2E Azure Key Model") has none.
test.beforeEach(({ mockApi }) => installAiCreditMocks(mockApi));

test.describe("AI Credit: existing configuration", () => {
  test("shows the model, the saved values and the Update and Delete controls", async ({ page }) => {
    const credit = new AiCreditPage(page);
    await credit.goto(MODEL_IDS.openai);

    await credit.expectLoaded("E2E OpenAI Model");
    await expect(credit.tokensIn).toHaveValue("1000");
    await expect(credit.costIn).toHaveValue("1.5");
    await expect(credit.tokensOut).toHaveValue("2000");
    await expect(credit.costOut).toHaveValue("3");
    await expect(credit.multiplierIn).toHaveValue("1");
    await expect(credit.multiplierOut).toHaveValue("2");
    await expect(credit.updateButton).toBeVisible();
    await expect(credit.createButton).toHaveCount(0);
    await expect(credit.deleteIconButton).toBeVisible();
  });

  test("the previews follow the fields: total cost is the two costs, credits are tokens times multiplier per thousand", async ({ page }) => {
    const credit = new AiCreditPage(page);
    await credit.goto(MODEL_IDS.openai);
    await credit.expectLoaded("E2E OpenAI Model");
    // 1.5 + 3, and 1000 * 1 / 1000 + 2000 * 2 / 1000.
    await expect(credit.preview("Total Cost (preview)")).toHaveText("$4.50");
    await expect(credit.preview("Credits (preview)")).toHaveText("5.00");

    await credit.tokensIn.fill("3000");
    await credit.multiplierOut.fill("0.5");
    await credit.costOut.fill("0.25");

    await expect(credit.preview("Total Cost (preview)")).toHaveText("$1.75");
    await expect(credit.preview("Credits (preview)")).toHaveText("4.00");
  });

  test("the stepper buttons change a field by its step and Decrease stops at the minimum", async ({ page }) => {
    const credit = new AiCreditPage(page);
    await credit.goto(MODEL_IDS.openai);
    await credit.expectLoaded("E2E OpenAI Model");
    const increase = (label: string) => credit.field(label).locator("xpath=following-sibling::button[@aria-label='Increase']");
    const decrease = (label: string) => credit.field(label).locator("xpath=preceding-sibling::button[@aria-label='Decrease']");

    await increase("Tokens In").click();
    await expect(credit.tokensIn).toHaveValue("1001");
    await increase("Multiplier In").click();
    await expect(credit.multiplierIn).toHaveValue("1.01");
    await credit.tokensOut.fill("1");
    await decrease("Tokens Out").click();
    await expect(credit.tokensOut).toHaveValue("0");
    await decrease("Tokens Out").click();
    await expect(credit.tokensOut).toHaveValue("0");
  });

  test("a negative number typed into a field is clamped to zero", async ({ page }) => {
    const credit = new AiCreditPage(page);
    await credit.goto(MODEL_IDS.openai);
    await credit.expectLoaded("E2E OpenAI Model");

    await credit.costIn.fill("-5");

    await expect(credit.costIn).toHaveValue("0");
  });

  test("Update puts the form on the credit's id and shows a toast", async ({ page, mockApi }) => {
    const credit = new AiCreditPage(page);
    const toast = new Toast(page);
    await credit.goto(MODEL_IDS.openai);
    await credit.expectLoaded("E2E OpenAI Model");

    await credit.tokensIn.fill("4000");
    await credit.costIn.fill("2.5");
    await credit.multiplierIn.fill("0.25");
    await credit.updateButton.click();

    await toast.expectShown("AI Credit Updated");
    expect(mockApi.requestsTo("PUT", UPDATE)[0].path).toBe("/md/api/v1/ai-credit/1");
    expect(lastBody(mockApi, "PUT", UPDATE)).toEqual({
      aiModelId: 1,
      tokensIn: 4000,
      costInMTok: 2.5,
      tokensOut: 2000,
      costOutMTok: 3,
      multiplierIn: 0.25,
      multiplierOut: 2,
    });
    await expect(credit.tokensIn).toHaveValue("4000");
    await expect(credit.updateButton).toBeEnabled();
    expect(mockApi.requestsTo("POST", CREATE)).toHaveLength(0);
  });

  test.describe("validation", () => {
    test("a multiplier of zero is rejected on the field and nothing is sent", async ({ page, mockApi }) => {
      const credit = new AiCreditPage(page);
      await credit.goto(MODEL_IDS.openai);
      await credit.expectLoaded("E2E OpenAI Model");

      await credit.multiplierIn.fill("0");
      await credit.multiplierOut.fill("0");
      await credit.updateButton.click();

      await expect(page.getByText("Multiplier must be greater than 0")).toHaveCount(2);
      expect(mockApi.requestsTo("PUT", UPDATE)).toHaveLength(0);
    });

    test("an emptied field says it is required", async ({ page, mockApi }) => {
      const credit = new AiCreditPage(page);
      await credit.goto(MODEL_IDS.openai);
      await credit.expectLoaded("E2E OpenAI Model");

      await credit.tokensIn.fill("");
      await credit.costIn.fill("");
      await credit.tokensOut.fill("");
      await credit.costOut.fill("");
      await credit.multiplierIn.fill("");
      await credit.multiplierOut.fill("");
      await credit.updateButton.click();

      for (const message of ["Tokens In is required", "Cost In is required", "Tokens Out is required", "Cost Out is required", "Multiplier In is required", "Multiplier Out is required"]) {
        await expect(page.getByText(message)).toBeVisible();
      }
      expect(mockApi.requestsTo("PUT", UPDATE)).toHaveLength(0);
    });

    test("fixing the field clears its message", async ({ page }) => {
      const credit = new AiCreditPage(page);
      await credit.goto(MODEL_IDS.openai);
      await credit.expectLoaded("E2E OpenAI Model");
      await credit.multiplierIn.fill("0");
      await credit.updateButton.click();
      await expect(page.getByText("Multiplier must be greater than 0")).toBeVisible();

      await credit.multiplierIn.fill("0.01");

      await expect(page.getByText("Multiplier must be greater than 0")).toHaveCount(0);
    });
  });

  test.describe("Delete", () => {
    test("asks for confirmation and Cancel keeps the configuration", async ({ page, mockApi }) => {
      const credit = new AiCreditPage(page);
      await credit.goto(MODEL_IDS.openai);
      await credit.expectLoaded("E2E OpenAI Model");

      await credit.deleteIconButton.click();
      await credit.deleteDialog.expectVisible();
      await credit.deleteDialog.expectText("Are you sure you want to delete this AI Credit configuration?");
      await credit.deleteDialog.cancel();

      await credit.deleteDialog.expectClosed();
      expect(mockApi.requestsTo("DELETE", UPDATE)).toHaveLength(0);
      await expect(credit.updateButton).toBeVisible();
    });

    test.describe("confirmed", () => {
      test.use({ allowedConsoleErrors: [FAILED_REQUEST_LOG] });

      test("removes the configuration and turns the page into the create form", async ({ page, mockApi }) => {
        const credit = new AiCreditPage(page);
        const toast = new Toast(page);
        await credit.goto(MODEL_IDS.openai);
        await credit.expectLoaded("E2E OpenAI Model");

        await credit.deleteIconButton.click();
        await credit.deleteDialog.confirm("Delete");

        await toast.expectShown("AI Credit Deleted");
        expect(mockApi.requestsTo("DELETE", UPDATE).map((request) => request.path)).toEqual(["/md/api/v1/ai-credit/1"]);
        // The refetch is a 404 (soft-deleted credits are filtered out), which means "not configured".
        await expect(credit.createButton).toBeVisible();
        await expect(credit.updateButton).toHaveCount(0);
        await expect(credit.deleteIconButton).toHaveCount(0);
        await expect(credit.tokensIn).toHaveValue("0");
        await expect(credit.multiplierIn).toHaveValue("1");
        await expect(credit.multiplierOut).toHaveValue("1");
      });
    });

    test.describe("rejected by the server", () => {
      test.use({ allowedConsoleErrors: [FAILED_REQUEST_LOG] });

      test("shows the raw error and stays on the existing configuration", async ({ page, mockApi }) => {
        const store = installAiCreditMocks(mockApi);
        const credit = new AiCreditPage(page);
        const toast = new Toast(page);
        await credit.goto(MODEL_IDS.openai);
        await credit.expectLoaded("E2E OpenAI Model");
        // Another admin deletes the credit after the page loaded: the delete validator answers 1402.
        store.credits[0].isDeleted = true;

        await credit.deleteIconButton.click();
        await credit.deleteDialog.confirm("Delete");

        await toast.expectShown("Error Deleting AI Credit");
        await toast.expectShown(/"code":"WKFLOMD1402"/);
        await expect(credit.updateButton).toBeVisible();
        await expect(credit.deleteIconButton).toBeEnabled();
      });
    });
  });

  test.describe("rejected by the server", () => {
    test.use({ allowedConsoleErrors: [FAILED_REQUEST_LOG] });

    test("an update the server refuses shows the raw error and keeps the entered values", async ({ page, mockApi }) => {
      const store = installAiCreditMocks(mockApi);
      const credit = new AiCreditPage(page);
      const toast = new Toast(page);
      await credit.goto(MODEL_IDS.openai);
      await credit.expectLoaded("E2E OpenAI Model");
      // Another admin deletes the credit after the page loaded: the update validator answers 1402.
      store.credits[0].isDeleted = true;

      await credit.tokensIn.fill("4000");
      await credit.updateButton.click();

      await toast.expectShown("Error Updating AI Credit");
      await toast.expectShown(/"code":"WKFLOMD1402"/);
      await expect(credit.tokensIn).toHaveValue("4000");
      await expect(credit.updateButton).toBeEnabled();
    });
  });
});

test.describe("AI Credit: not configured yet (create mode)", () => {
  // A 404 on GET /ai-model/:id/ai-credit is the backend's "no credit configured" answer, and the browser logs it.
  test.use({ allowedConsoleErrors: [FAILED_REQUEST_LOG] });

  test("a 404 on the credit shows the create form with default values", async ({ page, mockApi }) => {
    const credit = new AiCreditPage(page);
    await credit.goto(MODEL_IDS.azureKey);

    await credit.expectLoaded("E2E Azure Key Model");
    await expect(credit.createButton).toBeVisible();
    await expect(credit.updateButton).toHaveCount(0);
    await expect(credit.deleteIconButton).toHaveCount(0);
    for (const field of [credit.tokensIn, credit.costIn, credit.tokensOut, credit.costOut]) await expect(field).toHaveValue("0");
    await expect(credit.multiplierIn).toHaveValue("1");
    await expect(credit.multiplierOut).toHaveValue("1");
    await expect(credit.preview("Total Cost (preview)")).toHaveText("$0.00");
    await expect(credit.preview("Credits (preview)")).toHaveText("0.00");
    expect(mockApi.requestsTo("GET", "/md/api/v1/ai-model/:id/ai-credit").map((request) => request.path)).toEqual([
      `/md/api/v1/ai-model/${MODEL_IDS.azureKey}/ai-credit`,
    ]);
  });

  test("Create posts the model id and the form, then switches to the update form", async ({ page, mockApi }) => {
    const credit = new AiCreditPage(page);
    const toast = new Toast(page);
    await credit.goto(MODEL_IDS.azureKey);
    await credit.expectLoaded("E2E Azure Key Model");

    await credit.tokensIn.fill("5000");
    await credit.costIn.fill("0.4");
    await credit.tokensOut.fill("1000");
    await credit.costOut.fill("1.6");
    await credit.multiplierIn.fill("0.5");
    await credit.multiplierOut.fill("1.5");
    await credit.createButton.click();

    await toast.expectShown("AI Credit Created");
    expect(lastBody(mockApi, "POST", CREATE)).toEqual({
      aiModelId: 2,
      tokensIn: 5000,
      costInMTok: 0.4,
      tokensOut: 1000,
      costOutMTok: 1.6,
      multiplierIn: 0.5,
      multiplierOut: 1.5,
    });
    await expect(credit.updateButton).toBeVisible();
    await expect(credit.createButton).toHaveCount(0);
    await expect(credit.deleteIconButton).toBeVisible();
    await expect(credit.tokensIn).toHaveValue("5000");
    await expect(credit.multiplierOut).toHaveValue("1.5");
  });

  test("a multiplier of zero is rejected before anything is sent", async ({ page, mockApi }) => {
    const credit = new AiCreditPage(page);
    await credit.goto(MODEL_IDS.azureKey);
    await credit.expectLoaded("E2E Azure Key Model");

    await credit.multiplierOut.fill("0");
    await credit.createButton.click();

    await expect(page.getByText("Multiplier must be greater than 0")).toBeVisible();
    expect(mockApi.requestsTo("POST", CREATE)).toHaveLength(0);
  });

  test("a create the server refuses shows the raw error and stays in create mode", async ({ page, mockApi }) => {
    const store = installAiCreditMocks(mockApi);
    const credit = new AiCreditPage(page);
    const toast = new Toast(page);
    await credit.goto(MODEL_IDS.azureKey);
    await credit.expectLoaded("E2E Azure Key Model");
    // Another admin deletes the model after the page loaded: the create validator answers 1405.
    store.models.find((model) => model.id === MODEL_IDS.azureKey)!.isDeleted = true;

    await credit.createButton.click();

    await toast.expectShown("Error Creating AI Credit");
    await toast.expectShown(/"code":"WKFLOMD1405"/);
    await expect(credit.createButton).toBeEnabled();
  });
});

test.describe("AI Credit: load errors", () => {
  test.use({ allowedConsoleErrors: [FAILED_REQUEST_LOG] });

  test("a failing credit request shows an error with the raw message, not the create form", async ({ page, mockApi }) => {
    mockApi.on("GET", "/md/api/v1/ai-model/:id/ai-credit", () => serverError());
    const credit = new AiCreditPage(page);
    await credit.goto(MODEL_IDS.openai);

    const alert = page.getByRole("alert");
    await expect(alert).toContainText("Couldn't load AI Credit");
    await expect(alert).toContainText(/500: .*"code":"WKFLO0001"/);
    await expect(credit.createButton).toHaveCount(0);
    await expect(credit.heading).toHaveCount(0);
  });

  test("a failing model request shows an error with the raw message", async ({ page, mockApi }) => {
    mockApi.on("GET", "/md/api/v1/ai-model/:id", () => serverError());
    const credit = new AiCreditPage(page);
    await credit.goto(MODEL_IDS.openai);

    const alert = page.getByRole("alert");
    await expect(alert).toContainText("Couldn't load AI Model");
    await expect(alert).toContainText(/500: .*"code":"WKFLO0001"/);
  });

  test("Back to AI Models leaves the error and opens the model list", async ({ page, mockApi }) => {
    mockApi.on("GET", "/md/api/v1/ai-model/:id/ai-credit", () => serverError());
    const credit = new AiCreditPage(page);
    await credit.goto(MODEL_IDS.openai);
    await expect(page.getByRole("alert")).toContainText("Couldn't load AI Credit");

    await credit.backButton.click();

    await expect(page).toHaveURL((url) => url.pathname === "/aimodels");
    await expect(page.getByRole("heading", { level: 1, name: "AI Models" })).toBeVisible();
  });

  test("an unknown model id shows AI Model not found", async ({ page }) => {
    const credit = new AiCreditPage(page);
    await credit.goto(999);

    await expect(page.getByRole("heading", { level: 1, name: "AI Model not found" })).toBeVisible();
    await expect(credit.heading).toHaveCount(0);
    await credit.backButton.click();
    await expect(page).toHaveURL((url) => url.pathname === "/aimodels");
  });
});

test.describe("AI Credit: edge cases", () => {
  test("a non-numeric model id shows AI Model not found without asking the API", async ({ page, mockApi }) => {
    const credit = new AiCreditPage(page);
    await credit.goto("abc");

    await expect(page.getByRole("heading", { level: 1, name: "AI Model not found" })).toBeVisible();
    expect(mockApi.requests.filter((request) => request.path.includes("ai-credit") || /\/ai-model\//.test(request.path))).toEqual([]);
  });

  test("Back returns to the model list", async ({ page }) => {
    const credit = new AiCreditPage(page);
    await credit.goto(MODEL_IDS.openai);
    await credit.expectLoaded("E2E OpenAI Model");

    await credit.backButton.click();

    await expect(page).toHaveURL((url) => url.pathname === "/aimodels");
  });

  test.describe("standard user", () => {
    test.use({ isSuperPowerUser: false });

    test("is redirected away without the credit being requested", async ({ page, mockApi }) => {
      await page.goto("/aimodels/1/ai-credit");

      await expect(page).toHaveURL((url) => url.pathname === "/");
      await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
      expect(mockApi.requestsTo("GET", "/md/api/v1/ai-model/:id/ai-credit")).toHaveLength(0);
    });
  });
});
