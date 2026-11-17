import type { Page } from "@playwright/test";
import { expect, test } from "../support/test";
import { replyRaw } from "../support/mock-api";
import { Toast } from "../pages/components/toast";
import { AgentViewPage } from "../pages/agent-view/agent-view.page";
import { ToolsTab } from "../pages/agent-view/tools-tab";
import {
  installAgentViewTabsMocks,
  TOOL_CLASSIFIER_ID,
  TOOL_HTTP_ID,
  TOOL_MCP_ID,
  TOOL_PRIORITY_ID,
} from "../support/mocks/agent-view-tabs";

const TOOL = "E2E Lookup Tool";
const TOKEN = "{{tool:1:E2E Lookup Tool}}";
const AGENT_PATH = "/md/api/v1/tenant/agent/:id";
const TOOL_LINK_PATH = "/md/api/v1/tenant/agent/:id/tool/:toolId";

/** Opens the Tools tab of agent 1. */
async function openToolsTab(page: Page) {
  const view = new AgentViewPage(page);
  await view.goto();
  await view.openTab("Tools");
  return new ToolsTab(page);
}

test.describe("Tools tab: connect and disconnect", () => {
  test("lists every tenant tool and shows which ones are connected", async ({ page, mockApi }) => {
    installAgentViewTabsMocks(mockApi, { connectedToolIds: [TOOL_MCP_ID] });
    const tools = await openToolsTab(page);

    await expect(tools.row(TOOL)).toBeVisible();
    await expect(tools.row("E2E Directory Tool")).toBeVisible();
    await expect(tools.row("E2E Classifier Tool")).toBeVisible();
    await expect(tools.row("E2E Priority Source")).toBeVisible();
    await tools.expectDisconnected(TOOL);
    await tools.expectConnected("E2E Directory Tool");
  });

  test("connecting a tool links it to the agent", async ({ page, mockApi }) => {
    const state = installAgentViewTabsMocks(mockApi);
    const tools = await openToolsTab(page);
    await tools.expectDisconnected(TOOL);
    // Not connected yet, so there is nothing to put into the prompt or to give permissions to.
    await expect(tools.addToPromptButton(TOOL)).toHaveCount(0);
    await expect(tools.permissionsButton(TOOL)).toHaveCount(0);

    await tools.connectButton(TOOL).click();

    await tools.expectConnected(TOOL);
    await new Toast(page).expectShown("Agent tools updated successfully");
    expect(mockApi.requestsTo("POST", TOOL_LINK_PATH).map((r) => r.path)).toEqual([`/md/api/v1/tenant/agent/1/tool/${TOOL_HTTP_ID}`]);
    expect(state.connectedToolIds).toEqual([TOOL_HTTP_ID]);
    await expect(tools.addToPromptButton(TOOL)).toBeVisible();
    await expect(tools.permissionsButton(TOOL)).toBeVisible();
  });

  test("disconnecting a tool whose token is not in the prompt only unlinks it", async ({ page, mockApi }) => {
    const state = installAgentViewTabsMocks(mockApi, { connectedToolIds: [TOOL_HTTP_ID] });
    const tools = await openToolsTab(page);
    await tools.expectConnected(TOOL);

    await tools.connectButton(TOOL).click();

    await tools.expectDisconnected(TOOL);
    await new Toast(page).expectShown("Agent tools updated successfully");
    expect(mockApi.requestsTo("DELETE", TOOL_LINK_PATH)).toHaveLength(1);
    expect(mockApi.requestsTo("PUT", AGENT_PATH)).toHaveLength(0);
    expect(state.connectedToolIds).toEqual([]);
  });

  test("disconnecting a tool also removes its token from the prompt, before unlinking", async ({ page, mockApi }) => {
    installAgentViewTabsMocks(mockApi, {
      connectedToolIds: [TOOL_HTTP_ID],
      systemPrompt: `You are a helpful assistant.\n\nUse ${TOKEN} to reply Looks up a record over HTTP..`,
    });
    const tools = await openToolsTab(page);
    await expect(tools.removeFromPromptButton(TOOL)).toBeVisible();

    await tools.connectButton(TOOL).click();

    await tools.expectDisconnected(TOOL);
    await expect(tools.removeFromPromptButton(TOOL)).toHaveCount(0);
    const writes = mockApi.requests.filter((r) => r.method !== "GET").map((r) => `${r.method} ${r.path}`);
    expect(writes).toEqual(["PUT /md/api/v1/tenant/agent/1", "DELETE /md/api/v1/tenant/agent/1/tool/1"]);
    expect(mockApi.requestsTo("PUT", AGENT_PATH)[0].body).toEqual({ systemPrompt: "You are a helpful assistant." });
  });

  test.describe("failures", () => {
    test.use({ allowedConsoleErrors: [/Failed to load resource/] });

    test("a failed connect shows an error and leaves the tool disconnected", async ({ page, mockApi }) => {
      installAgentViewTabsMocks(mockApi);
      mockApi.on("POST", TOOL_LINK_PATH, () => replyRaw("nope", { status: 500 }));
      const tools = await openToolsTab(page);

      await tools.connectButton(TOOL).click();

      await new Toast(page).expectShown("Failed to update tools");
      await tools.expectDisconnected(TOOL);
    });

    test("if removing the token from the prompt fails, the tool is not disconnected", async ({ page, mockApi }) => {
      installAgentViewTabsMocks(mockApi, { connectedToolIds: [TOOL_HTTP_ID], systemPrompt: `Use ${TOKEN} to reply x.` });
      mockApi.on("PUT", AGENT_PATH, () => replyRaw("nope", { status: 500 }));
      const tools = await openToolsTab(page);

      await tools.connectButton(TOOL).click();

      await new Toast(page).expectShown("Couldn't remove this tool from the system prompt, so it was not disconnected.");
      await tools.expectConnected(TOOL);
      expect(mockApi.requestsTo("DELETE", TOOL_LINK_PATH)).toHaveLength(0);
    });

    test("if unlinking fails after the prompt was updated, the error says so", async ({ page, mockApi }) => {
      installAgentViewTabsMocks(mockApi, { connectedToolIds: [TOOL_HTTP_ID], systemPrompt: `Use ${TOKEN} to reply x.` });
      mockApi.on("DELETE", TOOL_LINK_PATH, () => replyRaw("nope", { status: 500 }));
      const tools = await openToolsTab(page);

      await tools.connectButton(TOOL).click();

      await new Toast(page).expectShown("The tool was removed from the system prompt, but disconnecting it failed.");
      await tools.expectConnected(TOOL);
      expect(mockApi.requestsTo("PUT", AGENT_PATH)).toHaveLength(1);
    });

    test("a failed unlink with nothing changed in the prompt gives the plain message", async ({ page, mockApi }) => {
      installAgentViewTabsMocks(mockApi, { connectedToolIds: [TOOL_HTTP_ID] });
      mockApi.on("DELETE", TOOL_LINK_PATH, () => replyRaw("nope", { status: 500 }));
      const tools = await openToolsTab(page);

      await tools.connectButton(TOOL).click();

      await new Toast(page).expectShown("Couldn't disconnect this tool. Please try again.");
      await tools.expectConnected(TOOL);
    });
  });

  test("special tool types show a badge and no prompt button", async ({ page, mockApi }) => {
    installAgentViewTabsMocks(mockApi, { connectedToolIds: [TOOL_CLASSIFIER_ID, TOOL_PRIORITY_ID] });
    const tools = await openToolsTab(page);

    await expect(tools.row("E2E Classifier Tool").getByText("Auto-classifying", { exact: true })).toBeVisible();
    await expect(tools.row("E2E Priority Source").getByText("Priority source", { exact: true })).toBeVisible();
    await expect(tools.addToPromptButton("E2E Classifier Tool")).toHaveCount(0);
    await expect(tools.addToPromptButton("E2E Priority Source")).toHaveCount(0);
  });

  test("the Classifications tab appears once a classification tool is connected", async ({ page, mockApi }) => {
    installAgentViewTabsMocks(mockApi);
    const view = new AgentViewPage(page);
    await view.goto();
    await expect(view.tab("Classifications")).toHaveCount(0);
    await view.openTab("Tools");
    const tools = new ToolsTab(page);

    await tools.connectButton("E2E Classifier Tool").click();

    await tools.expectConnected("E2E Classifier Tool");
    await expect(view.tab("Classifications")).toBeVisible();
  });
});

test.describe("Tools tab: tool reference in the prompt", () => {
  test("Add to Prompt appends the tool token and saves only the prompt", async ({ page, mockApi }) => {
    installAgentViewTabsMocks(mockApi, { connectedToolIds: [TOOL_HTTP_ID] });
    const tools = await openToolsTab(page);

    await tools.addToPromptButton(TOOL).click();

    await new Toast(page).expectShown("System prompt updated successfully");
    await expect(tools.removeFromPromptButton(TOOL)).toBeVisible();
    await expect(tools.addToPromptButton(TOOL)).toHaveCount(0);
    const [put] = mockApi.requestsTo("PUT", AGENT_PATH);
    expect(put.body).toEqual({
      systemPrompt: `You are a helpful assistant.\n\nUse ${TOKEN} to reply Looks up a record over HTTP..`,
    });
  });

  test("Remove from prompt takes the token out and keeps the tool connected", async ({ page, mockApi }) => {
    installAgentViewTabsMocks(mockApi, {
      connectedToolIds: [TOOL_HTTP_ID],
      systemPrompt: `You are a helpful assistant.\n\nUse ${TOKEN} to reply Looks up a record over HTTP..`,
    });
    const tools = await openToolsTab(page);

    await tools.removeFromPromptButton(TOOL).click();

    await new Toast(page).expectShown("Removed from prompt");
    await expect(tools.addToPromptButton(TOOL)).toBeVisible();
    await tools.expectConnected(TOOL);
    expect(mockApi.requestsTo("PUT", AGENT_PATH)[0].body).toEqual({ systemPrompt: "You are a helpful assistant." });
    expect(mockApi.requestsTo("DELETE", TOOL_LINK_PATH)).toHaveLength(0);
  });

  test("a token left for a disconnected tool can still be removed", async ({ page, mockApi }) => {
    installAgentViewTabsMocks(mockApi, { systemPrompt: `Keep this. Use ${TOKEN} to reply x.` });
    const tools = await openToolsTab(page);
    await tools.expectDisconnected(TOOL);

    await tools.removeFromPromptButton(TOOL).click();

    await new Toast(page).expectShown("Removed from prompt");
    await expect(tools.removeFromPromptButton(TOOL)).toHaveCount(0);
  });

  test.describe("failures", () => {
    test.use({ allowedConsoleErrors: [/Failed to load resource/] });

    test("a failed Add to Prompt shows an error and keeps the button", async ({ page, mockApi }) => {
      installAgentViewTabsMocks(mockApi, { connectedToolIds: [TOOL_HTTP_ID] });
      mockApi.on("PUT", AGENT_PATH, () => replyRaw("nope", { status: 500 }));
      const tools = await openToolsTab(page);

      await tools.addToPromptButton(TOOL).click();

      await new Toast(page).expectShown("Failed to update system prompt");
      await expect(tools.addToPromptButton(TOOL)).toBeVisible();
    });

    test("a failed Remove from prompt shows an error and keeps the token", async ({ page, mockApi }) => {
      installAgentViewTabsMocks(mockApi, { connectedToolIds: [TOOL_HTTP_ID], systemPrompt: `Use ${TOKEN} to reply x.` });
      mockApi.on("PUT", AGENT_PATH, () => replyRaw("nope", { status: 500 }));
      const tools = await openToolsTab(page);

      await tools.removeFromPromptButton(TOOL).click();

      await new Toast(page).expectShown("Couldn't remove E2E Lookup Tool from the system prompt. Please try again.");
      await expect(tools.removeFromPromptButton(TOOL)).toBeVisible();
    });
  });

  test("Add to Prompt does nothing when the agent's system prompt is empty", async ({ page, mockApi }) => {
    // Known bug: see US 8186. addToolReference (tool-integration.tsx) returns silently when the
    // prompt is empty, so the button gives no feedback and writes nothing.
    installAgentViewTabsMocks(mockApi, { connectedToolIds: [TOOL_HTTP_ID], systemPrompt: "" });
    const tools = await openToolsTab(page);
    await expect(tools.addToPromptButton(TOOL)).toBeVisible();

    await tools.addToPromptButton(TOOL).click();
    // Positive signal that the click was handled: a later, unrelated write completes first.
    await tools.connectButton("E2E Directory Tool").click();
    await expect.poll(() => mockApi.requestsTo("POST", TOOL_LINK_PATH).length).toBe(1);

    expect(mockApi.requestsTo("PUT", AGENT_PATH)).toHaveLength(0);
    await expect(tools.addToPromptButton(TOOL)).toBeVisible();
    await expect(tools.removeFromPromptButton(TOOL)).toHaveCount(0);
  });
});

test("the Permissions button is disabled for a tool that does not manage permissions", async ({ page, mockApi }) => {
  installAgentViewTabsMocks(mockApi, { connectedToolIds: [TOOL_HTTP_ID] });
  const tools = await openToolsTab(page);

  await expect(tools.permissionsButton(TOOL)).toBeDisabled();
  await expect(tools.row(TOOL).getByTestId("permissions-disabled-trigger")).toHaveAccessibleDescription(
    "Turn on 'Manage permissions for this tool' on the tool first",
  );
});
