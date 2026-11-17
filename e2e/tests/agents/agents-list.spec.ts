import { expect, test } from "../../support/test";
import { reply } from "../../support/mock-api";
import { AgentsListPage } from "../../pages/agents/agents-list.page";
import { Toast } from "../../pages/components/toast";
import { installAgentsMocks } from "../../support/mocks/agents";

test.describe("Agents list", () => {
  test.beforeEach(({ mockApi }) => installAgentsMocks(mockApi));

  // The browser logs every failed request as a console error; the error-path tests mock a 500 on purpose.
  const FAILED_REQUEST_LOG = /Failed to load resource: the server responded with a status of 500/;

  test("shows a card per agent with its status badges", async ({ page }) => {
    const list = new AgentsListPage(page);
    await list.goto();

    await expect(list.cardTitle("E2E Support Agent")).toBeVisible();
    await expect(list.cardTitle("E2E Research Agent")).toBeVisible();
    await expect(list.cardTitle("E2E Memory Agent")).toBeVisible();
    await expect(page.getByText("Answers common questions.")).toBeVisible();
    // The research agent is the only published one; the memory agent shows its memory and spin-up badges.
    await expect(page.getByText("Published", { exact: true })).toHaveCount(1);
    await expect(page.getByText("STM", { exact: true })).toHaveCount(2);
    await expect(page.getByText("LTM", { exact: true })).toHaveCount(1);
    await expect(page.getByText("Spin Up Agents", { exact: true })).toHaveCount(1);
  });

  test("Create Agent opens the create page", async ({ page }) => {
    const list = new AgentsListPage(page);
    await list.goto();
    await list.createButton.click();

    await list.expectPath("/agents/create");
    await expect(page.getByRole("heading", { name: "Create New Agent" })).toBeVisible();
  });

  test("shows an empty state when there are no agents, and its button opens the create page", async ({ page, mockApi }) => {
    mockApi.seed.agents.splice(0);
    const list = new AgentsListPage(page);
    await list.goto();

    await expect(list.emptyStateHeading).toBeVisible();
    await expect(page.getByText("Create your first agent to get started")).toBeVisible();
    await page.getByRole("button", { name: "Create Agent" }).last().click();
    await list.expectPath("/agents/create");
  });

  test("search filters the cards by name, case-insensitively, and shows the empty state for no match", async ({ page }) => {
    const list = new AgentsListPage(page);
    await list.goto();

    await list.searchBox.fill("research");
    await expect(list.cardTitle("E2E Research Agent")).toBeVisible();
    await expect(list.cardTitle("E2E Support Agent")).toHaveCount(0);
    await expect(list.cardTitle("E2E Memory Agent")).toHaveCount(0);

    await list.searchBox.fill("no such agent");
    await expect(list.emptyStateHeading).toBeVisible();

    await list.searchBox.fill("");
    await expect(list.cardTitle("E2E Support Agent")).toBeVisible();
    await expect(list.cardTitle("E2E Research Agent")).toBeVisible();
  });

  test("the view toggle switches between a multi-column grid and a single-column list", async ({ page }) => {
    const list = new AgentsListPage(page);
    await list.goto();

    await expect(list.gridViewButton).toHaveAttribute("aria-pressed", "true");
    await expect(list.cardsContainer()).toHaveClass(/md:grid-cols-2/);

    await list.listViewButton.click();
    await expect(list.listViewButton).toHaveAttribute("aria-pressed", "true");
    await expect(list.gridViewButton).toHaveAttribute("aria-pressed", "false");
    await expect(list.cardsContainer()).not.toHaveClass(/md:grid-cols-2/);

    await list.gridViewButton.click();
    await expect(list.cardsContainer()).toHaveClass(/md:grid-cols-2/);
  });

  test("clicking a card opens the agent view page", async ({ page }) => {
    const list = new AgentsListPage(page);
    await list.goto();
    await list.cardTitle("E2E Research Agent").click();

    await list.expectPath("/agents/view/2");
    await expect(page.getByRole("heading", { level: 1, name: "E2E Research Agent" })).toBeVisible();
  });

  test("the pencil button opens the edit page without opening the view page", async ({ page }) => {
    const list = new AgentsListPage(page);
    await list.goto();
    await list.editButton("E2E Support Agent").click();

    await list.expectPath("/agents/1/edit");
    await expect(page.getByRole("heading", { name: "Edit Agent" })).toBeVisible();
  });

  test.describe("active switch", () => {
    test("disabling an active agent sends isActive: false and shows a success toast", async ({ page, mockApi }) => {
      const list = new AgentsListPage(page);
      const toast = new Toast(page);
      await list.goto();
      await expect(list.activeSwitch("E2E Support Agent")).toBeChecked();

      await list.activeSwitch("E2E Support Agent").click();

      await toast.expectShown("Agent disabled");
      const [put] = mockApi.requestsTo("PUT", "/md/api/v1/tenant/agent/:id");
      expect(put.path).toBe("/md/api/v1/tenant/agent/1");
      expect(put.body).toEqual({ isActive: false });
      // The list is refetched and the card reflects the stored state; the click did not navigate away.
      await expect(list.activeSwitch("E2E Support Agent")).not.toBeChecked();
      await list.expectPath("/agents");
    });

    test("enabling an inactive agent sends isActive: true", async ({ page, mockApi }) => {
      mockApi.seed.agents[0].isActive = false;
      const list = new AgentsListPage(page);
      const toast = new Toast(page);
      await list.goto();
      await expect(list.activeSwitch("E2E Support Agent")).not.toBeChecked();

      await list.activeSwitch("E2E Support Agent").click();

      await toast.expectShown("Agent enabled");
      expect(mockApi.requestsTo("PUT", "/md/api/v1/tenant/agent/:id")[0].body).toEqual({ isActive: true });
      await expect(list.activeSwitch("E2E Support Agent")).toBeChecked();
    });

    test.describe("failing update", () => {
      test.use({ allowedConsoleErrors: [FAILED_REQUEST_LOG] });

      test("shows an error toast and leaves the switch unchanged when the update fails", async ({ page, mockApi }) => {
        mockApi.on("PUT", "/md/api/v1/tenant/agent/:id", () => reply({ message: "Update failed" }, 500));
        const list = new AgentsListPage(page);
        const toast = new Toast(page);
        await list.goto();

        await list.activeSwitch("E2E Support Agent").click();

        await toast.expectShown("Failed to toggle agent status");
        await expect(list.activeSwitch("E2E Support Agent")).toBeChecked();
        expect(mockApi.seed.agents[0].isActive).toBe(true);
      });
    });
  });

  test.describe("delete", () => {
    test("confirming deletes the agent, shows a toast and removes the card", async ({ page, mockApi }) => {
      const list = new AgentsListPage(page);
      const toast = new Toast(page);
      await list.goto();

      await list.deleteButton("E2E Support Agent").click();
      await list.deleteDialog.expectVisible();
      await list.deleteDialog.expectText("permanently delete the agent");
      await list.deleteDialog.confirm("Delete");

      await toast.expectShown("Agent deleted");
      expect(mockApi.requestsTo("DELETE", "/md/api/v1/tenant/agent/:id").map((request) => request.path)).toEqual([
        "/md/api/v1/tenant/agent/1",
      ]);
      await expect(list.cardTitle("E2E Support Agent")).toHaveCount(0);
      await expect(list.cardTitle("E2E Research Agent")).toBeVisible();
      await list.expectPath("/agents");
    });

    test("cancelling closes the dialog and keeps the agent", async ({ page, mockApi }) => {
      const list = new AgentsListPage(page);
      await list.goto();

      await list.deleteButton("E2E Support Agent").click();
      await list.deleteDialog.cancel();

      await list.deleteDialog.expectClosed();
      await expect(list.cardTitle("E2E Support Agent")).toBeVisible();
      expect(mockApi.requestsTo("DELETE", "/md/api/v1/tenant/agent/:id")).toHaveLength(0);
      await list.expectPath("/agents");
    });

    test.describe("failing delete", () => {
      test.use({ allowedConsoleErrors: [FAILED_REQUEST_LOG] });

      test("shows an error toast when the delete fails and keeps the card", async ({ page, mockApi }) => {
        mockApi.on("DELETE", "/md/api/v1/tenant/agent/:id", () => reply({ message: "Delete failed" }, 500));
        const list = new AgentsListPage(page);
        const toast = new Toast(page);
        await list.goto();

        await list.deleteButton("E2E Support Agent").click();
        await list.deleteDialog.confirm("Delete");

        await toast.expectShown("Failed to delete agent");
        await expect(list.cardTitle("E2E Support Agent")).toBeVisible();
      });
    });
  });

  test.describe("custom image", () => {
    const png = (size: number) => ({ name: "avatar.png", mimeType: "image/png", buffer: Buffer.alloc(size, 1) });

    test("a valid image replaces the avatar and is kept in localStorage only", async ({ page, mockApi }) => {
      const list = new AgentsListPage(page);
      const toast = new Toast(page);
      await list.goto();
      await expect(page.getByRole("img", { name: "E2E Support Agent" })).toHaveCount(0);

      await list.imageInput("E2E Support Agent").setInputFiles(png(2_000));

      await toast.expectShown("Image uploaded");
      await expect(page.getByRole("img", { name: "E2E Support Agent" })).toBeVisible();
      const stored = await page.evaluate(() => localStorage.getItem("agent-image-1"));
      expect(stored).toMatch(/^data:image\/png;base64,/);
      // Nothing is sent to the agent API: the image never leaves the browser.
      expect(mockApi.requests.filter((request) => request.method !== "GET" && request.path.includes("/agent"))).toEqual([]);
    });

    test("an image over 5 MB is rejected with a toast and not stored", async ({ page }) => {
      const list = new AgentsListPage(page);
      const toast = new Toast(page);
      await list.goto();

      await list.imageInput("E2E Support Agent").setInputFiles(png(5_000_001));

      await toast.expectShown("Image Too Large");
      await toast.expectShown("5.0 MB or smaller");
      await expect(page.getByRole("img", { name: "E2E Support Agent" })).toHaveCount(0);
      expect(await page.evaluate(() => localStorage.getItem("agent-image-1"))).toBeNull();
    });
  });
});
