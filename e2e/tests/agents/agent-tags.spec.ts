import { expect, test } from "../../support/test";
import { reply } from "../../support/mock-api";
import { TagsPanel } from "../../pages/components/tags-panel";
import { Toast } from "../../pages/components/toast";
import { installAgentsMocks } from "../../support/mocks/agents";

const SERVER_ERROR_LOG = /Failed to load resource: the server responded with a status of 500/;

test.describe("Agent tags panel", () => {
  test.beforeEach(({ mockApi }) => installAgentsMocks(mockApi));

  test("starts empty and Add stays disabled until a tag is chosen", async ({ page }) => {
    const tags = new TagsPanel(page);
    await page.goto("/agents/1/edit");

    await tags.expectNoTags();
    await expect(tags.picker).toBeVisible();
    await expect(tags.addButton).toBeDisabled();

    await tags.picker.click();
    await page.getByRole("option", { name: "E2E Tag" }).click();
    await expect(tags.addButton).toBeEnabled();
  });

  test("adding a tag posts the assignment, shows a toast and lists the tag", async ({ page, mockApi }) => {
    const tags = new TagsPanel(page);
    await page.goto("/agents/1/edit");
    await tags.assign("E2E Tag");

    await new Toast(page).expectShown("Tag assigned");
    await tags.expectAssigned("E2E Tag");
    const [post] = mockApi.requestsTo("POST", "/md/api/v1/tenant/tag/:tagId/entity");
    expect(post.path).toBe("/md/api/v1/tenant/tag/1/entity");
    expect(post.body).toEqual({ id: 1, entityType: "Agent", entityId: 1 });
    expect(mockApi.entityTags.get("Agent:1")).toEqual([1]);
    // Every tag is assigned now, so the picker is replaced by a message.
    await expect(page.getByText("All available tags have been assigned.")).toBeVisible();
  });

  test("removing a tag deletes the assignment, shows a toast and offers the tag again", async ({ page, mockApi }) => {
    mockApi.entityTags.set("Agent:1", [1]);
    const tags = new TagsPanel(page);
    await page.goto("/agents/1/edit");
    await tags.expectAssigned("E2E Tag");
    await tags.remove("E2E Tag");

    await new Toast(page).expectShown("Tag removed");
    await tags.expectNotAssigned("E2E Tag");
    await tags.expectNoTags();
    expect(mockApi.requestsTo("DELETE", "/md/api/v1/tenant/tag/:tagId/entity/:entityType/:entityId").map((request) => request.path)).toEqual([
      "/md/api/v1/tenant/tag/1/entity/Agent/1",
    ]);
    expect(mockApi.entityTags.get("Agent:1")).toEqual([]);
    await expect(tags.picker).toBeVisible();
  });

  test("tags belong to one agent: another agent's tags are not shown", async ({ page, mockApi }) => {
    mockApi.entityTags.set("Agent:2", [1]);
    const tags = new TagsPanel(page);
    await page.goto("/agents/1/edit");

    await tags.expectNoTags();
    await tags.expectNotAssigned("E2E Tag");
  });

  test("shows a hint when no tags exist at all", async ({ page, mockApi }) => {
    mockApi.seed.tags.splice(0);
    await page.goto("/agents/1/edit");

    await expect(page.getByText("No tags exist yet.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Create a tag" })).toHaveAttribute("href", "/tags/create");
  });

  test.describe("standard user", () => {
    test.use({ isSuperPowerUser: false });

    test("sees the empty-tags hint without the create link", async ({ page, mockApi }) => {
      mockApi.seed.tags.splice(0);
      await page.goto("/agents/1/edit");

      await expect(page.getByText("No tags exist yet.")).toBeVisible();
      await expect(page.getByRole("link", { name: "Create a tag" })).toHaveCount(0);
    });
  });

  test.describe("server errors", () => {
    test.use({ allowedConsoleErrors: [SERVER_ERROR_LOG] });

    test("a failed assignment shows an error toast and assigns nothing", async ({ page, mockApi }) => {
      mockApi.on("POST", "/md/api/v1/tenant/tag/:tagId/entity", () => reply({ message: "Boom" }, 500));
      const tags = new TagsPanel(page);
      await page.goto("/agents/1/edit");
      await tags.assign("E2E Tag");

      await new Toast(page).expectShown("Failed to assign tag");
      await tags.expectNoTags();
    });

    test("a failed removal shows an error toast and keeps the tag", async ({ page, mockApi }) => {
      mockApi.entityTags.set("Agent:1", [1]);
      mockApi.on("DELETE", "/md/api/v1/tenant/tag/:tagId/entity/:entityType/:entityId", () => reply({ message: "Boom" }, 500));
      const tags = new TagsPanel(page);
      await page.goto("/agents/1/edit");
      await tags.remove("E2E Tag");

      await new Toast(page).expectShown("Failed to remove tag");
      await tags.expectAssigned("E2E Tag");
    });
  });
});
