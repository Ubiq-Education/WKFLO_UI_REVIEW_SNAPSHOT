import { expect, test } from "../../support/test";
import { reply } from "../../support/mock-api";
import { AgentViewPage } from "../../pages/agents/agent-view.page";
import { Toast } from "../../pages/components/toast";
import { addClassificationTool, installAgentsMocks, MEMORY_AGENT_ID } from "../../support/mocks/agents";

const SERVER_ERROR_LOG = /Failed to load resource: the server responded with a status of 500/;

test.describe("Agent view header", () => {
  test.beforeEach(({ mockApi }) => installAgentsMocks(mockApi));

  test("shows the agent name, details and status cards", async ({ page }) => {
    const view = new AgentViewPage(page);
    await view.goto(1);

    await expect(view.heading("E2E Support Agent")).toBeVisible();
    await expect(page.getByText("Answers common questions.")).toBeVisible();
    await expect(page.getByText("You are a helpful assistant.")).toBeVisible();
    await expect(view.statusSwitch).toBeChecked();
    await expect(page.getByText("No tools attached to this agent.")).toBeVisible();
  });

  test.describe("unknown agent", () => {
    test.use({ allowedConsoleErrors: [/Failed to load resource: the server responded with a status of 404/] });

    test("shows a not-found message", async ({ page }) => {
      await page.goto("/agents/view/999");
      await expect(page.getByRole("heading", { name: "Agent not found" })).toBeVisible();
    });
  });

  test("Back opens the agents list and Edit opens the edit page", async ({ page }) => {
    const view = new AgentViewPage(page);
    await view.goto(1);
    await view.editButton.click();
    await view.expectPath("/agents/1/edit");

    await view.goto(1);
    await view.backButton.click();
    await view.expectPath("/agents");
  });

  test.describe("status switch", () => {
    test("disabling sends isActive: false, shows a toast and updates the card", async ({ page, mockApi }) => {
      const view = new AgentViewPage(page);
      await view.goto(1);
      await view.statusSwitch.click();

      await new Toast(page).expectShown("Agent disabled");
      expect(mockApi.requestsTo("PUT", "/md/api/v1/tenant/agent/:id")[0].body).toEqual({ isActive: false });
      await expect(view.statusSwitch).not.toBeChecked();
      await expect(page.getByText("Inactive", { exact: true })).toBeVisible();
    });

    test.describe("failing update", () => {
      test.use({ allowedConsoleErrors: [SERVER_ERROR_LOG] });

      test("shows an error toast and keeps the status", async ({ page, mockApi }) => {
        mockApi.on("PUT", "/md/api/v1/tenant/agent/:id", () => reply({ message: "Boom" }, 500));
        const view = new AgentViewPage(page);
        await view.goto(1);
        await view.statusSwitch.click();

        await new Toast(page).expectShown("Failed to toggle agent status");
        await expect(view.statusSwitch).toBeChecked();
      });
    });
  });

  test.describe("delete", () => {
    // After a delete the page refetches the (now missing) agent before it navigates away, which
    // the browser logs as a 404.
    test.describe("confirmed", () => {
      test.use({ allowedConsoleErrors: [/Failed to load resource: the server responded with a status of 404/] });

      test("confirming deletes the agent and shows a toast", async ({ page, mockApi }) => {
        const view = new AgentViewPage(page);
        await view.goto(1);
        await view.deleteButton.click();
        const dialog = view.dialog("Are you sure?");
        await dialog.expectVisible();
        await dialog.confirm("Delete");

        await new Toast(page).expectShown("Agent deleted");
        expect(mockApi.requestsTo("DELETE", "/md/api/v1/tenant/agent/:id").map((request) => request.path)).toEqual([
          "/md/api/v1/tenant/agent/1",
        ]);
        expect(mockApi.seed.agents.some((agent) => agent.id === 1)).toBe(false);
        // Known bug: see US 8186. After deleting, the view page navigates to the dashboard ("/")
        // instead of back to the agents list.
        await view.expectPath("/");
      });
    });

    test("cancelling keeps the agent", async ({ page, mockApi }) => {
      const view = new AgentViewPage(page);
      await view.goto(1);
      await view.deleteButton.click();
      const dialog = view.dialog("Are you sure?");
      await dialog.cancel();

      await dialog.expectClosed();
      expect(mockApi.requestsTo("DELETE", "/md/api/v1/tenant/agent/:id")).toHaveLength(0);
      await view.expectPath("/agents/view/1");
    });

    test.describe("failing delete", () => {
      test.use({ allowedConsoleErrors: [SERVER_ERROR_LOG] });

      test("shows an error toast and stays on the page", async ({ page, mockApi }) => {
        mockApi.on("DELETE", "/md/api/v1/tenant/agent/:id", () => reply({ message: "Boom" }, 500));
        const view = new AgentViewPage(page);
        await view.goto(1);
        await view.deleteButton.click();
        await view.dialog("Are you sure?").confirm("Delete");

        await new Toast(page).expectShown("Failed to delete agent");
        await view.expectPath("/agents/view/1");
      });
    });
  });

  test.describe("publish", () => {
    test("confirming publishes the agent", async ({ page, mockApi }) => {
      const view = new AgentViewPage(page);
      await view.goto(1);
      await view.publishButton.click();
      const dialog = view.dialog("Publish Agent");
      await dialog.expectText("accessible from public workflows");
      await dialog.confirm("Publish");

      await new Toast(page).expectShown("Agent published");
      expect(mockApi.requestsTo("POST", "/md/api/v1/tenant/agent/:id/publish").map((request) => request.path)).toEqual([
        "/md/api/v1/tenant/agent/1/publish",
      ]);
      expect(mockApi.seed.agents[0].isPublished).toBe(true);
      await dialog.expectClosed();
    });

    test("cancelling sends nothing", async ({ page, mockApi }) => {
      const view = new AgentViewPage(page);
      await view.goto(1);
      await view.publishButton.click();
      const dialog = view.dialog("Publish Agent");
      await dialog.cancel();

      await dialog.expectClosed();
      expect(mockApi.requestsTo("POST", "/md/api/v1/tenant/agent/:id/publish")).toHaveLength(0);
    });

    test.describe("failing publish", () => {
      test.use({ allowedConsoleErrors: [SERVER_ERROR_LOG] });

      test("shows an error toast", async ({ page, mockApi }) => {
        mockApi.on("POST", "/md/api/v1/tenant/agent/:id/publish", () => reply({ message: "Boom" }, 500));
        const view = new AgentViewPage(page);
        await view.goto(1);
        await view.publishButton.click();
        await view.dialog("Publish Agent").confirm("Publish");

        await new Toast(page).expectShown("Failed to publish agent");
        expect(mockApi.seed.agents[0].isPublished).toBe(false);
      });
    });
  });

  test.describe("share to marketplace", () => {
    test("a super power user can share after confirming", async ({ page, mockApi }) => {
      const view = new AgentViewPage(page);
      await view.goto(1);
      await view.shareToMarketplaceButton.click();
      const dialog = view.dialog("Share Agent to Marketplace");
      await dialog.expectText("publicly available");
      await dialog.confirm("Share");

      await new Toast(page).expectShown("Agent shared");
      expect(mockApi.requestsTo("POST", "/md/api/v1/tenant/agent/:id/share").map((request) => request.path)).toEqual([
        "/md/api/v1/tenant/agent/1/share",
      ]);
      expect(mockApi.seed.agents[0].isShared).toBe(true);
    });

    test("cancelling sends nothing", async ({ page, mockApi }) => {
      const view = new AgentViewPage(page);
      await view.goto(1);
      await view.shareToMarketplaceButton.click();
      const dialog = view.dialog("Share Agent to Marketplace");
      await dialog.cancel();

      await dialog.expectClosed();
      expect(mockApi.requestsTo("POST", "/md/api/v1/tenant/agent/:id/share")).toHaveLength(0);
    });

    test.describe("failing share", () => {
      test.use({ allowedConsoleErrors: [SERVER_ERROR_LOG] });

      test("shows an error toast", async ({ page, mockApi }) => {
        mockApi.on("POST", "/md/api/v1/tenant/agent/:id/share", () => reply({ message: "Boom" }, 500));
        const view = new AgentViewPage(page);
        await view.goto(1);
        await view.shareToMarketplaceButton.click();
        await view.dialog("Share Agent to Marketplace").confirm("Share");

        await new Toast(page).expectShown("Failed to share agent");
        expect(mockApi.seed.agents[0].isShared).toBe(false);
      });
    });

    test.describe("standard user", () => {
      test.use({ isSuperPowerUser: false });

      test("does not see the share button but keeps publish and delete", async ({ page }) => {
        const view = new AgentViewPage(page);
        await view.goto(1);

        await expect(view.heading("E2E Support Agent")).toBeVisible();
        await expect(view.shareToMarketplaceButton).toHaveCount(0);
        await expect(view.publishButton).toBeVisible();
        await expect(view.deleteButton).toBeVisible();
      });
    });
  });

  test.describe("memory wipe", () => {
    test("an agent without memory has no wipe buttons", async ({ page }) => {
      const view = new AgentViewPage(page);
      await view.goto(1);

      await expect(view.heading("E2E Support Agent")).toBeVisible();
      await expect(page.getByRole("button", { name: "Wipe" })).toHaveCount(0);
    });

    test("wiping short term memory calls only the short-term endpoint", async ({ page, mockApi }) => {
      const view = new AgentViewPage(page);
      await view.goto(MEMORY_AGENT_ID);
      await expect(page.getByRole("button", { name: "Wipe" })).toHaveCount(2);
      await view.wipeButton("Short Term Memory").click();
      const dialog = view.dialog("Wipe Short Term Memory?");
      await dialog.expectText("chat history");
      await dialog.confirm("Wipe Memory");

      await new Toast(page).expectShown("Short term memory wiped");
      expect(mockApi.requestsTo("DELETE", /\/memory\//).map((request) => request.path)).toEqual([
        `/md/api/v1/tenant/agent/${MEMORY_AGENT_ID}/memory/short-term`,
      ]);
    });

    test("wiping long term memory calls only the long-term endpoint", async ({ page, mockApi }) => {
      const view = new AgentViewPage(page);
      await view.goto(MEMORY_AGENT_ID);
      await view.wipeButton("Long Term Memory").click();
      const dialog = view.dialog("Wipe Long Term Memory?");
      await dialog.expectText("vector embeddings");
      await dialog.confirm("Wipe Memory");

      await new Toast(page).expectShown("Long term memory wiped");
      expect(mockApi.requestsTo("DELETE", /\/memory\//).map((request) => request.path)).toEqual([
        `/md/api/v1/tenant/agent/${MEMORY_AGENT_ID}/memory/long-term`,
      ]);
    });

    test("cancelling the dialog wipes nothing", async ({ page, mockApi }) => {
      const view = new AgentViewPage(page);
      await view.goto(MEMORY_AGENT_ID);
      await view.wipeButton("Short Term Memory").click();
      const dialog = view.dialog("Wipe Short Term Memory?");
      await dialog.cancel();

      await dialog.expectClosed();
      expect(mockApi.requestsTo("DELETE", /\/memory\//)).toHaveLength(0);
    });

    test.describe("failing wipe", () => {
      test.use({ allowedConsoleErrors: [SERVER_ERROR_LOG] });

      test("shows an error toast", async ({ page, mockApi }) => {
        mockApi.on("DELETE", "/md/api/v1/tenant/agent/:id/memory/long-term", () => reply({ message: "Boom" }, 500));
        const view = new AgentViewPage(page);
        await view.goto(MEMORY_AGENT_ID);
        await view.wipeButton("Long Term Memory").click();
        await view.dialog("Wipe Long Term Memory?").confirm("Wipe Memory");

        await new Toast(page).expectShown("Failed to wipe long term memory");
      });
    });
  });
});

test.describe("Agent view tabs", () => {
  test.beforeEach(({ mockApi }) => installAgentsMocks(mockApi));

  test("always shows Details, Tools, Test Agent and Share, with Details selected", async ({ page }) => {
    const view = new AgentViewPage(page);
    await view.goto(1);

    for (const name of ["Details", "Tools", "Test Agent", "Share"]) {
      await expect(view.tab(name)).toBeVisible();
    }
    await expect(view.tab("Details")).toHaveAttribute("aria-selected", "true");
    await expect(view.tab("Classifications")).toHaveCount(0);
    await expect(view.tab("Spin-Up Agents")).toHaveCount(0);
  });

  test("selecting a tab makes it the selected one", async ({ page }) => {
    const view = new AgentViewPage(page);
    await view.goto(1);

    await view.tab("Tools").click();
    await expect(view.tab("Tools")).toHaveAttribute("aria-selected", "true");
    await expect(view.tab("Details")).toHaveAttribute("aria-selected", "false");

    await view.tab("Share").click();
    await expect(view.tab("Share")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("heading", { name: "Chat UI" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Chat Widget" })).toBeVisible();

    await view.tab("Test Agent").click();
    await expect(view.tab("Test Agent")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText("Chat with Agent")).toBeVisible();

    await view.tab("Details").click();
    await expect(page.getByText("Agent Details")).toBeVisible();
  });

  test("the Spin-Up Agents tab only exists when the agent enables spin-up agents", async ({ page }) => {
    const view = new AgentViewPage(page);
    await view.goto(MEMORY_AGENT_ID);

    await expect(view.tab("Spin-Up Agents")).toBeVisible();
    await view.tab("Spin-Up Agents").click();
    await expect(view.tab("Spin-Up Agents")).toHaveAttribute("aria-selected", "true");
  });

  test("the Classifications tab only exists when the agent has a classification tool", async ({ page, mockApi }) => {
    addClassificationTool(mockApi, 1);
    const view = new AgentViewPage(page);
    await view.goto(1);

    await expect(view.tab("Classifications")).toBeVisible();
    await view.tab("Classifications").click();
    await expect(view.tab("Classifications")).toHaveAttribute("aria-selected", "true");
  });
});
