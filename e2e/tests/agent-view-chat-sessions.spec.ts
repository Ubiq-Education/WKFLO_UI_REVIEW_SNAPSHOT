import type { Page } from "@playwright/test";
import { expect, test } from "../support/test";
import { replyRaw } from "../support/mock-api";
import { Toast } from "../pages/components/toast";
import { AgentViewPage } from "../pages/agent-view/agent-view.page";
import { ChatSessions } from "../pages/agent-view/chat-sessions";
import { installAgentViewTabsMocks, makeChat } from "../support/mocks/agent-view-tabs";

const CHAT_PATH = "/md/api/v1/tenant/agent/:id/chat";
const CHAT_ITEM_PATH = "/md/api/v1/tenant/agent/:id/chat/:sessionId";

async function openTestAgentTab(page: Page) {
  const view = new AgentViewPage(page);
  await view.goto();
  await view.openTab("Test Agent");
  return new ChatSessions(page);
}

test("the sessions list is only shown when the agent has short-term memory on", async ({ page, mockApi }) => {
  installAgentViewTabsMocks(mockApi, { enableSTM: false });
  const view = new AgentViewPage(page);
  await view.goto();
  await view.openTab("Test Agent");

  await expect(page.getByText("Chat with Agent")).toBeVisible();
  await expect(page.getByRole("button", { name: "+ New Chat" })).toHaveCount(0);
});

test("an agent without sessions says so", async ({ page, mockApi }) => {
  installAgentViewTabsMocks(mockApi, { enableSTM: true });
  const sessions = await openTestAgentTab(page);

  await expect(sessions.emptyMessage).toBeVisible();
  await expect(sessions.newChatButton).toBeEnabled();
});

test("lists the agent's sessions, naming unnamed ones after their id", async ({ page, mockApi }) => {
  installAgentViewTabsMocks(mockApi, { enableSTM: true, chats: [makeChat(1, "Billing help"), makeChat(2, "")] });
  const sessions = await openTestAgentTab(page);

  await expect(sessions.row("Billing help")).toBeVisible();
  await expect(sessions.row("Session 000002")).toBeVisible();
  await expect(sessions.emptyMessage).toHaveCount(0);
});

test("+ New Chat creates a session and lists it", async ({ page, mockApi }) => {
  const state = installAgentViewTabsMocks(mockApi, { enableSTM: true, chats: [makeChat(1, "Billing help")] });
  const sessions = await openTestAgentTab(page);
  await expect(sessions.row("Billing help")).toBeVisible();

  await sessions.newChatButton.click();

  await expect.poll(() => state.chats.length).toBe(2);
  const created = state.chats[1];
  expect(mockApi.requestsTo("POST", CHAT_PATH)[0].body).toEqual({ sessionId: created.sessionId });
  await expect(sessions.row(`Session ${created.sessionId.slice(-6)}`)).toBeVisible();
  await expect(sessions.row("Billing help")).toBeVisible();
});

test("deleting a session asks first and Cancel keeps it", async ({ page, mockApi }) => {
  installAgentViewTabsMocks(mockApi, { enableSTM: true, chats: [makeChat(1, "Billing help")] });
  const sessions = await openTestAgentTab(page);

  await sessions.row("Billing help").hover();
  await sessions.deleteButton("Billing help").click();
  await sessions.deleteDialog.expectVisible();
  await sessions.deleteDialog.expectText("This action cannot be undone.");
  await sessions.deleteDialog.cancel();

  await sessions.deleteDialog.expectClosed();
  await expect(sessions.row("Billing help")).toBeVisible();
  expect(mockApi.requestsTo("DELETE", CHAT_ITEM_PATH)).toHaveLength(0);
});

test("confirming the delete removes only that session", async ({ page, mockApi }) => {
  const state = installAgentViewTabsMocks(mockApi, {
    enableSTM: true,
    chats: [makeChat(1, "Billing help"), makeChat(2, "Onboarding")],
  });
  const sessions = await openTestAgentTab(page);

  await sessions.row("Billing help").hover();
  await sessions.deleteButton("Billing help").click();
  await sessions.deleteDialog.confirm("Delete");

  await new Toast(page).expectShown("Chat session deleted");
  await expect(sessions.row("Billing help")).toHaveCount(0);
  await expect(sessions.row("Onboarding")).toBeVisible();
  expect(mockApi.requestsTo("DELETE", CHAT_ITEM_PATH).map((r) => r.path)).toEqual([
    `/md/api/v1/tenant/agent/1/chat/${makeChat(1).sessionId}`,
  ]);
  expect(state.chats.map((c) => c.name)).toEqual(["Onboarding"]);
});

test.describe("failures", () => {
  test.use({ allowedConsoleErrors: [/Failed to load resource/] });

  test("a failed create gives no feedback and lists nothing", async ({ page, mockApi }) => {
    // Known bug: see US 8186. createChatMutation in agent-chat-list.tsx has no onError, so a
    // failed "+ New Chat" is silent.
    installAgentViewTabsMocks(mockApi, { enableSTM: true });
    mockApi.on("POST", CHAT_PATH, () => replyRaw("nope", { status: 500 }));
    const sessions = await openTestAgentTab(page);

    // Wait for the failed response, so the checks below run after the app has handled it.
    const failed = page.waitForResponse((r) => r.request().method() === "POST" && /\/chat$/.test(new URL(r.url()).pathname));
    await sessions.newChatButton.click();
    await failed;

    await expect(sessions.newChatButton).toBeEnabled();
    await expect(sessions.emptyMessage).toBeVisible();
    await expect(page.locator('li[role="status"]')).toHaveCount(0);
  });

  test("a failed delete closes the dialog and gives no feedback", async ({ page, mockApi }) => {
    // Known bug: see US 8186. deleteChatMutation in agent-chat-list.tsx has no onError, so a failed
    // delete is silent: the dialog closes and the session stays.
    installAgentViewTabsMocks(mockApi, { enableSTM: true, chats: [makeChat(1, "Billing help")] });
    mockApi.on("DELETE", CHAT_ITEM_PATH, () => replyRaw("nope", { status: 500 }));
    const sessions = await openTestAgentTab(page);

    await sessions.row("Billing help").hover();
    await sessions.deleteButton("Billing help").click();
    // Wait for the failed response: the dialog closes on click, before the app handles the error.
    const failed = page.waitForResponse((r) => r.request().method() === "DELETE" && /\/chat\//.test(r.url()));
    await sessions.deleteDialog.confirm("Delete");
    await failed;

    expect(mockApi.requestsTo("DELETE", CHAT_ITEM_PATH)).toHaveLength(1);
    await sessions.deleteDialog.expectClosed();
    await expect(sessions.row("Billing help")).toBeVisible();
    await expect(page.locator('li[role="status"]')).toHaveCount(0);
  });
});
