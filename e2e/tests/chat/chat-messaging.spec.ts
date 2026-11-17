import { expect, test } from "../../support/test";
import { TestAgentChatPage } from "../../pages/chat/test-agent-chat.page";
import { CHAT_PATHS, STOPPED_AT, installChatMocks } from "../../support/mocks/chat";
import { reply } from "../../support/mock-api";

test.describe("Test Agent chat: sending and streaming", () => {
  test("connects, sends a message and shows the streamed reply", async ({ page, mockApi, hub }) => {
    const chatMocks = installChatMocks(mockApi);
    const chat = new TestAgentChatPage(page, hub);
    await chat.open();

    await expect(chat.sendButton).toBeDisabled();
    await chat.send("Hello there");

    await expect.poll(() => chatMocks.sends().length).toBe(1);
    expect(chatMocks.sends()[0].body).toMatchObject({
      sessionId: chat.sessionId,
      input: { text: "Hello there" },
      chainOfThought: false,
      isContactFormReplay: false,
    });
    await expect(chat.message("Hello there")).toBeVisible();
    await expect(chat.input).toHaveValue("");

    hub.streamReply(chat.sessionId, ["The answer ", "is forty-two."]);
    await expect(chat.message("The answer is forty-two.")).toBeVisible();
  });

  test("the send button sends the typed message", async ({ page, mockApi, hub }) => {
    const chatMocks = installChatMocks(mockApi);
    const chat = new TestAgentChatPage(page, hub);
    await chat.open();

    await chat.input.fill("Sent with the button");
    await chat.sendButton.click();

    await expect.poll(() => chatMocks.sends().length).toBe(1);
    expect(chatMocks.sends()[0].body).toMatchObject({ input: { text: "Sent with the button" } });
  });

  test("a message of only spaces is not sent", async ({ page, mockApi, hub }) => {
    const chatMocks = installChatMocks(mockApi);
    const chat = new TestAgentChatPage(page, hub);
    await chat.open();

    await chat.input.fill("   ");

    await expect(chat.sendButton).toBeDisabled();
    await chat.input.press("Enter");
    await expect(chat.input).toHaveValue("   ");
    expect(chatMocks.sends()).toHaveLength(0);
  });

  test("the Chain of Thought switch is sent with the message", async ({ page, mockApi, hub }) => {
    const chatMocks = installChatMocks(mockApi);
    const chat = new TestAgentChatPage(page, hub);
    await chat.open();

    await page.getByRole("switch", { name: "Chain of Thought" }).click();
    await chat.send("Think about it");

    await expect.poll(() => chatMocks.sends().length).toBe(1);
    expect(chatMocks.sends()[0].body).toMatchObject({ chainOfThought: true });
  });

  test("shows the agent's typing state while it works and returns to Send when it is idle", async ({ page, mockApi, hub }) => {
    installChatMocks(mockApi);
    const chat = new TestAgentChatPage(page, hub);
    await chat.open();

    hub.typing(chat.sessionId, true);
    await expect(chat.stopButton).toBeVisible();
    await expect(chat.sendButton).toBeHidden();

    hub.typing(chat.sessionId, false);
    hub.idle(chat.sessionId);
    await expect(chat.stopButton).toBeHidden();
    await expect(chat.sendButton).toBeVisible();
  });

  test("Enter does not send while the agent is working", async ({ page, mockApi, hub }) => {
    const chatMocks = installChatMocks(mockApi);
    const chat = new TestAgentChatPage(page, hub);
    await chat.open();
    await chat.send("First question");
    await expect.poll(() => chatMocks.sends().length).toBe(1);
    await expect(chat.stopButton).toBeVisible();

    await chat.input.fill("Second question");
    await chat.input.press("Enter");

    await expect(chat.input).toHaveValue("Second question");
    expect(chatMocks.sends()).toHaveLength(1);
  });

  test("events of another chat session are ignored", async ({ page, mockApi, hub }) => {
    installChatMocks(mockApi);
    const chat = new TestAgentChatPage(page, hub);
    await chat.open();

    hub.streamReply("another-session", ["Not for this chat."]);
    hub.streamReply(chat.sessionId, ["For this chat."]);

    await expect(chat.message("For this chat.")).toBeVisible();
    await expect(chat.message("Not for this chat.")).toHaveCount(0);
  });

  test("rates an assistant reply with thumbs up", async ({ page, mockApi, hub }) => {
    const chatMocks = installChatMocks(mockApi);
    const chat = new TestAgentChatPage(page, hub);
    await chat.open();
    await chat.send("Hello there");

    hub.streamReply(chat.sessionId, ["Rate this answer."], { messageId: "e2e-rated-1" });
    await expect(chat.message("Rate this answer.")).toBeVisible();
    await page.getByRole("button", { name: "Thumbs up" }).click();

    await expect.poll(() => chatMocks.ratings().length).toBe(1);
    expect(chatMocks.ratings()[0].body).toMatchObject({
      sessionId: chat.sessionId,
      input: { messageId: "e2e-rated-1", isThumbsUp: true },
    });
  });
});

test.describe("Test Agent chat: stopping", () => {
  test("Stop cancels the agents, posts the session and shows the stopped divider", async ({ page, mockApi, hub }) => {
    const chatMocks = installChatMocks(mockApi);
    const chat = new TestAgentChatPage(page, hub);
    await chat.open();
    await chat.send("Write a long essay");
    await expect(chat.stopButton).toBeVisible();

    await chat.stopButton.click();

    await expect.poll(() => chatMocks.stops().length).toBe(1);
    expect(chatMocks.stops()[0].body).toEqual({ sessionId: chat.sessionId });
    await expect(chat.stoppedDivider).toHaveText(/Stopped\. All agents cancelled\./);
    // The UI is idle straight away: Send is back and the input accepts text.
    await expect(chat.stopButton).toBeHidden();
    await expect(chat.input).toBeEnabled();

    // The echo of this client's own Stop does not add a second divider.
    hub.emit("ConversationStopped", { chatId: chat.sessionId, stoppedAt: STOPPED_AT });
    await expect(chat.stoppedDivider).toHaveCount(1);
  });

  test("a Stop from another client of the same session shows the divider", async ({ page, mockApi, hub }) => {
    installChatMocks(mockApi);
    const chat = new TestAgentChatPage(page, hub);
    await chat.open();
    await chat.send("Write a long essay");
    await expect(chat.stopButton).toBeVisible();

    hub.stopped(chat.sessionId);

    await expect(chat.stoppedDivider).toHaveText(/Stopped\. All agents cancelled\./);
    await expect(chat.stopButton).toBeHidden();
    await expect(chat.input).toBeEnabled();
  });

  test("a new message can be sent after a Stop", async ({ page, mockApi, hub }) => {
    const chatMocks = installChatMocks(mockApi);
    const chat = new TestAgentChatPage(page, hub);
    await chat.open();
    await chat.send("Write a long essay");
    await chat.stopButton.click();
    await expect(chat.stoppedDivider).toBeVisible();

    await chat.send("Never mind, a short answer please");

    await expect.poll(() => chatMocks.sends().length).toBe(2);
    expect(chatMocks.sends()[1].body).toMatchObject({ input: { text: "Never mind, a short answer please" } });
  });

  test.describe("when the server cannot stop the run", () => {
    test.use({ allowedConsoleErrors: [/Failed to load resource|Failed to stop the agents/] });

    test("the chat goes idle and says nothing about the failed Stop", async ({ page, mockApi, hub }) => {
      const chatMocks = installChatMocks(mockApi);
      mockApi.on("POST", CHAT_PATHS.stop, () => reply({ message: "boom" }, 500));
      const chat = new TestAgentChatPage(page, hub);
      await chat.open();
      await chat.send("Write a long essay");
      await chat.stopButton.click();

      await expect.poll(() => chatMocks.stops().length).toBe(1);
      await expect(chat.stopButton).toBeHidden();
      // Known bug: see US 8186 (silent chat failures): no message tells the user the Stop failed.
      await expect(chat.stoppedDivider).toHaveCount(0);
      await expect(page.getByText(/Couldn't stop the agents/)).toHaveCount(0);
    });
  });
});
