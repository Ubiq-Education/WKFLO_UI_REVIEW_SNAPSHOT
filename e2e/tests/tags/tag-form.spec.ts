import { expect, test } from "../../support/test";
import { reply } from "../../support/mock-api";
import { TagFormPage } from "../../pages/tags/tag-form.page";
import { TagsListPage } from "../../pages/tags/tags-list.page";
import { Toast } from "../../pages/components/toast";
import { errorReply, lastBody } from "../../support/mocks/tools";
import { installTagsMocks, TAG_IDS } from "../../support/mocks/tags";

// The browser logs every non-2xx response as a console error; the error-path tests mock 400 / 404 on purpose.
const FAILED_REQUEST_LOG = /Failed to load resource: the server responded with a status of (400|404)/;

const TAG_PATH = "/md/api/v1/tenant/tag/:id";

test.describe("Create tag", () => {
  test.beforeEach(({ mockApi }) => installTagsMocks(mockApi));

  test("starts empty", async ({ page }) => {
    const form = new TagFormPage(page);
    await form.gotoCreate();

    await expect(form.nameInput).toHaveValue("");
    await expect(form.colorInput).toHaveValue("");
    await expect(form.clearColorButton).toHaveCount(0);
  });

  test("saving a name and a colour posts them, shows a toast and returns to the list", async ({ page, mockApi }) => {
    const form = new TagFormPage(page);
    const toast = new Toast(page);
    await form.gotoCreate();

    await form.nameInput.fill("E2E Reviewed");
    await form.colorInput.fill("#10b981");
    await form.createButton.click();

    await toast.expectShown("Tag created");
    await form.expectPath("/tags");
    expect(lastBody(mockApi, "POST", "/md/api/v1/tenant/tag")).toEqual({ name: "E2E Reviewed", color: "#10b981" });
    const list = new TagsListPage(page);
    await expect(list.cardTitle("E2E Reviewed")).toBeVisible();
    await expect(list.card("E2E Reviewed")).toContainText("#10b981");
  });

  test("the colour is optional and is sent as null when left empty", async ({ page, mockApi }) => {
    const form = new TagFormPage(page);
    await form.gotoCreate();

    await form.nameInput.fill("E2E Plain");
    await form.createButton.click();

    await form.expectPath("/tags");
    expect(lastBody(mockApi, "POST", "/md/api/v1/tenant/tag")).toEqual({ name: "E2E Plain", color: null });
  });

  test("the colour picker fills the colour field, and Clear empties it", async ({ page }) => {
    const form = new TagFormPage(page);
    await form.gotoCreate();

    await page.locator('input[type="color"]').fill("#ff8800");
    await expect(form.colorInput).toHaveValue("#ff8800");
    await expect(form.clearColorButton).toBeVisible();

    await form.clearColorButton.click();
    await expect(form.colorInput).toHaveValue("");
    await expect(form.clearColorButton).toHaveCount(0);
  });

  test("the colour field accepts at most 20 characters", async ({ page }) => {
    const form = new TagFormPage(page);
    await form.gotoCreate();

    await form.colorInput.pressSequentially("012345678901234567890123");

    await expect(form.colorInput).toHaveValue("01234567890123456789");
  });

  test.describe("validation", () => {
    test("an empty name is rejected and nothing is posted", async ({ page, mockApi }) => {
      const form = new TagFormPage(page);
      await form.gotoCreate();

      await form.createButton.click();

      await expect(page.getByText("Name is required")).toBeVisible();
      expect(mockApi.requestsTo("POST", "/md/api/v1/tenant/tag")).toHaveLength(0);
      await form.expectPath("/tags/create");
    });

    test("a name of 101 characters is rejected and 100 is accepted", async ({ page, mockApi }) => {
      const form = new TagFormPage(page);
      await form.gotoCreate();

      await form.nameInput.fill("a".repeat(101));
      await form.createButton.click();
      await expect(page.getByText("Name must be at most 100 characters")).toBeVisible();
      expect(mockApi.requestsTo("POST", "/md/api/v1/tenant/tag")).toHaveLength(0);

      await form.nameInput.fill("a".repeat(100));
      await form.createButton.click();
      await form.expectPath("/tags");
      expect(lastBody<{ name: string }>(mockApi, "POST", "/md/api/v1/tenant/tag")!.name).toHaveLength(100);
    });
  });

  test.describe("failing create", () => {
    test.use({ allowedConsoleErrors: [FAILED_REQUEST_LOG] });

    test("shows an error toast, stays on the form and can be saved again", async ({ page, mockApi }) => {
      let calls = 0;
      mockApi.on("POST", "/md/api/v1/tenant/tag", ({ body }) => {
        calls += 1;
        // The create validator answers WKFLOMD0102 (TenantMustExist) when the tenant does not exist (an empty tenant fails both 0101 and 0102, so 0102 alone is the reachable case).
        return calls === 1 ? errorReply(400, ["TenantName", "WKFLOMD0102"]) : { id: 9, ...(body as object), tenantId: 1 };
      });
      const form = new TagFormPage(page);
      const toast = new Toast(page);
      await form.gotoCreate();
      await form.nameInput.fill("E2E Rejected");

      await form.createButton.click();

      // Known bug: see US 8186 item 48 (the toast prints the raw "400: {json}" body, untranslated).
      await toast.expectShown(/Failed to create tag: 400: \{.*"WKFLOMD0102".*\}/);
      await form.expectPath("/tags/create");
      await expect(form.nameInput).toHaveValue("E2E Rejected");
      await expect(form.createButton).toBeEnabled();

      await form.createButton.click();
      await form.expectPath("/tags");
      expect(calls).toBe(2);
    });
  });

  test("Cancel and Back return to the list without saving", async ({ page, mockApi }) => {
    const form = new TagFormPage(page);
    await form.gotoCreate();
    await form.nameInput.fill("E2E Abandoned");

    await form.cancelButton.click();
    await form.expectPath("/tags");

    await form.gotoCreate();
    await form.backButton.click();
    await form.expectPath("/tags");
    expect(mockApi.requestsTo("POST", "/md/api/v1/tenant/tag")).toHaveLength(0);
  });
});

test.describe("Edit tag", () => {
  test.beforeEach(({ mockApi }) => installTagsMocks(mockApi));

  test("loads the tag into the form", async ({ page }) => {
    const form = new TagFormPage(page);
    await form.gotoEdit(TAG_IDS.colored);

    await expect(form.nameInput).toHaveValue("E2E Priority");
    await expect(form.colorInput).toHaveValue("#ef4444");
    await expect(form.clearColorButton).toBeVisible();
  });

  test("a tag without a colour loads with an empty colour field", async ({ page }) => {
    const form = new TagFormPage(page);
    await form.gotoEdit(TAG_IDS.uncolored);

    await expect(form.nameInput).toHaveValue("E2E Archive");
    await expect(form.colorInput).toHaveValue("");
  });

  test("saving sends the id, name and colour, shows a toast and returns to the list", async ({ page, mockApi }) => {
    const form = new TagFormPage(page);
    const toast = new Toast(page);
    await form.gotoEdit(TAG_IDS.colored);

    await form.nameInput.fill("E2E Priority Renamed");
    await form.colorInput.fill("#112233");
    await form.saveButton.click();

    await toast.expectShown("Tag updated");
    await form.expectPath("/tags");
    const [put] = mockApi.requestsTo("PUT", TAG_PATH);
    expect(put.path).toBe(`/md/api/v1/tenant/tag/${TAG_IDS.colored}`);
    expect(put.body).toEqual({ id: TAG_IDS.colored, name: "E2E Priority Renamed", color: "#112233" });
    const list = new TagsListPage(page);
    await expect(list.cardTitle("E2E Priority Renamed")).toBeVisible();
    await expect(list.cardTitle("E2E Priority")).toHaveCount(0);
  });

  test("clearing the colour sends null", async ({ page, mockApi }) => {
    const form = new TagFormPage(page);
    await form.gotoEdit(TAG_IDS.colored);

    await form.clearColorButton.click();
    await form.saveButton.click();

    await form.expectPath("/tags");
    expect(lastBody(mockApi, "PUT", TAG_PATH)).toEqual({ id: TAG_IDS.colored, name: "E2E Priority", color: null });
    await expect(new TagsListPage(page).card("E2E Priority")).not.toContainText("#ef4444");
  });

  test("the same name validation as the create form applies", async ({ page, mockApi }) => {
    const form = new TagFormPage(page);
    await form.gotoEdit(TAG_IDS.plain);

    await form.nameInput.fill("");
    await form.saveButton.click();

    await expect(page.getByText("Name is required")).toBeVisible();
    expect(mockApi.requestsTo("PUT", TAG_PATH)).toHaveLength(0);
    await form.expectPath(`/tags/${TAG_IDS.plain}/edit`);
  });

  test.describe("failing requests", () => {
    test.use({ allowedConsoleErrors: [FAILED_REQUEST_LOG] });

    test("shows an error toast and stays on the form when the save fails", async ({ page, mockApi }) => {
      mockApi.on("PUT", TAG_PATH, () => errorReply(400, ["Tag", "WKFLOMD0901"]));
      const form = new TagFormPage(page);
      const toast = new Toast(page);
      await form.gotoEdit(TAG_IDS.plain);

      await form.nameInput.fill("E2E Tag Renamed");
      await form.saveButton.click();

      // Known bug: see US 8186 item 48 (the toast prints the raw "400: {json}" body, untranslated).
      await toast.expectShown(/Failed to update tag: 400: \{.*"WKFLOMD0901".*\}/);
      await form.expectPath(`/tags/${TAG_IDS.plain}/edit`);
      await expect(form.nameInput).toHaveValue("E2E Tag Renamed");
      await expect(form.saveButton).toBeEnabled();
    });

    test("shows Tag not found for a tag that does not exist", async ({ page }) => {
      await page.goto("/tags/999/edit");

      await expect(page.getByRole("heading", { level: 1, name: "Tag not found" })).toBeVisible();
      await expect(page.getByText("The tag you're trying to edit doesn't exist.")).toBeVisible();
      await expect(page.getByRole("button", { name: "Save Tag" })).toHaveCount(0);
    });
  });

  test("Cancel and Back return to the list, and edits are not saved", async ({ page, mockApi }) => {
    const form = new TagFormPage(page);
    await form.gotoEdit(TAG_IDS.plain);
    await form.nameInput.fill("E2E Never Saved");

    await form.cancelButton.click();
    await form.expectPath("/tags");
    await expect(new TagsListPage(page).cardTitle("E2E Tag")).toBeVisible();

    await form.gotoEdit(TAG_IDS.plain);
    await form.backButton.click();
    await form.expectPath("/tags");
    expect(mockApi.requestsTo("PUT", TAG_PATH)).toHaveLength(0);
  });
});
