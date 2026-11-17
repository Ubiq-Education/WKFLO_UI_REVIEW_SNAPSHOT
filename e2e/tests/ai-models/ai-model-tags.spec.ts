import { expect, test } from "../../support/test";
import { AiModelsPage } from "../../pages/ai-models/ai-models.page";
import { TagsPanel } from "../../pages/components/tags-panel";
import { Toast } from "../../pages/components/toast";
import { installAiModelsMocks, lastBody } from "../../support/mocks/ai-models";

// The browser logs every non-2xx response as a console error; the error-path tests mock 400 / 404 on purpose.
const FAILED_REQUEST_LOG = /Failed to load resource: the server responded with a status of (400|404)/;

const OPENAI = "E2E OpenAI Model";
const AZURE_KEY = "E2E Azure Key Model";
const AZURE_IDENTITY = "E2E Azure Identity Model";

test.beforeEach(({ mockApi }) => installAiModelsMocks(mockApi));

test.describe("Manage Tags", () => {
  test("opens a dialog with the model's tags and closes with Close", async ({ page }) => {
    const models = new AiModelsPage(page);
    const tags = new TagsPanel(page);
    await models.goto();

    await models.manageTagsButton(OPENAI).click();

    const dialog = page.getByRole("dialog", { name: "Manage Tags" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Assign or remove tags for this AI model.");
    await tags.expectAssigned("E2E Tag");
    await dialog.getByRole("button", { name: "Close", exact: true }).first().click();
    await expect(dialog).toBeHidden();
  });

  test("a model without tags says so", async ({ page }) => {
    const models = new AiModelsPage(page);
    const tags = new TagsPanel(page);
    await models.goto();

    await models.manageTagsButton(AZURE_KEY).click();

    await tags.expectNoTags();
  });

  test("a model with every tag assigned shows that nothing is left to add", async ({ page }) => {
    const models = new AiModelsPage(page);
    await models.goto();

    await models.manageTagsButton(AZURE_IDENTITY).click();

    await expect(page.getByText("All available tags have been assigned.")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Remove tag / })).toHaveCount(4);
  });

  test("assigning a tag posts the model's type and id and lists the tag", async ({ page, mockApi }) => {
    const models = new AiModelsPage(page);
    const tags = new TagsPanel(page);
    const toast = new Toast(page);
    await models.goto();
    await models.manageTagsButton(AZURE_KEY).click();
    await tags.expectNoTags();

    await tags.assign("E2E Priority");

    await toast.expectShown("Tag assigned");
    await tags.expectAssigned("E2E Priority");
    await expect(tags.emptyMessage).toHaveCount(0);
    expect(lastBody(mockApi, "POST", "/md/api/v1/tenant/tag/:tagId/entity")).toEqual({ id: 2, entityType: "AIModel", entityId: 2 });
    expect(mockApi.requestsTo("POST", "/md/api/v1/tenant/tag/:tagId/entity")[0].path).toBe("/md/api/v1/tenant/tag/2/entity");
  });

  test("removing a tag deletes the assignment and updates the panel", async ({ page, mockApi }) => {
    const models = new AiModelsPage(page);
    const tags = new TagsPanel(page);
    const toast = new Toast(page);
    await models.goto();
    await models.manageTagsButton(OPENAI).click();
    await tags.expectAssigned("E2E Tag");

    await tags.remove("E2E Tag");

    await toast.expectShown("Tag removed");
    await tags.expectNoTags();
    expect(mockApi.requestsTo("DELETE", "/md/api/v1/tenant/tag/:tagId/entity/:entityType/:entityId").map((request) => request.path)).toEqual([
      "/md/api/v1/tenant/tag/1/entity/AIModel/1",
    ]);
  });

  test("the tags are kept per model", async ({ page }) => {
    const models = new AiModelsPage(page);
    const tags = new TagsPanel(page);
    await models.goto();
    await models.manageTagsButton(AZURE_KEY).click();
    await tags.assign("E2E Review");
    await tags.expectAssigned("E2E Review");
    await page.getByRole("dialog", { name: "Manage Tags" }).getByRole("button", { name: "Close", exact: true }).first().click();

    await models.manageTagsButton(OPENAI).click();

    await tags.expectAssigned("E2E Tag");
    await tags.expectNotAssigned("E2E Review");
  });

  test("the cards do not show a tag change until the page is reloaded", async ({ page, mockApi }) => {
    const models = new AiModelsPage(page);
    const tags = new TagsPanel(page);
    await models.goto();
    await models.manageTagsButton(AZURE_KEY).click();
    await tags.assign("E2E Priority");
    await tags.expectAssigned("E2E Priority");
    await page.getByRole("dialog", { name: "Manage Tags" }).getByRole("button", { name: "Close", exact: true }).first().click();

    // Known bug: see US 8186 item 76 (the tag dialog only refreshes its own query, so the model list keeps the old chips).
    await expect(models.card(AZURE_KEY)).not.toContainText("E2E Priority");
    // No refetch of the list is in flight or done: the model list was requested once, on load.
    expect(mockApi.requestsTo("GET", "/md/api/v1/ai-models")).toHaveLength(1);

    await page.reload();
    await expect(models.card(AZURE_KEY)).toContainText("E2E Priority");
  });

  test.describe("rejected by the server", () => {
    test.use({ allowedConsoleErrors: [FAILED_REQUEST_LOG] });

    test("an assignment that already exists shows the raw error", async ({ page, mockApi }) => {
      const models = new AiModelsPage(page);
      const tags = new TagsPanel(page);
      const toast = new Toast(page);
      await models.goto();
      await models.manageTagsButton(AZURE_KEY).click();
      await tags.expectNoTags();
      // Another admin assigns the same tag after the panel loaded: the server then answers 0903.
      mockApi.entityTags.set("AIModel:2", [2]);

      await tags.assign("E2E Priority");

      await toast.expectShown(/Failed to assign tag: 400: .*"code":"WKFLOMD0903"/);
      await tags.expectNotAssigned("E2E Priority");
      await tags.expectNoTags();
    });

    test("removing an assignment that is already gone shows the raw error", async ({ page, mockApi }) => {
      const models = new AiModelsPage(page);
      const tags = new TagsPanel(page);
      const toast = new Toast(page);
      await models.goto();
      await models.manageTagsButton(OPENAI).click();
      await tags.expectAssigned("E2E Tag");
      // Another admin removes the assignment after the panel loaded: the server then answers 0904.
      mockApi.entityTags.set("AIModel:1", []);

      await tags.remove("E2E Tag");

      await toast.expectShown(/Failed to remove tag: 404: .*"code":"WKFLOMD0904"/);
      await tags.expectAssigned("E2E Tag");
    });
  });
});
