import { expect, test } from "../../support/test";
import { TagsPanel } from "../../pages/components/tags-panel";
import { ToolFormPage } from "../../pages/tools/tool-form.page";
import { ToolsListPage } from "../../pages/tools/tools-list.page";
import { Toast } from "../../pages/components/toast";
import { errorReply, installToolsMocks, TOOL_IDS } from "../../support/mocks/tools";
import { installTagsMocks, TAG_IDS } from "../../support/mocks/tags";
import { reply } from "../../support/mock-api";

// The browser logs every non-2xx response as a console error; the error-path tests mock 400 / 404 on purpose.
const FAILED_REQUEST_LOG = /Failed to load resource: the server responded with a status of (400|404)/;

const ENTITY_TAGS = `/md/api/v1/tenant/entity/Tool/${TOOL_IDS.http}/tags`;

test.describe("Tags panel on the tool edit page", () => {
  test.beforeEach(({ mockApi }) => {
    installToolsMocks(mockApi);
    installTagsMocks(mockApi);
  });

  test("lists the tags assigned to the tool and offers the others", async ({ page, mockApi }) => {
    mockApi.entityTags.set(`Tool:${TOOL_IDS.http}`, [TAG_IDS.plain]);
    const form = new ToolFormPage(page);
    const tags = new TagsPanel(page);
    await form.gotoEdit(TOOL_IDS.http);

    await tags.expectAssigned("E2E Tag");
    await tags.expectNotAssigned("E2E Priority");
    await tags.picker.click();
    await expect(page.getByRole("option", { name: "E2E Priority" })).toBeVisible();
    await expect(page.getByRole("option", { name: "E2E Archive" })).toBeVisible();
    // A tag that is already assigned is not offered again.
    await expect(page.getByRole("option", { name: "E2E Tag" })).toHaveCount(0);
  });

  test("shows a hint when the tool has no tags", async ({ page }) => {
    const form = new ToolFormPage(page);
    const tags = new TagsPanel(page);
    await form.gotoEdit(TOOL_IDS.http);

    await tags.expectNoTags();
  });

  test("the Add button is disabled until a tag is chosen", async ({ page }) => {
    const form = new ToolFormPage(page);
    const tags = new TagsPanel(page);
    await form.gotoEdit(TOOL_IDS.http);
    await expect(tags.addButton).toBeDisabled();

    await tags.picker.click();
    await page.getByRole("option", { name: "E2E Priority" }).click();

    await expect(tags.addButton).toBeEnabled();
  });

  test("assigning a tag posts it, shows a toast and lists the tag", async ({ page, mockApi }) => {
    const form = new ToolFormPage(page);
    const tags = new TagsPanel(page);
    const toast = new Toast(page);
    await form.gotoEdit(TOOL_IDS.http);

    await tags.assign("E2E Priority");

    await toast.expectShown("Tag assigned");
    await tags.expectAssigned("E2E Priority");
    const [post] = mockApi.requestsTo("POST", "/md/api/v1/tenant/tag/:tagId/entity");
    expect(post.path).toBe(`/md/api/v1/tenant/tag/${TAG_IDS.colored}/entity`);
    expect(post.body).toEqual({ id: TAG_IDS.colored, entityType: "Tool", entityId: TOOL_IDS.http });
    // The picker is reset and no longer offers the assigned tag.
    await expect(tags.picker).toBeVisible();
    await expect(tags.addButton).toBeDisabled();
    await tags.picker.click();
    await expect(page.getByRole("option", { name: "E2E Priority" })).toHaveCount(0);
  });

  test("removing a tag deletes the assignment, shows a toast and offers the tag again", async ({ page, mockApi }) => {
    mockApi.entityTags.set(`Tool:${TOOL_IDS.http}`, [TAG_IDS.plain, TAG_IDS.colored]);
    const form = new ToolFormPage(page);
    const tags = new TagsPanel(page);
    const toast = new Toast(page);
    await form.gotoEdit(TOOL_IDS.http);

    await tags.remove("E2E Tag");

    await toast.expectShown("Tag removed");
    await tags.expectNotAssigned("E2E Tag");
    await tags.expectAssigned("E2E Priority");
    expect(mockApi.requestsTo("DELETE", "/md/api/v1/tenant/tag/:tagId/entity/:entityType/:entityId").map((request) => request.path)).toEqual([
      `/md/api/v1/tenant/tag/${TAG_IDS.plain}/entity/Tool/${TOOL_IDS.http}`,
    ]);
    await tags.picker.click();
    await expect(page.getByRole("option", { name: "E2E Tag" })).toBeVisible();
  });

  test("removing the last tag brings back the empty hint", async ({ page, mockApi }) => {
    mockApi.entityTags.set(`Tool:${TOOL_IDS.http}`, [TAG_IDS.plain]);
    const form = new ToolFormPage(page);
    const tags = new TagsPanel(page);
    await form.gotoEdit(TOOL_IDS.http);

    await tags.remove("E2E Tag");

    await tags.expectNoTags();
  });

  test("shows a message when every tag is already assigned", async ({ page, mockApi }) => {
    mockApi.entityTags.set(`Tool:${TOOL_IDS.http}`, [TAG_IDS.plain, TAG_IDS.colored, TAG_IDS.uncolored]);
    const form = new ToolFormPage(page);
    const tags = new TagsPanel(page);
    await form.gotoEdit(TOOL_IDS.http);

    await expect(page.getByText("All available tags have been assigned.")).toBeVisible();
    await expect(tags.picker).toHaveCount(0);
  });

  test("assignments are kept per tool and survive a reload", async ({ page }) => {
    const form = new ToolFormPage(page);
    const tags = new TagsPanel(page);
    await form.gotoEdit(TOOL_IDS.http);
    await tags.assign("E2E Priority");
    await tags.expectAssigned("E2E Priority");

    await page.reload();
    await tags.expectAssigned("E2E Priority");

    await form.gotoEdit(TOOL_IDS.priorityQa);
    await tags.expectNoTags();
  });

  test("assigned tags show on the tool's card in the list", async ({ page }) => {
    const form = new ToolFormPage(page);
    const tags = new TagsPanel(page);
    await form.gotoEdit(TOOL_IDS.http);
    await tags.assign("E2E Priority");
    await tags.expectAssigned("E2E Priority");

    await form.backButton.click();

    const list = new ToolsListPage(page);
    await expect(list.card("E2E Lookup Tool").getByText("E2E Priority", { exact: true })).toBeVisible();
    await expect(list.card("E2E Priority Answers").getByText("E2E Priority", { exact: true })).toHaveCount(0);
  });

  test("saving the tool does not change its tags", async ({ page, mockApi }) => {
    mockApi.entityTags.set(`Tool:${TOOL_IDS.http}`, [TAG_IDS.plain]);
    const form = new ToolFormPage(page);
    const tags = new TagsPanel(page);
    const toast = new Toast(page);
    await form.gotoEdit(TOOL_IDS.http);

    await form.nameInput.fill("E2E Lookup Tool Tagged");
    await form.saveButton.click();

    await toast.expectShown("Tool updated");
    await tags.expectAssigned("E2E Tag");
    expect(mockApi.requestsTo("POST", "/md/api/v1/tenant/tag/:tagId/entity")).toHaveLength(0);
  });

  test.describe("when no tags exist", () => {
    test("a super power user is offered a link to create one", async ({ page, mockApi }) => {
      mockApi.seed.tags.splice(0);
      const form = new ToolFormPage(page);
      await form.gotoEdit(TOOL_IDS.http);

      await expect(page.getByText("No tags exist yet.")).toBeVisible();
      await expect(page.getByRole("link", { name: "Create a tag" })).toHaveAttribute("href", "/tags/create");
    });

    test.describe("as a user who is not a super power user", () => {
      test.use({ isSuperPowerUser: false });

      test("the message has no link to create one", async ({ page, mockApi }) => {
        mockApi.seed.tags.splice(0);
        const form = new ToolFormPage(page);
        await form.gotoEdit(TOOL_IDS.http);

        await expect(page.getByText("No tags exist yet.")).toBeVisible();
        await expect(page.getByRole("link", { name: "Create a tag" })).toHaveCount(0);
      });
    });
  });

  test.describe("as a user who is not a super power user", () => {
    test.use({ isSuperPowerUser: false });

    test("can still assign and remove tags", async ({ page }) => {
      const form = new ToolFormPage(page);
      const tags = new TagsPanel(page);
      await form.gotoEdit(TOOL_IDS.http);

      await tags.assign("E2E Tag");
      await tags.expectAssigned("E2E Tag");
      await tags.remove("E2E Tag");

      await tags.expectNoTags();
    });
  });

  test.describe("failing requests", () => {
    test.use({ allowedConsoleErrors: [FAILED_REQUEST_LOG] });

    test("assigning a tag that is already assigned shows an error toast (WKFLOMD0903)", async ({ page, mockApi }) => {
      const form = new ToolFormPage(page);
      const tags = new TagsPanel(page);
      const toast = new Toast(page);
      await form.gotoEdit(TOOL_IDS.http);
      // Assigned from another tab after this page loaded.
      mockApi.entityTags.set(`Tool:${TOOL_IDS.http}`, [TAG_IDS.colored]);

      await tags.assign("E2E Priority");

      // Known bug: see US 8186 item 48 (the toast prints the raw "400: {json}" body, untranslated).
      await toast.expectShown(/Failed to assign tag: 400: \{.*"WKFLOMD0903".*\}/);
      await tags.expectNotAssigned("E2E Priority");
    });

    test("removing an assignment that no longer exists shows an error toast (WKFLOMD0904)", async ({ page, mockApi }) => {
      mockApi.entityTags.set(`Tool:${TOOL_IDS.http}`, [TAG_IDS.plain]);
      const form = new ToolFormPage(page);
      const tags = new TagsPanel(page);
      const toast = new Toast(page);
      await form.gotoEdit(TOOL_IDS.http);
      // Removed from another tab after this page loaded.
      mockApi.entityTags.set(`Tool:${TOOL_IDS.http}`, []);

      await tags.remove("E2E Tag");

      // Known bug: see US 8186 item 48 (the toast prints the raw "status: {json}" body, untranslated).
      await toast.expectShown(/Failed to remove tag: 404: \{.*"WKFLOMD0904".*\}/);
      // The chip stays, because the list was not refetched after the failure.
      await tags.expectAssigned("E2E Tag");
    });

    test("assigning a tag that was deleted meanwhile shows an error toast (WKFLOMD0901)", async ({ page, mockApi }) => {
      mockApi.on("POST", "/md/api/v1/tenant/tag/:tagId/entity", () => errorReply(400, ["Tag", "WKFLOMD0901"]));
      const form = new ToolFormPage(page);
      const tags = new TagsPanel(page);
      const toast = new Toast(page);
      await form.gotoEdit(TOOL_IDS.http);

      await tags.assign("E2E Archive");

      // Known bug: see US 8186 item 48 (the toast prints the raw "status: {json}" body, untranslated).
      await toast.expectShown(/Failed to assign tag: 400: \{.*"WKFLOMD0901".*\}/);
      await tags.expectNoTags();
      expect(mockApi.requestsTo("GET", ENTITY_TAGS)).toHaveLength(1);
    });
  });
});
