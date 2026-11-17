import { expect, test } from "../../support/test";
import { ShareChatPage } from "../../pages/share-chat/share-chat.page";
import {
  PUBLIC_PATHS,
  SHARE_ID,
  installShareChatMocks,
  reply,
} from "../../support/mocks/share-chat";

test.describe("public chat: messaging", () => {
  test("connects, shows the welcome message, sends a message and shows the streamed reply", async ({
    page,
    mockApi,
    hub,
  }) => {
    const mocks = installShareChatMocks(mockApi);
    const chat = new ShareChatPage(page, hub);
    await chat.open();

    await expect(chat.message("Welcome to the E2E assistant.")).toBeVisible();
    await expect(chat.sendButton).toBeDisabled();

    await chat.send("Hello there");
    await expect.poll(() => mocks.sends().length).toBe(1);
    expect(mocks.sends()[0].url).toContain(SHARE_ID);
    expect(mocks.sends()[0].body).toMatchObject({
      sessionId: chat.sessionId,
      input: { text: "Hello there" },
      chainOfThought: false,
      isContactFormReplay: false,
    });
    await expect(chat.message("Hello there")).toBeVisible();
    await expect(chat.input).toHaveValue("");

    hub.streamReply(chat.sessionId, ["The answer ", "is forty-two."]);
    await expect(chat.message("The answer is forty-two.")).toBeVisible();
    await expect(chat.copyButtons).toHaveCount(1);
  });

  test("shows Thinking in the Agents bar, not in the thread, while the agent works", async ({
    page,
    mockApi,
    hub,
  }) => {
    installShareChatMocks(mockApi);
    const chat = new ShareChatPage(page, hub);
    await chat.open();

    hub.typing(chat.sessionId, true);
    await expect(page.getByTestId("agents-bar-status")).toContainText("Thinking…");
    // The bar replaces the in-thread bubble.
    await expect(page.getByText("Thinking", { exact: true })).toBeHidden();

    hub.typing(chat.sessionId, false);
    await expect(page.getByTestId("agents-bar-status")).not.toContainText("Thinking…");
  });

  test("ignores events that belong to another chat session", async ({
    page,
    mockApi,
    hub,
  }) => {
    installShareChatMocks(mockApi);
    const chat = new ShareChatPage(page, hub);
    await chat.open();

    hub.streamReply("00000000-0000-4000-8000-000000000000", [
      "A reply for someone else.",
    ]);
    // Events are handled in order, so seeing the next one for this session proves the foreign one was dropped.
    hub.streamReply(chat.sessionId, ["A reply for this chat."]);

    await expect(chat.message("A reply for this chat.")).toBeVisible();
    await expect(chat.message("A reply for someone else.")).toHaveCount(0);
  });

  // The browser logs every failed response as a console error.
  test.describe("failing calls", () => {
    test.use({
      allowedConsoleErrors: [
        /Failed to load resource|API request failed|Read messages API request failed/,
      ],
    });

    test("a send the API rejects shows the translated error", async ({
      page,
      mockApi,
      hub,
    }) => {
      installShareChatMocks(mockApi);
      mockApi.on("POST", PUBLIC_PATHS.send, () =>
        reply({ errors: [{ property: "Files", code: "WKFLOAI0014" }] }, 400),
      );
      const chat = new ShareChatPage(page, hub);
      await chat.open();

      await chat.send("Will this work?");

      // Texts of shared/utils/chat-send-errors.ts (the chat has its own table, not en.json).
      await expect(
        page.getByText(
          "Your attachments are too large to send together. Please remove some files, or send them in separate messages.",
        ),
      ).toBeVisible();
    });

    test("an unknown send failure shows the generic text", async ({
      page,
      mockApi,
      hub,
    }) => {
      installShareChatMocks(mockApi);
      mockApi.on("POST", PUBLIC_PATHS.send, () =>
        reply({ errors: [{ property: "", code: "WKFLO0001" }] }, 500),
      );
      const chat = new ShareChatPage(page, hub);
      await chat.open();

      await chat.send("Will this work?");

      await expect(
        page.getByText("Your message couldn't be sent. Please try again."),
      ).toBeVisible();
    });
  });
});

test.describe("public chat: history", () => {
  test("loads the stored conversation when it opens", async ({
    page,
    mockApi,
    hub,
  }) => {
    const mocks = installShareChatMocks(mockApi);
    mocks.history.push(
      {
        id: "h-1",
        type: "user",
        content: "What are your opening hours?",
        channelMessageType: 1,
        timestamp: "2026-01-15T09:00:00Z",
      },
      {
        id: "h-2",
        messageId: "h-2",
        type: "assistant",
        content: "We are open from nine to five.",
        channelMessageType: 1,
        timestamp: "2026-01-15T09:00:05Z",
      },
    );
    const chat = new ShareChatPage(page, hub);
    await chat.open();

    await expect(chat.message("What are your opening hours?")).toBeVisible();
    await expect(chat.message("We are open from nine to five.")).toBeVisible();
    // The welcome message stays at the top of the stored conversation.
    await expect(chat.message("Welcome to the E2E assistant.")).toBeVisible();
    expect(mocks.historyLoads()[0].url).toContain(
      `/chat/${chat.sessionId}/session-messages`,
    );
  });

  test("Load Message History reloads the conversation from the server without duplicating messages", async ({
    page,
    mockApi,
    hub,
  }) => {
    const mocks = installShareChatMocks(mockApi);
    mocks.history.push({
      id: "h-0",
      type: "user",
      content: "A question asked before.",
      channelMessageType: 1,
    });
    const chat = new ShareChatPage(page, hub);
    await chat.open();
    await expect(chat.message("A question asked before.")).toHaveCount(1);
    await expect(chat.message("A message that arrived elsewhere.")).toHaveCount(
      0,
    );
    const loadsBefore = mocks.historyLoads().length;

    mocks.history.push({
      id: "h-3",
      messageId: "h-3",
      type: "assistant",
      content: "A message that arrived elsewhere.",
      channelMessageType: 1,
    });
    await chat.loadHistoryButton.click();

    await expect(chat.message("A message that arrived elsewhere.")).toHaveCount(
      1,
    );
    await expect(chat.message("A question asked before.")).toHaveCount(1);
    await expect(chat.message("Welcome to the E2E assistant.")).toHaveCount(1);
    expect(mocks.historyLoads().length).toBe(loadsBefore + 1);
  });

  test.describe("failing history", () => {
    test.use({
      allowedConsoleErrors: [
        /Failed to load resource|Read messages API request failed/,
      ],
    });

    test("a failing history load keeps the welcome message and shows no error", async ({
      page,
      mockApi,
      hub,
    }) => {
      installShareChatMocks(mockApi);
      mockApi.on("GET", PUBLIC_PATHS.history, () =>
        reply({ errors: [{ property: "", code: "WKFLO0001" }] }, 500),
      );
      const chat = new ShareChatPage(page, hub);
      await chat.open();

      await expect(chat.message("Welcome to the E2E assistant.")).toBeVisible();
      await expect(page.getByRole("alert")).toHaveCount(0);
      await expect(page.locator('li[role="status"]')).toHaveCount(0);
    });
  });
});

test.describe("public chat: reset", () => {
  test("Reset Session clears the conversation and starts a new session", async ({
    page,
    mockApi,
    hub,
  }) => {
    const mocks = installShareChatMocks(mockApi);
    const chat = new ShareChatPage(page, hub);
    await chat.open();
    await chat.send("First question");
    await expect.poll(() => mocks.sends().length).toBe(1);
    hub.streamReply(chat.sessionId, ["First answer."]);
    await expect(chat.message("First answer.")).toBeVisible();
    const oldSession = chat.sessionId;

    await chat.resetButton.click();

    await expect(chat.message("First question")).toHaveCount(0);
    await expect(chat.message("First answer.")).toHaveCount(0);
    await expect(chat.message("Welcome to the E2E assistant.")).toBeVisible();
    await expect.poll(() => chat.sessionId).not.toBe(oldSession);

    await chat.send("Second question");
    await expect.poll(() => mocks.sends().length).toBe(2);
    expect(mocks.sends()[1].body).toMatchObject({ sessionId: chat.sessionId });
  });
});

test.describe("public chat: predefined prompts", () => {
  test("shows the configured quick replies and sends one when it is clicked", async ({
    page,
    mockApi,
    hub,
  }) => {
    const mocks = installShareChatMocks(mockApi, {
      predefinedPrompts: [
        { title: "Opening hours", prompt: "What are your opening hours?" },
        { title: "Contact", prompt: "How can I contact you?" },
      ],
    });
    const chat = new ShareChatPage(page, hub);
    await chat.open();

    await expect(chat.promptChip("Opening hours")).toBeVisible();
    await expect(chat.promptChip("Contact")).toBeVisible();

    await chat.promptChip("Contact").click();

    await expect.poll(() => mocks.sends().length).toBe(1);
    expect(mocks.sends()[0].body).toMatchObject({
      input: { text: "How can I contact you?" },
    });
    await expect(chat.message("How can I contact you?")).toBeVisible();
  });

  test("shows no quick replies when none are configured", async ({
    page,
    mockApi,
    hub,
  }) => {
    installShareChatMocks(mockApi);
    const chat = new ShareChatPage(page, hub);
    await chat.open();

    await expect(chat.message("Welcome to the E2E assistant.")).toBeVisible();
    await expect(chat.promptChips).toHaveCount(0);
  });
});
