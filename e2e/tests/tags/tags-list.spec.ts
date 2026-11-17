import { expect, test } from "../../support/test";
import { reply } from "../../support/mock-api";
import { TagsListPage } from "../../pages/tags/tags-list.page";
import { Toast } from "../../pages/components/toast";
import { errorReply } from "../../support/mocks/tools";
import { installTagsMocks, TAG_IDS } from "../../support/mocks/tags";

const TAG_NAMES = ["E2E Tag", "E2E Priority", "E2E Archive"];

// The browser logs every non-2xx response as a console error; the error-path tests mock a 400 on purpose.
const FAILED_REQUEST_LOG = /Failed to load resource: the server responded with a status of 400/;

test.describe("Tags list", () => {
  test.beforeEach(({ mockApi }) => installTagsMocks(mockApi));

  test("shows a card per tag with its colour and dates", async ({ page }) => {
    const list = new TagsListPage(page);
    await list.goto();

    for (const name of TAG_NAMES) await expect(list.cardTitle(name)).toBeVisible();
    await expect(list.card("E2E Tag")).toContainText("#3b82f6");
    await expect(list.card("E2E Priority")).toContainText("#ef4444");
    // A tag without a colour shows no colour code.
    await expect(list.card("E2E Archive")).not.toContainText("#");
    // "Updated" is shown only for a tag that was edited.
    await expect(list.card("E2E Priority")).toContainText("Updated:");
    await expect(list.card("E2E Tag")).not.toContainText("Updated:");
    await expect(list.card("E2E Tag")).toContainText("Created:");
  });

  test("the colour swatch uses the tag's colour", async ({ page }) => {
    const list = new TagsListPage(page);
    await list.goto();

    await expect(list.card("E2E Priority").locator("div.rounded-full").first()).toHaveCSS("background-color", "rgb(239, 68, 68)");
    // A tag without a colour gets the neutral grey.
    await expect(list.card("E2E Archive").locator("div.rounded-full").first()).toHaveCSS("background-color", "rgb(229, 231, 235)");
  });

  test("Create Tag opens the create page", async ({ page }) => {
    const list = new TagsListPage(page);
    await list.goto();
    await list.createButton.click();

    await list.expectPath("/tags/create");
    await expect(page.getByRole("heading", { name: "Create New Tag" })).toBeVisible();
  });

  test("shows an empty state when there are no tags, and its button opens the create page", async ({ page, mockApi }) => {
    mockApi.seed.tags.splice(0);
    const list = new TagsListPage(page);
    await list.goto();

    await expect(list.emptyStateHeading).toBeVisible();
    await expect(page.getByText("Create your first tag to get started")).toBeVisible();
    await page.getByRole("button", { name: "Create Tag" }).last().click();
    await list.expectPath("/tags/create");
  });

  test("search filters the cards by name, case-insensitively, and shows the empty state for no match", async ({ page }) => {
    const list = new TagsListPage(page);
    await list.goto();

    await list.searchBox.fill("PRIOR");
    await expect(list.cardTitle("E2E Priority")).toBeVisible();
    await expect(list.cardTitle("E2E Tag")).toHaveCount(0);
    await expect(list.cardTitle("E2E Archive")).toHaveCount(0);

    await list.searchBox.fill("no such tag");
    await expect(list.emptyStateHeading).toBeVisible();

    await list.searchBox.fill("");
    for (const name of TAG_NAMES) await expect(list.cardTitle(name)).toBeVisible();
  });

  test("the view toggle switches between a multi-column grid and a single-column list", async ({ page }) => {
    const list = new TagsListPage(page);
    await list.goto();

    await expect(list.gridViewButton).toHaveAttribute("aria-pressed", "true");
    await expect(list.cardsContainer()).toHaveClass(/md:grid-cols-2/);

    await list.listViewButton.click();
    await expect(list.listViewButton).toHaveAttribute("aria-pressed", "true");
    await expect(list.gridViewButton).toHaveAttribute("aria-pressed", "false");
    await expect(list.cardsContainer()).not.toHaveClass(/md:grid-cols-2/);
    await expect(list.editButton("E2E Tag")).toBeVisible();

    await list.gridViewButton.click();
    await expect(list.cardsContainer()).toHaveClass(/md:grid-cols-2/);
  });

  test("clicking a card and the pencil button both open the edit page", async ({ page }) => {
    const list = new TagsListPage(page);
    await list.goto();

    await list.cardTitle("E2E Priority").click();
    await list.expectPath(`/tags/${TAG_IDS.colored}/edit`);
    await expect(page.getByRole("heading", { name: "Edit Tag" })).toBeVisible();

    await list.goto();
    await list.editButton("E2E Tag").click();
    await list.expectPath(`/tags/${TAG_IDS.plain}/edit`);
  });

  test.describe("delete", () => {
    test("confirming deletes the tag, shows a toast and removes the card", async ({ page, mockApi }) => {
      const list = new TagsListPage(page);
      const toast = new Toast(page);
      await list.goto();

      await list.deleteButton("E2E Tag").click();
      await list.deleteDialog.expectVisible();
      await list.deleteDialog.expectText('permanently delete the tag "E2E Tag"');
      await list.deleteDialog.confirm("Delete");

      await toast.expectShown("Tag deleted");
      expect(mockApi.requestsTo("DELETE", "/md/api/v1/tenant/tag/:id").map((request) => request.path)).toEqual([
        `/md/api/v1/tenant/tag/${TAG_IDS.plain}`,
      ]);
      await expect(list.cardTitle("E2E Tag")).toHaveCount(0);
      await expect(list.cardTitle("E2E Priority")).toBeVisible();
      await list.expectPath("/tags");
    });

    test("cancelling closes the dialog and keeps the tag", async ({ page, mockApi }) => {
      const list = new TagsListPage(page);
      await list.goto();

      await list.deleteButton("E2E Tag").click();
      await list.deleteDialog.cancel();

      await list.deleteDialog.expectClosed();
      await expect(list.cardTitle("E2E Tag")).toBeVisible();
      expect(mockApi.requestsTo("DELETE", "/md/api/v1/tenant/tag/:id")).toHaveLength(0);
    });

    test("a deleted tag is also gone from the tools it was assigned to", async ({ page, mockApi }) => {
      mockApi.entityTags.set("Tool:1", [TAG_IDS.plain]);
      const list = new TagsListPage(page);
      await list.goto();
      await list.deleteButton("E2E Tag").click();
      await list.deleteDialog.confirm("Delete");
      await expect(list.cardTitle("E2E Tag")).toHaveCount(0);

      // The tags list is cached, so the tool page asks for the tag assignments again.
      await page.goto("/tools/1/edit");

      await expect(page.getByText("No tags assigned yet.")).toBeVisible();
    });

    test.describe("failing delete", () => {
      test.use({ allowedConsoleErrors: [FAILED_REQUEST_LOG] });

      test("shows an error toast and keeps the card when the tag no longer exists", async ({ page, mockApi }) => {
        const list = new TagsListPage(page);
        const toast = new Toast(page);
        await list.goto();
        // Deleted elsewhere after the list loaded: the command validator answers WKFLOMD0901.
        mockApi.on("DELETE", "/md/api/v1/tenant/tag/:id", () => errorReply(400, ["Tag", "WKFLOMD0901"]));

        await list.deleteButton("E2E Tag").click();
        await list.deleteDialog.confirm("Delete");

        // Known bug: see US 8186 item 48 (the toast prints the raw "400: {json}" body, untranslated).
        await toast.expectShown(/Failed to delete tag: 400: \{.*"WKFLOMD0901".*\}/);
        await expect(list.cardTitle("E2E Tag")).toBeVisible();
      });
    });
  });

  test.describe("as a user who is not a super power user", () => {
    test.use({ isSuperPowerUser: false });

    test("every tags page sends the user to the dashboard without loading tags", async ({ page, mockApi }) => {
      for (const path of ["/tags", "/tags/create", `/tags/${TAG_IDS.plain}/edit`]) {
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
        await expect(page).toHaveURL((url) => url.pathname === "/");
      }
      expect(mockApi.requestsTo("GET", /^\/md\/api\/v1\/tenant\/tags?(\/\d+)?$/)).toHaveLength(0);
      expect(mockApi.requestsTo("POST", "/md/api/v1/tenant/tag")).toHaveLength(0);
    });
  });
});
