import type { Page } from "@playwright/test";
import { expect, test } from "../support/test";
import { replyRaw } from "../support/mock-api";
import { Toast } from "../pages/components/toast";
import { AgentViewPage } from "../pages/agent-view/agent-view.page";
import { ClassificationsTab } from "../pages/agent-view/classifications-tab";
import { SpinUpTab } from "../pages/agent-view/spin-up-tab";
import { installAgentViewTabsMocks, TOOL_CLASSIFIER_ID } from "../support/mocks/agent-view-tabs";

const OTHER_AGENT = "E2E Research Agent";
const SPIN_UP_PATH = "/md/api/v1/tenant/agent/:id/spin-up/agents/:targetId";
const TOPICS_PATH = "/md/api/v1/tenant/agent/:id/topic-classification-summary";

async function openTab(page: Page, name: string) {
  const view = new AgentViewPage(page);
  await view.goto();
  await view.openTab(name);
  return view;
}

test.describe("Spin-Up Agents tab", () => {
  test("is only offered when spin-up agents are enabled on the agent", async ({ page, mockApi }) => {
    installAgentViewTabsMocks(mockApi, { enableSpinUpAgents: false });
    const view = new AgentViewPage(page);
    await view.goto();

    await expect(view.tab("Details")).toBeVisible();
    await expect(view.tab("Spin-Up Agents")).toHaveCount(0);
  });

  test("lists the other agents in the tenant and leaves out the agent itself", async ({ page, mockApi }) => {
    installAgentViewTabsMocks(mockApi, { enableSpinUpAgents: true, spinUpNames: [OTHER_AGENT] });
    await openTab(page, "Spin-Up Agents");
    const tab = new SpinUpTab(page);

    await expect(tab.row(OTHER_AGENT)).toBeVisible();
    await expect(tab.row("E2E Support Agent")).toHaveCount(0);
    await tab.expectConnected(OTHER_AGENT);
  });

  test("connecting an agent adds it to the allowlist", async ({ page, mockApi }) => {
    const state = installAgentViewTabsMocks(mockApi, { enableSpinUpAgents: true });
    await openTab(page, "Spin-Up Agents");
    const tab = new SpinUpTab(page);
    await tab.expectDisconnected(OTHER_AGENT);

    await tab.toggle(OTHER_AGENT).click();

    await tab.expectConnected(OTHER_AGENT);
    await new Toast(page).expectShown("Spin-up agents updated successfully");
    expect(mockApi.requestsTo("POST", SPIN_UP_PATH).map((r) => r.path)).toEqual(["/md/api/v1/tenant/agent/1/spin-up/agents/2"]);
    expect(state.spinUpNames).toEqual([OTHER_AGENT]);
  });

  test("disconnecting an agent removes it from the allowlist", async ({ page, mockApi }) => {
    const state = installAgentViewTabsMocks(mockApi, { enableSpinUpAgents: true, spinUpNames: [OTHER_AGENT] });
    await openTab(page, "Spin-Up Agents");
    const tab = new SpinUpTab(page);
    await tab.expectConnected(OTHER_AGENT);

    await tab.toggle(OTHER_AGENT).click();

    await tab.expectDisconnected(OTHER_AGENT);
    await new Toast(page).expectShown("Spin-up agents updated successfully");
    expect(mockApi.requestsTo("DELETE", SPIN_UP_PATH).map((r) => r.path)).toEqual(["/md/api/v1/tenant/agent/1/spin-up/agents/2"]);
    expect(state.spinUpNames).toEqual([]);
  });

  test("says so when the tenant has no other agents", async ({ page, mockApi }) => {
    installAgentViewTabsMocks(mockApi, { enableSpinUpAgents: true });
    mockApi.seed.agents.splice(1);
    await openTab(page, "Spin-Up Agents");

    await expect(page.getByText("No other agents available in this tenant.")).toBeVisible();
  });

  test.describe("failures", () => {
    test.use({ allowedConsoleErrors: [/Failed to load resource/] });

    test("a failed connect shows an error and leaves the agent disconnected", async ({ page, mockApi }) => {
      installAgentViewTabsMocks(mockApi, { enableSpinUpAgents: true });
      mockApi.on("POST", SPIN_UP_PATH, () => replyRaw("nope", { status: 500 }));
      await openTab(page, "Spin-Up Agents");
      const tab = new SpinUpTab(page);

      await tab.toggle(OTHER_AGENT).click();

      await new Toast(page).expectShown("Failed to update spin-up agents");
      await tab.expectDisconnected(OTHER_AGENT);
    });

    test("a failed disconnect shows an error and keeps the agent connected", async ({ page, mockApi }) => {
      installAgentViewTabsMocks(mockApi, { enableSpinUpAgents: true, spinUpNames: [OTHER_AGENT] });
      mockApi.on("DELETE", SPIN_UP_PATH, () => replyRaw("nope", { status: 500 }));
      await openTab(page, "Spin-Up Agents");
      const tab = new SpinUpTab(page);

      await tab.toggle(OTHER_AGENT).click();

      await new Toast(page).expectShown("Failed to update spin-up agents");
      await tab.expectConnected(OTHER_AGENT);
    });
  });
});

test.describe("Classifications tab", () => {
  const topics = {
    Last30Days: [
      { topicName: "Billing question", count: 6 },
      { topicName: "Feedback", count: 2 },
    ],
    Last90Days: [{ topicName: "Billing question", count: 20 }],
    Last6Months: [],
  };

  test("shows the last 30 days by default, with shares and a total", async ({ page, mockApi }) => {
    installAgentViewTabsMocks(mockApi, { connectedToolIds: [TOOL_CLASSIFIER_ID], topicsByRange: topics });
    await openTab(page, "Classifications");
    const tab = new ClassificationsTab(page);

    await expect(page.getByText("Billing question")).toBeVisible();
    await expect(page.getByText("Feedback")).toBeVisible();
    await expect(page.getByText("(75%)")).toBeVisible();
    await expect(page.getByText("(25%)")).toBeVisible();
    await expect(tab.total).toHaveText("Total classified messages: 8");
    expect(mockApi.requestsTo("GET", TOPICS_PATH).map((r) => r.url)).toEqual([
      "/md/api/v1/tenant/agent/1/topic-classification-summary?dateRange=Last30Days",
    ]);
  });

  test("each date range button loads that range", async ({ page, mockApi }) => {
    installAgentViewTabsMocks(mockApi, { connectedToolIds: [TOOL_CLASSIFIER_ID], topicsByRange: topics });
    await openTab(page, "Classifications");
    const tab = new ClassificationsTab(page);
    await expect(tab.total).toHaveText("Total classified messages: 8");

    await tab.selectRange("Last 90 Days");
    await expect(tab.total).toHaveText("Total classified messages: 20");
    await expect(page.getByText("Feedback")).toHaveCount(0);

    await tab.selectRange("Last 3 Months");
    await expect(tab.emptyMessage).toBeVisible();

    await tab.selectRange("Last 6 Months");
    await expect(tab.emptyMessage).toBeVisible();

    await tab.selectRange("Last 12 Months");
    await expect(tab.emptyMessage).toBeVisible();

    await tab.selectRange("Last 30 Days");
    await expect(tab.total).toHaveText("Total classified messages: 8");

    const ranges = mockApi.requestsTo("GET", TOPICS_PATH).map((r) => new URL(r.url, "http://x").searchParams.get("dateRange"));
    expect(ranges).toEqual(["Last30Days", "Last90Days", "Last3Months", "Last6Months", "Last12Months"]);
  });

  test("says so when a period has no classifications", async ({ page, mockApi }) => {
    installAgentViewTabsMocks(mockApi, { connectedToolIds: [TOOL_CLASSIFIER_ID] });
    await openTab(page, "Classifications");
    const tab = new ClassificationsTab(page);

    await expect(tab.emptyMessage).toBeVisible();
    await expect(page.getByText("Try selecting a wider date range")).toBeVisible();
  });

  test.describe("failures", () => {
    test.use({ allowedConsoleErrors: [/Failed to load resource/] });

    test("a failed load shows an error message", async ({ page, mockApi }) => {
      installAgentViewTabsMocks(mockApi, { connectedToolIds: [TOOL_CLASSIFIER_ID], topicsByRange: topics });
      mockApi.on("GET", TOPICS_PATH, () => replyRaw("nope", { status: 500 }));
      await openTab(page, "Classifications");
      const tab = new ClassificationsTab(page);

      await expect(tab.errorMessage).toBeVisible();
      await expect(tab.emptyMessage).toHaveCount(0);
    });
  });
});
