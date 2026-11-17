import { expect, test } from "../../support/test";
import { reply } from "../../support/mock-api";
import { ToolsListPage } from "../../pages/tools/tools-list.page";
import { Toast } from "../../pages/components/toast";
import { createToolFixtures, errorReply, installToolsMocks, TOOL_IDS, type ToolsStore } from "../../support/mocks/tools";

const FIXTURE_NAMES = createToolFixtures().map((tool) => tool.name);

// The browser logs every non-2xx response as a console error; the error-path tests mock 400 / 404 on purpose.
const FAILED_REQUEST_LOG = /Failed to load resource: the server responded with a status of (400|404)/;

test.describe("Tools list", () => {
  let store: ToolsStore;
  test.beforeEach(({ mockApi }) => {
    store = installToolsMocks(mockApi);
  });

  test("shows a card per tool with its type and publish state", async ({ page }) => {
    const list = new ToolsListPage(page);
    await list.goto();

    for (const name of FIXTURE_NAMES) await expect(list.cardTitle(name)).toBeVisible();
    await expect(page.getByText("Looks up a record over HTTP.")).toBeVisible();

    // Type badges: a Priority Q&A card counts its pairs, a Chat Classification card its topics.
    await expect(list.card("E2E Priority Answers")).toContainText("Priority Q&A");
    await expect(list.card("E2E Priority Answers")).toContainText("2 pairs");
    await expect(list.card("E2E Topic Classifier")).toContainText("Chat Classification");
    await expect(list.card("E2E Topic Classifier")).toContainText("3 topics");
    await expect(list.card("E2E Contact Form")).toContainText("Contact Form");
    await expect(list.card("E2E Image Editor")).toContainText("Image to Image");
    await expect(list.card("E2E Lookup Tool")).toContainText("HTTP");

    // Publish states: never published, published, and published then edited.
    await expect(list.card("E2E Lookup Tool").getByTestId("tool-publish-badge")).toHaveText("Unpublished");
    await expect(list.card("E2E Priority Answers").getByTestId("tool-publish-badge")).toHaveText("Published");
    await expect(list.card("E2E Topic Classifier").getByTestId("tool-publish-badge")).toHaveText("Unpublished changes");
    // Only the library is in the marketplace.
    await expect(page.getByText("Shared", { exact: true })).toHaveCount(1);
    await expect(list.card("E2E Document Library")).toContainText("Shared");
  });

  test("shows the tags assigned to a tool on its card", async ({ page, mockApi }) => {
    mockApi.entityTags.set(`Tool:${TOOL_IDS.http}`, [1]);
    const list = new ToolsListPage(page);
    await list.goto();

    await expect(list.card("E2E Lookup Tool").getByText("E2E Tag", { exact: true })).toBeVisible();
    await expect(list.card("E2E Priority Answers").getByText("E2E Tag", { exact: true })).toHaveCount(0);
  });

  test("Create Tool opens the create page", async ({ page }) => {
    const list = new ToolsListPage(page);
    await list.goto();
    await list.createButton.click();

    await list.expectPath("/tools/create");
    await expect(page.getByRole("heading", { name: "Create New Tool" })).toBeVisible();
  });

  test("shows an empty state when there are no tools, and its button opens the create page", async ({ page, mockApi }) => {
    installToolsMocks(mockApi, { tools: [] });
    const list = new ToolsListPage(page);
    await list.goto();

    await expect(list.emptyStateHeading).toBeVisible();
    await expect(page.getByText("Create your first tool to get started")).toBeVisible();
    await page.getByRole("button", { name: "Create Tool" }).last().click();
    await list.expectPath("/tools/create");
  });

  test("search filters the cards by name, case-insensitively, and shows the empty state for no match", async ({ page }) => {
    const list = new ToolsListPage(page);
    await list.goto();

    await list.searchBox.fill("CONTACT");
    await expect(list.cardTitle("E2E Contact Form")).toBeVisible();
    await expect(list.cardTitle("E2E Lookup Tool")).toHaveCount(0);
    await expect(list.cardTitle("E2E Image Editor")).toHaveCount(0);

    await list.searchBox.fill("no such tool");
    await expect(list.emptyStateHeading).toBeVisible();

    await list.searchBox.fill("");
    for (const name of FIXTURE_NAMES) await expect(list.cardTitle(name)).toBeVisible();
  });

  test("search only matches the name, not the description", async ({ page }) => {
    const list = new ToolsListPage(page);
    await list.goto();

    // "record" is in the HTTP tool's description only.
    await list.searchBox.fill("record");
    await expect(list.emptyStateHeading).toBeVisible();
    await expect(list.cardTitle("E2E Lookup Tool")).toHaveCount(0);
  });

  test("the view toggle switches between a multi-column grid and a single-column list", async ({ page }) => {
    const list = new ToolsListPage(page);
    await list.goto();

    await expect(list.gridViewButton).toHaveAttribute("aria-pressed", "true");
    await expect(list.cardsContainer()).toHaveClass(/md:grid-cols-2/);

    await list.listViewButton.click();
    await expect(list.listViewButton).toHaveAttribute("aria-pressed", "true");
    await expect(list.gridViewButton).toHaveAttribute("aria-pressed", "false");
    await expect(list.cardsContainer()).not.toHaveClass(/md:grid-cols-2/);
    // The list layout keeps every card and its actions.
    await expect(list.editButton("E2E Lookup Tool")).toBeVisible();

    await list.gridViewButton.click();
    await expect(list.cardsContainer()).toHaveClass(/md:grid-cols-2/);
  });

  test("clicking a card opens the edit page", async ({ page }) => {
    const list = new ToolsListPage(page);
    await list.goto();
    await list.cardTitle("E2E Priority Answers").click();

    await list.expectPath(`/tools/${TOOL_IDS.priorityQa}/edit`);
    await expect(page.getByRole("heading", { name: "Edit Tool" })).toBeVisible();
  });

  test("the pencil button opens the edit page", async ({ page }) => {
    const list = new ToolsListPage(page);
    await list.goto();
    await list.editButton("E2E Lookup Tool").click();

    await list.expectPath(`/tools/${TOOL_IDS.http}/edit`);
    await expect(page.getByRole("heading", { name: "Edit Tool" })).toBeVisible();
  });

  test.describe("active switch", () => {
    test("disabling an active tool sends only isActive: false and shows a success toast", async ({ page, mockApi }) => {
      const list = new ToolsListPage(page);
      const toast = new Toast(page);
      await list.goto();
      await expect(list.activeSwitch("E2E Lookup Tool")).toBeChecked();

      await list.activeSwitch("E2E Lookup Tool").click();

      await toast.expectShown("Tool disabled");
      const [put] = mockApi.requestsTo("PUT", "/md/api/v1/tenant/tool/:id");
      expect(put.path).toBe(`/md/api/v1/tenant/tool/${TOOL_IDS.http}`);
      expect(put.body).toEqual({ isActive: false });
      // The list is refetched and the card reflects the stored state; the click did not open the tool.
      await expect(list.activeSwitch("E2E Lookup Tool")).not.toBeChecked();
      await list.expectPath("/tools");
    });

    test("enabling an inactive tool sends isActive: true", async ({ page, mockApi }) => {
      const list = new ToolsListPage(page);
      const toast = new Toast(page);
      await list.goto();
      await expect(list.activeSwitch("E2E Contact Form")).not.toBeChecked();

      await list.activeSwitch("E2E Contact Form").click();

      await toast.expectShown("Tool enabled");
      expect(mockApi.requestsTo("PUT", "/md/api/v1/tenant/tool/:id")[0].body).toEqual({ isActive: true });
      await expect(list.activeSwitch("E2E Contact Form")).toBeChecked();
    });

    test("toggling a published tool marks it as having unpublished changes", async ({ page }) => {
      const list = new ToolsListPage(page);
      await list.goto();
      const badge = list.card("E2E Priority Answers").getByTestId("tool-publish-badge");
      await expect(badge).toHaveText("Published");

      await list.activeSwitch("E2E Priority Answers").click();

      // The backend stamps the draft's update time on any change, so the published copy is now older.
      await expect(badge).toHaveText("Unpublished changes");
    });

    test.describe("failing update", () => {
      test.use({ allowedConsoleErrors: [FAILED_REQUEST_LOG] });

      test("shows an error toast and leaves the switch unchanged when the tool no longer exists", async ({ page }) => {
        const list = new ToolsListPage(page);
        const toast = new Toast(page);
        await list.goto();
        // Wait for the list first: deleting the tool before its GET is answered leaves it out of the list (flaky under load).
        await expect(list.activeSwitch("E2E Lookup Tool")).toBeChecked();
        // Deleted elsewhere after the list loaded. The toggle PUT carries only isActive and the endpoint has no stored tool to
        // merge, so the real answer is 400 with WKFLOMD0002 for Name, Description, Type and Config plus Tool/WKFLOMD0402.
        store.tools[0].isDeleted = true;

        await list.activeSwitch("E2E Lookup Tool").click();

        // Known bug: see US 8186 item 48 (the toast prints the raw "400: {json}" body, untranslated).
        await toast.expectShown(/(?=[\s\S]*"WKFLOMD0002")(?=[\s\S]*"WKFLOMD0402")Failed to toggle tool status: 400: \{/);
        await expect(list.activeSwitch("E2E Lookup Tool")).toBeChecked();
      });
    });
  });

  test.describe("publish", () => {
    test("confirming publishes the tool, shows a toast and updates its badge and date", async ({ page, mockApi }) => {
      const list = new ToolsListPage(page);
      const toast = new Toast(page);
      await list.goto();
      const card = list.card("E2E Lookup Tool");
      await expect(card).toContainText("Published: N/A");

      await list.publishButton("E2E Lookup Tool").click();
      await list.publishDialog().expectVisible();
      await list.publishDialog().expectText("Are you sure you want to publish this tool?");
      await list.publishDialog().confirm("Publish");

      await toast.expectShown("Tool published");
      expect(mockApi.requestsTo("POST", "/md/api/v1/tenant/tool/:id/publish").map((request) => request.path)).toEqual([
        `/md/api/v1/tenant/tool/${TOOL_IDS.http}/publish`,
      ]);
      await expect(card.getByTestId("tool-publish-badge")).toHaveText("Published");
      await expect(card).not.toContainText("Published: N/A");
      await list.expectPath("/tools");
    });

    test("republishing a tool with unpublished changes clears the changes badge", async ({ page }) => {
      const list = new ToolsListPage(page);
      await list.goto();
      const badge = list.card("E2E Topic Classifier").getByTestId("tool-publish-badge");
      await expect(badge).toHaveText("Unpublished changes");

      await list.publishButton("E2E Topic Classifier").click();
      await list.publishDialog().confirm("Publish");

      await expect(badge).toHaveText("Published");
    });

    test("cancelling closes the dialog without publishing", async ({ page, mockApi }) => {
      const list = new ToolsListPage(page);
      await list.goto();

      await list.publishButton("E2E Lookup Tool").click();
      await list.publishDialog().cancel();

      await list.publishDialog().expectClosed();
      await expect(list.card("E2E Lookup Tool").getByTestId("tool-publish-badge")).toHaveText("Unpublished");
      expect(mockApi.requestsTo("POST", "/md/api/v1/tenant/tool/:id/publish")).toHaveLength(0);
    });

    test.describe("failing publish", () => {
      test.use({ allowedConsoleErrors: [FAILED_REQUEST_LOG] });

      test("shows the error code when the tool no longer exists", async ({ page, mockApi }) => {
        const list = new ToolsListPage(page);
        const toast = new Toast(page);
        await list.goto();
        // The tool is deleted elsewhere after the list loaded: the command validator answers WKFLOMD0402.
        const store = installToolsMocks(mockApi, { tools: [] });
        expect(store.tools).toHaveLength(0);

        await list.publishButton("E2E Lookup Tool").click();
        await list.publishDialog().confirm("Publish");

        // The code has no entry in en.json, so the toast falls back to the code itself.
        await toast.expectShown("Failed to publish tool: WKFLOMD0402");
        await expect(list.card("E2E Lookup Tool").getByTestId("tool-publish-badge")).toHaveText("Unpublished");
      });
    });
  });

  test.describe("share to marketplace", () => {
    test("confirming shares a published tool and shows its Shared badge", async ({ page, mockApi }) => {
      const list = new ToolsListPage(page);
      const toast = new Toast(page);
      await list.goto();
      const card = list.card("E2E Priority Answers");
      await expect(card.getByText("Unshared", { exact: true })).toBeVisible();

      await list.shareButton("E2E Priority Answers").click();
      await list.shareDialog().expectVisible();
      await list.shareDialog().expectText("publicly available to all users");
      await list.shareDialog().confirm("Share");

      await toast.expectShown("Tool shared");
      expect(mockApi.requestsTo("POST", "/md/api/v1/tenant/tool/:id/share").map((request) => request.path)).toEqual([
        `/md/api/v1/tenant/tool/${TOOL_IDS.priorityQa}/share`,
      ]);
      await expect(card.getByText("Shared", { exact: true })).toBeVisible();
      await expect(card.getByText("Unshared", { exact: true })).toHaveCount(0);
    });

    test("cancelling closes the dialog without sharing", async ({ page, mockApi }) => {
      const list = new ToolsListPage(page);
      await list.goto();

      await list.shareButton("E2E Priority Answers").click();
      await list.shareDialog().cancel();

      await list.shareDialog().expectClosed();
      expect(mockApi.requestsTo("POST", "/md/api/v1/tenant/tool/:id/share")).toHaveLength(0);
    });

    test.describe("failing share", () => {
      test.use({ allowedConsoleErrors: [FAILED_REQUEST_LOG] });

      test("asks to publish first when the tool was never published (WKFLOMD0404)", async ({ page }) => {
        const list = new ToolsListPage(page);
        const toast = new Toast(page);
        await list.goto();

        await list.shareButton("E2E Lookup Tool").click();
        await list.shareDialog().confirm("Share");

        await toast.expectShown(
          "Failed to share tool: No published version found for this tenant tool. Please publish the tool first before sharing.",
        );
        await expect(list.card("E2E Lookup Tool").getByText("Unshared", { exact: true })).toBeVisible();
      });

      test("asks to republish when the tool changed after it was published (WKFLOMD0405)", async ({ page }) => {
        const list = new ToolsListPage(page);
        const toast = new Toast(page);
        await list.goto();

        await list.shareButton("E2E Topic Classifier").click();
        await list.shareDialog().confirm("Share");

        await toast.expectShown("Failed to share tool: The published tool is outdated. Please republish the tool before sharing.");
        await expect(list.card("E2E Topic Classifier").getByText("Unshared", { exact: true })).toBeVisible();
      });
    });

    test.describe("as a user who is not a super power user", () => {
      test.use({ isSuperPowerUser: false });

      test("the share button is not offered, while publish and delete still are", async ({ page }) => {
        const list = new ToolsListPage(page);
        await list.goto();

        await expect(list.publishButton("E2E Priority Answers")).toBeVisible();
        await expect(list.deleteButton("E2E Priority Answers")).toBeVisible();
        await expect(page.getByRole("button", { name: "Share Tool to Marketplace" })).toHaveCount(0);
      });
    });
  });

  test.describe("delete", () => {
    test("confirming deletes the tool, shows a toast and removes the card", async ({ page, mockApi }) => {
      const list = new ToolsListPage(page);
      const toast = new Toast(page);
      await list.goto();

      await list.deleteButton("E2E Lookup Tool").click();
      await list.deleteDialog().expectVisible();
      await list.deleteDialog().expectText("permanently delete the tool");
      await list.deleteDialog().confirm("Delete");

      await toast.expectShown("Tool deleted");
      expect(mockApi.requestsTo("DELETE", "/md/api/v1/tenant/tool/:id").map((request) => request.path)).toEqual([
        `/md/api/v1/tenant/tool/${TOOL_IDS.http}`,
      ]);
      await expect(list.cardTitle("E2E Lookup Tool")).toHaveCount(0);
      await expect(list.cardTitle("E2E Priority Answers")).toBeVisible();
      await list.expectPath("/tools");
    });

    test("cancelling closes the dialog and keeps the tool", async ({ page, mockApi }) => {
      const list = new ToolsListPage(page);
      await list.goto();

      await list.deleteButton("E2E Lookup Tool").click();
      await list.deleteDialog().cancel();

      await list.deleteDialog().expectClosed();
      await expect(list.cardTitle("E2E Lookup Tool")).toBeVisible();
      expect(mockApi.requestsTo("DELETE", "/md/api/v1/tenant/tool/:id")).toHaveLength(0);
    });

    test.describe("failing delete", () => {
      test.use({ allowedConsoleErrors: [FAILED_REQUEST_LOG] });

      test("shows an error toast and keeps the card when the delete fails", async ({ page, mockApi }) => {
        mockApi.on("DELETE", "/md/api/v1/tenant/tool/:id", () => errorReply(400, ["Tool", "WKFLOMD0402"]));
        const list = new ToolsListPage(page);
        const toast = new Toast(page);
        await list.goto();

        await list.deleteButton("E2E Lookup Tool").click();
        await list.deleteDialog().confirm("Delete");

        // Known bug: see US 8186 item 48 (the toast prints the raw "400: {json}" body, untranslated).
        await toast.expectShown(/Failed to delete tool: 400: \{.*"WKFLOMD0402".*\}/);
        await expect(list.cardTitle("E2E Lookup Tool")).toBeVisible();
      });
    });
  });
});
