import { expect, test } from "../../support/test";
import { reply } from "../../support/mock-api";
import { TestAgentChatPage } from "../../pages/chat/test-agent-chat.page";
import { CHAT_PATHS, installChatMocks } from "../../support/mocks/chat";

const BLOCKED_PLACEHOLDER = "Answer the permission request above to continue";

test.describe("Test Agent chat: tool approval", () => {
  test("shows the request and blocks the input until it is answered", async ({ page, mockApi, hub }) => {
    installChatMocks(mockApi);
    const chat = new TestAgentChatPage(page, hub);
    await chat.open();
    await chat.send("Look up the record");

    hub.toolApproval(chat.sessionId, { argumentsJson: '{"recordId":"R-1"}' });

    await expect(chat.approvalCard).toBeVisible();
    await expect(chat.approvalCard).toContainText("wants to use lookup_record from E2E Lookup Tool");
    await expect(chat.approvalCard).toContainText("Looks up a record.");
    await expect(chat.input).toBeDisabled();
    await expect(chat.input).toHaveAttribute("placeholder", BLOCKED_PLACEHOLDER);

    await chat.approvalCard.getByRole("button", { name: "Details" }).click();
    await expect(chat.approvalCard).toContainText('"recordId": "R-1"');
  });

  test("Allow once posts the decision and unblocks the chat", async ({ page, mockApi, hub }) => {
    const chatMocks = installChatMocks(mockApi);
    const chat = new TestAgentChatPage(page, hub);
    await chat.open();
    hub.toolApproval(chat.sessionId);

    await chat.approvalCard.getByRole("button", { name: "Allow once" }).click();

    await expect.poll(() => chatMocks.approvals().length).toBe(1);
    expect(chatMocks.approvals()[0].path).toBe("/ai/api/v1/tenant/agent/1/tool-approval/e2e-approval-1");
    expect(chatMocks.approvals()[0].body).toEqual({ sessionId: chat.sessionId, decision: "AllowOnce" });
    await expect(chat.approvalCard).toContainText("Allowed once");
    await expect(chat.approvalCard.getByRole("button", { name: "Allow once" })).toHaveCount(0);
    await expect(chat.input).toBeEnabled();
  });

  test("Allow for this conversation posts that decision", async ({ page, mockApi, hub }) => {
    const chatMocks = installChatMocks(mockApi);
    const chat = new TestAgentChatPage(page, hub);
    await chat.open();
    hub.toolApproval(chat.sessionId);

    await chat.approvalCard.getByRole("button", { name: "Allow for this conversation" }).click();

    await expect.poll(() => chatMocks.approvals().length).toBe(1);
    expect(chatMocks.approvals()[0].body).toEqual({ sessionId: chat.sessionId, decision: "AllowForConversation" });
    await expect(chat.approvalCard).toContainText("Allowed for this conversation");
  });

  test("Deny posts the decision and shows it as denied", async ({ page, mockApi, hub }) => {
    const chatMocks = installChatMocks(mockApi);
    const chat = new TestAgentChatPage(page, hub);
    await chat.open();
    hub.toolApproval(chat.sessionId);

    await chat.approvalCard.getByRole("button", { name: "Deny" }).click();

    await expect.poll(() => chatMocks.approvals().length).toBe(1);
    expect(chatMocks.approvals()[0].body).toEqual({ sessionId: chat.sessionId, decision: "Deny" });
    await expect(chat.approvalCard).toContainText("Denied");
    await expect(chat.input).toBeEnabled();
  });

  test("an approval resolved elsewhere updates the card", async ({ page, mockApi, hub }) => {
    installChatMocks(mockApi);
    const chat = new TestAgentChatPage(page, hub);
    await chat.open();
    hub.toolApproval(chat.sessionId);
    await expect(chat.approvalCard).toBeVisible();

    hub.emit("ToolApprovalResolved", { chatId: chat.sessionId, approvalId: "e2e-approval-1", decision: "Deny" });

    await expect(chat.approvalCard).toContainText("Denied");
    await expect(chat.input).toBeEnabled();
  });

  test("a request whose time has already passed shows as expired", async ({ page, mockApi, hub }) => {
    installChatMocks(mockApi);
    const chat = new TestAgentChatPage(page, hub);
    await chat.open();

    hub.toolApproval(chat.sessionId, { expiresAtUtc: new Date(Date.now() - 60_000).toISOString() });

    await expect(chat.approvalCard).toContainText("Expired. Nobody answered in time, so it wasn't used.");
    await expect(chat.input).toBeEnabled();
  });

  test.describe("when the answer is rejected", () => {
    test.use({ allowedConsoleErrors: [/Failed to load resource/] });

    const rejections = [
      { status: 500, text: "Couldn't send your answer. Please try again.", stillPending: true },
      { status: 409, text: "This request was already answered.", stillPending: false },
      { status: 410, text: "This request expired before it was answered.", stillPending: false },
    ];
    for (const { status, text, stillPending } of rejections) {
      test(`shows "${text}" for a ${status}`, async ({ page, mockApi, hub }) => {
        installChatMocks(mockApi);
        mockApi.on("POST", CHAT_PATHS.approval, () => reply({}, status));
        const chat = new TestAgentChatPage(page, hub);
        await chat.open();
        hub.toolApproval(chat.sessionId);

        await chat.approvalCard.getByRole("button", { name: "Allow once" }).click();

        await expect(chat.approvalCard.getByRole("alert")).toHaveText(text);
        if (stillPending) {
          await expect(chat.approvalCard.getByRole("button", { name: "Allow once" })).toBeEnabled();
          await expect(chat.input).toBeDisabled();
        } else {
          await expect(chat.approvalCard.getByRole("button", { name: "Allow once" })).toHaveCount(0);
          await expect(chat.input).toBeEnabled();
        }
      });
    }
  });
});
