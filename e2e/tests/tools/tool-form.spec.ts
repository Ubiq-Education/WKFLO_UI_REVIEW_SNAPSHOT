import { expect, test } from "../../support/test";
import { reply } from "../../support/mock-api";
import { ToolFormPage } from "../../pages/tools/tool-form.page";
import { ToolsListPage } from "../../pages/tools/tools-list.page";
import { Toast } from "../../pages/components/toast";
import { ConfirmDialog } from "../../pages/components/confirm-dialog";
import { errorReply, installToolsMocks, lastBody, NEW_TOOL_ID, TOOL_IDS, type ToolsStore } from "../../support/mocks/tools";

// The browser logs every non-2xx response as a console error; the error-path tests mock 400 / 404 on purpose.
const FAILED_REQUEST_LOG = /Failed to load resource: the server responded with a status of (400|404)/;

const TOOL_PATH = "/md/api/v1/tenant/tool/:id";

test.describe("Create tool", () => {
  let store: ToolsStore;
  test.beforeEach(({ mockApi }) => {
    store = installToolsMocks(mockApi);
  });

  test("starts as an HTTP tool that is active and has no permissions or output cap", async ({ page }) => {
    const form = new ToolFormPage(page);
    await form.gotoCreate();

    await expect(form.nameInput).toHaveValue("");
    await expect(form.descriptionInput).toHaveValue("");
    await expect(form.typeSelect).toHaveText("HTTP API");
    await expect(form.permissionsCheckbox).not.toBeChecked();
    await expect(form.maxOutputInput).toHaveValue("");
    await expect(form.editorHeading("API Configuration")).toBeVisible();
  });

  test("saving a valid tool posts it, shows a toast and opens it in the edit page", async ({ page, mockApi }) => {
    const form = new ToolFormPage(page);
    const toast = new Toast(page);
    await form.gotoCreate();

    await form.nameInput.fill("E2E New Tool");
    await form.descriptionInput.fill("A tool created by the e2e suite.");
    await form.saveButton.click();

    await toast.expectShown("Tool created");
    const newId = NEW_TOOL_ID;
    await form.expectPath(`/tools/${newId}/edit`);
    await expect(page.getByRole("heading", { level: 1, name: "Edit Tool" })).toBeVisible();
    await expect(form.nameInput).toHaveValue("E2E New Tool");

    const body = lastBody<Record<string, unknown>>(mockApi, "POST", "/md/api/v1/tenant/tool");
    expect(body).toMatchObject({
      name: "E2E New Tool",
      description: "A tool created by the e2e suite.",
      type: "HTTP",
      isActive: true,
      maxToolOutputLength: null,
      permissionsEnabled: false,
    });
    // The editor fills in the HTTP defaults before the first save.
    expect(JSON.parse(body!.config as string)).toEqual({
      method: "GET",
      url: "",
      headers: { "Content-Type": "application/json" },
      parameters: {},
      urlParams: {},
      body: "",
      parameterConfig: {},
      inputs: {},
    });
    expect(store.tools.find((tool) => tool.id === newId)?.name).toBe("E2E New Tool");
  });

  test("the new tool shows up in the tools list", async ({ page }) => {
    const form = new ToolFormPage(page);
    await form.gotoCreate();
    await form.nameInput.fill("E2E Listed Tool");
    await form.descriptionInput.fill("Appears in the list afterwards.");
    await form.saveButton.click();
    await form.expectPath(`/tools/${NEW_TOOL_ID}/edit`);

    await form.backButton.click();

    const list = new ToolsListPage(page);
    await list.expectPath("/tools");
    await expect(list.cardTitle("E2E Listed Tool")).toBeVisible();
    await expect(list.card("E2E Listed Tool").getByTestId("tool-publish-badge")).toHaveText("Unpublished");
  });

  test("sends the permissions option and the output cap that were set", async ({ page, mockApi }) => {
    const form = new ToolFormPage(page);
    await form.gotoCreate();

    await form.nameInput.fill("E2E Capped Tool");
    await form.descriptionInput.fill("Has a cap and permissions.");
    await form.permissionsCheckbox.check();
    await form.maxOutputInput.fill("500");
    await form.saveButton.click();

    await form.expectPath(`/tools/${NEW_TOOL_ID}/edit`);
    expect(lastBody(mockApi, "POST", "/md/api/v1/tenant/tool")).toMatchObject({ permissionsEnabled: true, maxToolOutputLength: 500 });
    await expect(form.permissionsCheckbox).toBeChecked();
    await expect(form.maxOutputInput).toHaveValue("500");
  });

  test.describe("validation", () => {
    test("an empty form shows the name and description messages and posts nothing", async ({ page, mockApi }) => {
      const form = new ToolFormPage(page);
      await form.gotoCreate();

      await form.saveButton.click();

      await expect(page.getByText("Name must be at least 3 characters")).toBeVisible();
      await expect(page.getByText("Description must be at least 10 characters")).toBeVisible();
      expect(mockApi.requestsTo("POST", "/md/api/v1/tenant/tool")).toHaveLength(0);
      await form.expectPath("/tools/create");
    });

    test("a name of two characters and a short description are rejected", async ({ page, mockApi }) => {
      const form = new ToolFormPage(page);
      await form.gotoCreate();

      await form.nameInput.fill("ab");
      await form.descriptionInput.fill("too short");
      await form.saveButton.click();

      await expect(page.getByText("Name must be at least 3 characters")).toBeVisible();
      await expect(page.getByText("Description must be at least 10 characters")).toBeVisible();
      expect(mockApi.requestsTo("POST", "/md/api/v1/tenant/tool")).toHaveLength(0);
    });

    test("a name of exactly three characters and a description of exactly ten are accepted", async ({ page, mockApi }) => {
      const form = new ToolFormPage(page);
      await form.gotoCreate();

      await form.nameInput.fill("abc");
      await form.descriptionInput.fill("0123456789");
      await form.saveButton.click();

      await form.expectPath(`/tools/${NEW_TOOL_ID}/edit`);
      expect(lastBody(mockApi, "POST", "/md/api/v1/tenant/tool")).toMatchObject({ name: "abc", description: "0123456789" });
    });

    test("the messages go away once the fields are fixed", async ({ page }) => {
      const form = new ToolFormPage(page);
      await form.gotoCreate();
      await form.saveButton.click();
      await expect(page.getByText("Name must be at least 3 characters")).toBeVisible();

      await form.nameInput.fill("E2E Fixed Name");
      await form.descriptionInput.fill("A long enough description.");

      await expect(page.getByText("Name must be at least 3 characters")).toHaveCount(0);
      await expect(page.getByText("Description must be at least 10 characters")).toHaveCount(0);
    });
  });

  test.describe("failing create", () => {
    test.use({ allowedConsoleErrors: [FAILED_REQUEST_LOG] });

    test("shows an error toast and stays on the form when the API rejects the tool", async ({ page, mockApi }) => {
      // The create validator answers WKFLOMD0102 (TenantMustExist) when the tenant does not exist (an empty tenant fails both 0101 and 0102, so 0102 alone is the reachable case).
      mockApi.on("POST", "/md/api/v1/tenant/tool", () => errorReply(400, ["TenantName", "WKFLOMD0102"]));
      const form = new ToolFormPage(page);
      const toast = new Toast(page);
      await form.gotoCreate();
      await form.nameInput.fill("E2E Rejected Tool");
      await form.descriptionInput.fill("The API says no.");

      await form.saveButton.click();

      // Known bug: see US 8186 item 48 (the toast prints the raw "400: {json}" body, untranslated).
      await toast.expectShown(/Failed to create tool: 400: \{.*"WKFLOMD0102".*\}/);
      await form.expectPath("/tools/create");
      await expect(form.nameInput).toHaveValue("E2E Rejected Tool");
      // Known bug: see US 8186 item 49 (create.tsx sets isSaving on submit and never resets it on error, so the
      // form stays on "Saving..." with Save and Cancel disabled and the admin has to reload to try again).
      await expect(page.getByRole("button", { name: "Saving..." })).toBeDisabled();
      await expect(form.cancelButton).toBeDisabled();
      expect(mockApi.requestsTo("POST", "/md/api/v1/tenant/tool")).toHaveLength(1);
    });
  });

  test("Cancel and Back return to the tools list without saving", async ({ page, mockApi }) => {
    const form = new ToolFormPage(page);
    await form.gotoCreate();
    await form.nameInput.fill("E2E Abandoned Tool");

    await form.cancelButton.click();
    await form.expectPath("/tools");

    await form.gotoCreate();
    await form.backButton.click();
    await form.expectPath("/tools");
    expect(mockApi.requestsTo("POST", "/md/api/v1/tenant/tool")).toHaveLength(0);
  });
});

test.describe("Edit tool", () => {
  let store: ToolsStore;
  test.beforeEach(({ mockApi }) => {
    store = installToolsMocks(mockApi);
  });

  test("loads the tool into the form", async ({ page }) => {
    const form = new ToolFormPage(page);
    await form.gotoEdit(TOOL_IDS.priorityQa);

    await expect(form.nameInput).toHaveValue("E2E Priority Answers");
    await expect(form.descriptionInput).toHaveValue("Answers fixed questions first.");
    await expect(form.typeSelect).toHaveText("Priority Q&A");
    // The fixture tool has permissions on and no output cap.
    await expect(form.permissionsCheckbox).toBeChecked();
    await expect(form.maxOutputInput).toHaveValue("");
    await expect(form.publishBadge).toHaveText("Published");
  });

  test("saving changes sends the whole form, stays on the page and shows a toast", async ({ page, mockApi }) => {
    const form = new ToolFormPage(page);
    const toast = new Toast(page);
    await form.gotoEdit(TOOL_IDS.http);

    await form.nameInput.fill("E2E Lookup Tool Renamed");
    await form.descriptionInput.fill("A new description for the lookup.");
    await form.saveButton.click();

    await toast.expectShown("Tool updated");
    const [put] = mockApi.requestsTo("PUT", TOOL_PATH);
    expect(put.path).toBe(`/md/api/v1/tenant/tool/${TOOL_IDS.http}`);
    expect(put.body).toMatchObject({
      name: "E2E Lookup Tool Renamed",
      description: "A new description for the lookup.",
      type: "HTTP",
      isActive: true,
      permissionsEnabled: false,
    });
    await form.expectPath(`/tools/${TOOL_IDS.http}/edit`);
    expect(store.tools[0].name).toBe("E2E Lookup Tool Renamed");
    await expect(form.nameInput).toHaveValue("E2E Lookup Tool Renamed");
  });

  test("the same validation as the create form applies", async ({ page, mockApi }) => {
    const form = new ToolFormPage(page);
    await form.gotoEdit(TOOL_IDS.http);

    await form.nameInput.fill("x");
    await form.descriptionInput.fill("short");
    await form.saveButton.click();

    await expect(page.getByText("Name must be at least 3 characters")).toBeVisible();
    await expect(page.getByText("Description must be at least 10 characters")).toBeVisible();
    expect(mockApi.requestsTo("PUT", TOOL_PATH)).toHaveLength(0);
  });

  test.describe("output cap", () => {
    test("setting a cap and then clearing it sends an explicit null", async ({ page, mockApi }) => {
      const form = new ToolFormPage(page);
      const toast = new Toast(page);
      await form.gotoEdit(TOOL_IDS.http);

      await form.maxOutputInput.fill("250");
      await form.saveButton.click();
      await toast.expectShown("Tool updated");
      expect(lastBody(mockApi, "PUT", TOOL_PATH)).toMatchObject({ maxToolOutputLength: 250 });
      expect(store.tools[0].maxToolOutputLength).toBe(250);

      await form.maxOutputInput.fill("");
      await form.saveButton.click();
      await expect.poll(() => mockApi.requestsTo("PUT", TOOL_PATH).length).toBe(2);

      // The backend keeps the stored cap when the field is left out, so the null must be in the body.
      const body = lastBody<Record<string, unknown>>(mockApi, "PUT", TOOL_PATH)!;
      expect(body).toHaveProperty("maxToolOutputLength", null);
      await expect.poll(() => store.tools[0].maxToolOutputLength).toBeNull();
    });

    test("the stepper buttons change the cap and the minimum is one", async ({ page }) => {
      const form = new ToolFormPage(page);
      await form.gotoEdit(TOOL_IDS.http);

      await form.page.getByRole("button", { name: "Increase" }).click();
      await expect(form.maxOutputInput).toHaveValue("1");
      await form.page.getByRole("button", { name: "Increase" }).click();
      await expect(form.maxOutputInput).toHaveValue("2");
      await form.page.getByRole("button", { name: "Decrease" }).click();
      await form.page.getByRole("button", { name: "Decrease" }).click();
      await expect(form.maxOutputInput).toHaveValue("1");
    });
  });

  test.describe("manage permissions", () => {
    test("turning it on shows the publish hint after saving", async ({ page, mockApi }) => {
      const form = new ToolFormPage(page);
      await form.gotoEdit(TOOL_IDS.http);
      await expect(page.getByTestId("tool-publish-hint")).toHaveCount(0);

      await form.permissionsCheckbox.check();
      await form.saveButton.click();

      await expect(page.getByTestId("tool-publish-hint")).toHaveText("Saved. Publish the tool to apply these changes in chat.");
      expect(lastBody(mockApi, "PUT", TOOL_PATH)).toMatchObject({ permissionsEnabled: true });
      expect(store.tools[0].permissionsEnabled).toBe(true);
    });

    test("saving without changing it shows no publish hint", async ({ page, mockApi }) => {
      const form = new ToolFormPage(page);
      const toast = new Toast(page);
      await form.gotoEdit(TOOL_IDS.http);

      await form.nameInput.fill("E2E Lookup Tool Again");
      await form.saveButton.click();

      await toast.expectShown("Tool updated");
      expect(mockApi.requestsTo("PUT", TOOL_PATH)).toHaveLength(1);
      await expect(page.getByTestId("tool-publish-hint")).toHaveCount(0);
    });
  });

  test.describe("publish from the edit page", () => {
    test("is unavailable while there are unsaved changes and explains why", async ({ page }) => {
      const form = new ToolFormPage(page);
      await form.gotoEdit(TOOL_IDS.http);
      await expect(page.getByTestId("publish-disabled-trigger")).toHaveCount(0);

      await form.nameInput.fill("E2E Lookup Tool Edited");

      const trigger = page.getByTestId("publish-disabled-trigger");
      await expect(trigger).toHaveAttribute("aria-disabled", "true");
      await trigger.hover();
      await expect(page.getByRole("tooltip")).toContainText("Save your changes before publishing.");
    });

    test("is available again after saving", async ({ page }) => {
      const form = new ToolFormPage(page);
      const toast = new Toast(page);
      await form.gotoEdit(TOOL_IDS.http);
      await form.nameInput.fill("E2E Lookup Tool Edited");
      await expect(page.getByTestId("publish-disabled-trigger")).toBeVisible();

      await form.saveButton.click();

      await toast.expectShown("Tool updated");
      await expect(page.getByTestId("publish-disabled-trigger")).toHaveCount(0);
      await expect(form.publishButton).toBeEnabled();
    });

    test("confirming publishes the saved tool and updates the badge", async ({ page, mockApi }) => {
      const form = new ToolFormPage(page);
      const toast = new Toast(page);
      const dialog = new ConfirmDialog(page, "Publish Tool");
      await form.gotoEdit(TOOL_IDS.http);
      await expect(form.publishBadge).toHaveText("Unpublished");

      await form.publishButton.click();
      await expect(page.getByTestId("publish-saved-only-note")).toHaveText("Only saved changes are published. Save any changes on this page first.");
      await dialog.confirm("Publish");

      await toast.expectShown("Tool published");
      expect(mockApi.requestsTo("POST", "/md/api/v1/tenant/tool/:id/publish").map((request) => request.path)).toEqual([
        `/md/api/v1/tenant/tool/${TOOL_IDS.http}/publish`,
      ]);
      await expect(form.publishBadge).toHaveText("Published");
    });

    test("editing a published tool shows the changes badge until it is republished", async ({ page }) => {
      const form = new ToolFormPage(page);
      const toast = new Toast(page);
      const dialog = new ConfirmDialog(page, "Publish Tool");
      await form.gotoEdit(TOOL_IDS.priorityQa);
      await expect(form.publishBadge).toHaveText("Published");

      await form.nameInput.fill("E2E Priority Answers v2");
      await form.saveButton.click();
      await toast.expectShown("Tool updated");
      await expect(form.publishBadge).toHaveText("Unpublished changes");

      await form.publishButton.click();
      await dialog.confirm("Publish");
      await expect(form.publishBadge).toHaveText("Published");
    });
  });

  test.describe("delete from the edit page", () => {
    test("confirming deletes the tool and returns to the list", async ({ page, mockApi }) => {
      const form = new ToolFormPage(page);
      const toast = new Toast(page);
      const dialog = new ConfirmDialog(page, "Are you sure?");
      await form.gotoEdit(TOOL_IDS.http);

      await form.deleteButton.click();
      await dialog.expectText("permanently delete the tool");
      await dialog.confirm("Delete");

      await toast.expectShown("Tool deleted");
      await form.expectPath("/tools");
      expect(mockApi.requestsTo("DELETE", TOOL_PATH).map((request) => request.path)).toEqual([`/md/api/v1/tenant/tool/${TOOL_IDS.http}`]);
      const list = new ToolsListPage(page);
      await expect(list.cardTitle("E2E Priority Answers")).toBeVisible();
      await expect(list.cardTitle("E2E Lookup Tool")).toHaveCount(0);
    });

    test("cancelling keeps the tool", async ({ page, mockApi }) => {
      const form = new ToolFormPage(page);
      const dialog = new ConfirmDialog(page, "Are you sure?");
      await form.gotoEdit(TOOL_IDS.http);

      await form.deleteButton.click();
      await dialog.cancel();

      await dialog.expectClosed();
      await form.expectPath(`/tools/${TOOL_IDS.http}/edit`);
      expect(mockApi.requestsTo("DELETE", TOOL_PATH)).toHaveLength(0);
    });
  });

  test.describe("failing requests", () => {
    test.use({ allowedConsoleErrors: [FAILED_REQUEST_LOG] });

    test("shows an error toast and keeps the edits when the save fails", async ({ page, mockApi }) => {
      mockApi.on("PUT", TOOL_PATH, () => errorReply(400, ["Tool", "WKFLOMD0402"]));
      const form = new ToolFormPage(page);
      const toast = new Toast(page);
      await form.gotoEdit(TOOL_IDS.http);

      await form.nameInput.fill("E2E Lookup Tool Unsaved");
      await form.saveButton.click();

      // Known bug: see US 8186 item 48 (the toast prints the raw "400: {json}" body, untranslated).
      await toast.expectShown(/Failed to update tool: 400: \{.*"WKFLOMD0402".*\}/);
      await expect(form.nameInput).toHaveValue("E2E Lookup Tool Unsaved");
      await expect(form.saveButton).toBeEnabled();
      // The edits are still unsaved, so publishing stays unavailable.
      await expect(page.getByTestId("publish-disabled-trigger")).toBeVisible();
    });

    test("shows Tool not found for a tool that does not exist", async ({ page }) => {
      await page.goto("/tools/999/edit");

      await expect(page.getByRole("heading", { level: 1, name: "Tool not found" })).toBeVisible();
      await expect(page.getByText("The tool you're trying to edit doesn't exist.")).toBeVisible();
      await expect(page.getByRole("button", { name: "Save Tool" })).toHaveCount(0);
    });
  });

  test("Cancel and Back return to the list, and edits are not saved", async ({ page, mockApi }) => {
    const form = new ToolFormPage(page);
    await form.gotoEdit(TOOL_IDS.http);
    await form.nameInput.fill("E2E Never Saved");

    await form.cancelButton.click();
    await form.expectPath("/tools");
    await expect(new ToolsListPage(page).cardTitle("E2E Lookup Tool")).toBeVisible();

    await form.gotoEdit(TOOL_IDS.http);
    await form.backButton.click();
    await form.expectPath("/tools");
    expect(mockApi.requestsTo("PUT", TOOL_PATH)).toHaveLength(0);
  });
});
