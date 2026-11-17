import { expect, test } from "../../support/test";
import { reply } from "../../support/mock-api";
import { WidgetHostPage } from "../../pages/chat-widget/widget-host.page";
import {
  HOST_PAGE_CONSOLE_NOISE,
  hostPageConsoleNoise,
  installChatWidgetMocks,
  WIDGET_PATHS,
  WIDGET_SHARE_ID,
} from "../../support/mocks/chat-widget";

test.use({ allowedConsoleErrors: [HOST_PAGE_CONSOLE_NOISE] });

test.describe("chat widget conversation", () => {
  test("loads, connects to the hub and sends a message with the session id it joined", async ({
    page,
    mockApi,
    hub,
  }) => {
    const mocks = installChatWidgetMocks(mockApi);
    const widget = new WidgetHostPage(page, WIDGET_SHARE_ID);
    await widget.open();
    await widget.openChat();
    await widget.waitUntilConnected();
    await expect.poll(() => hub.joinedSessions.length).toBeGreaterThan(0);

    await widget.send("Hello there");

    await expect.poll(() => mocks.sends()).toHaveLength(1);
    expect(mocks.sends()[0].body).toEqual({
      input: { text: "Hello there", files: [] },
      sessionId: hub.joinedSessions[0],
      chainOfThought: false,
      isContactFormReplay: false,
    });
    await expect(widget.chat.getByText("Hello there")).toBeVisible();
    await expect(widget.input).toHaveValue("");
  });

  test("shows the reply the hub streams for the session", async ({
    page,
    mockApi,
    hub,
  }) => {
    installChatWidgetMocks(mockApi);
    const widget = new WidgetHostPage(page, WIDGET_SHARE_ID);
    await widget.open();
    await widget.openChat();
    await widget.waitUntilConnected();
    await widget.send("What is the answer?");
    await expect.poll(() => hub.joinedSessions.length).toBeGreaterThan(0);

    hub.streamReply(hub.joinedSessions[0], ["The answer ", "is forty-two."]);

    await expect(
      widget.chat.getByText("The answer is forty-two."),
    ).toBeVisible();
    await expect(widget.chat.getByText("What is the answer?")).toBeVisible();
  });

  test("ignores hub events for another session", async ({
    page,
    mockApi,
    hub,
  }) => {
    installChatWidgetMocks(mockApi);
    const widget = new WidgetHostPage(page, WIDGET_SHARE_ID);
    await widget.open();
    await widget.openChat();
    await widget.waitUntilConnected();
    await widget.send("Question");
    await expect.poll(() => hub.joinedSessions.length).toBeGreaterThan(0);

    hub.streamReply("another-session-id", ["Reply for someone else"]);
    hub.streamReply(hub.joinedSessions[0], ["Reply for this chat"]);

    // The second reply is rendered after the first was dropped, so the check below can fail if it leaked.
    await expect(widget.chat.getByText("Reply for this chat")).toBeVisible();
    await expect(widget.chat.getByText("Reply for someone else")).toHaveCount(
      0,
    );
  });

  test.describe("rejected send", () => {
    test.use({
      allowedConsoleErrors: [
        hostPageConsoleNoise(
          "Failed to load resource: the server responded with a status of 400",
        ),
      ],
    });

    test("a rejected send shows a friendly error and keeps the chat usable", async ({
      page,
      mockApi,
      hub,
    }) => {
      installChatWidgetMocks(mockApi);
      // Backend: PublicAgentChatMessage.cs answers InvalidResult (400) with ErrorConst.AttachmentsTooLarge (WKFLOAI0014) on Files.
      // That is a real response of this endpoint but only reachable with huge payloads; this test covers the code-to-message mapping.
      mockApi.on("POST", WIDGET_PATHS.send, () =>
        reply(
          {
            resultType: 2,
            errors: [{ code: "WKFLOAI0014", property: "Files" }],
          },
          400,
        ),
      );
      const widget = new WidgetHostPage(page, WIDGET_SHARE_ID);
      await widget.open();
      await widget.openChat();
      await widget.waitUntilConnected();

      await widget.send("This will be rejected");

      await expect(
        widget.chat.getByText(
          "Your attachments are too large to send together. Please remove some files, or send them in separate messages.",
        ),
      ).toBeVisible();
      await expect(widget.input).toBeEnabled();
      expect(hub.joinedSessions.length).toBeGreaterThan(0);
    });
  });

  test.describe("unexpected server error", () => {
    test.use({
      allowedConsoleErrors: [
        hostPageConsoleNoise(
          "Failed to load resource: the server responded with a status of 500",
        ),
      ],
    });

    test("shows the generic send error", async ({ page, mockApi }) => {
      installChatWidgetMocks(mockApi);
      mockApi.on("POST", WIDGET_PATHS.send, () =>
        reply(
          { resultType: 5, errors: [{ property: "", code: "WKFLO0001" }] },
          500,
        ),
      );
      const widget = new WidgetHostPage(page, WIDGET_SHARE_ID);
      await widget.open();
      await widget.openChat();
      await widget.waitUntilConnected();

      await widget.send("This will fail");

      await expect(
        widget.chat.getByText(
          "Your message couldn't be sent. Please try again.",
        ),
      ).toBeVisible();
      await expect(widget.input).toBeEnabled();
    });
  });

  test("shows a failed answer the hub reports as friendly text, never the raw code", async ({
    page,
    mockApi,
    hub,
  }) => {
    installChatWidgetMocks(mockApi);
    const widget = new WidgetHostPage(page, WIDGET_SHARE_ID);
    await widget.open();
    await widget.openChat();
    await widget.waitUntilConnected();
    await widget.send("Question");
    await expect.poll(() => hub.joinedSessions.length).toBeGreaterThan(0);

    hub.runtimeError(hub.joinedSessions[0], "WKFLOAI1102");

    await expect(
      widget.chat.getByText(
        "The assistant took too long to reply. Please try again.",
      ),
    ).toBeVisible();
    await expect(widget.chat.getByText("WKFLOAI1102")).toHaveCount(0);
  });

  test("the history button reloads the session messages", async ({
    page,
    mockApi,
    hub,
  }) => {
    installChatWidgetMocks(mockApi);
    const widget = new WidgetHostPage(page, WIDGET_SHARE_ID);
    await widget.open();
    await widget.openChat();
    await widget.waitUntilConnected();
    await expect.poll(() => hub.joinedSessions.length).toBeGreaterThan(0);
    const sessionId = hub.joinedSessions[0];
    // Backend: PublicAgentsChatMessagesBySessionIdList.cs returns the stored messages of the session.
    mockApi.on("GET", WIDGET_PATHS.history, ({ params }) =>
      params.sessionId === sessionId
        ? [
            {
              id: "e2e-history-1",
              type: "assistant",
              content: "A stored answer from earlier.",
              channelMessageType: 1,
              timestamp: "2026-01-15T10:00:00Z",
            },
          ]
        : [],
    );

    await widget.chat.getByTitle("Load Message History").click();

    await expect(
      widget.chat.getByText("A stored answer from earlier."),
    ).toBeVisible();
  });

  test("reset session clears the conversation and joins a new session", async ({
    page,
    mockApi,
    hub,
  }) => {
    installChatWidgetMocks(mockApi);
    const widget = new WidgetHostPage(page, WIDGET_SHARE_ID);
    await widget.open();
    await widget.openChat();
    await widget.waitUntilConnected();
    await widget.send("First question");
    await expect(widget.chat.getByText("First question")).toBeVisible();
    await expect.poll(() => hub.joinedSessions.length).toBeGreaterThan(0);
    const firstSession = hub.joinedSessions[0];

    await widget.chat.getByTitle("Reset Session").click();

    await expect(widget.chat.getByText("First question")).toHaveCount(0);
    await expect.poll(() => hub.joinedSessions.at(-1)).not.toBe(firstSession);
  });
});
