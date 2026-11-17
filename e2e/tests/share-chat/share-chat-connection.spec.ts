import { expect, test } from "../../support/test";
import { ShareChatPage } from "../../pages/share-chat/share-chat.page";
import {
  SHARE_ID,
  emitMcpReconnect,
  installShareChatMocks,
  reply,
} from "../../support/mocks/share-chat";

const TOOL_CONNECTION_ID = "e2e00000-0000-4000-8000-0000000000c1";
const START_ROUTE = "/ai/api/v1/agent/:shareId/tool/:toolId/mcp/oauth/start";
const START_PATH = `/ai/api/v1/agent/${SHARE_ID}/tool/${TOOL_CONNECTION_ID}/mcp/oauth/start`;
const RECONNECT = {
  toolName: "E2E Docs",
  startPath: START_PATH,
  message:
    'The "E2E Docs" tool needs to be reconnected before it can be used again.',
};
const AUTHORIZATION_URL = "https://auth.e2e.test/authorize?client=e2e";

test.describe("public chat: MCP reconnect card", () => {
  test("shows the card when it arrives over the hub and opens the authorization page in a new tab", async ({
    page,
    context,
    mockApi,
    hub,
  }) => {
    installShareChatMocks(mockApi);
    mockApi.on("GET", START_ROUTE, () => ({
      authorizationUrl: AUTHORIZATION_URL,
    }));
    await context.route("https://auth.e2e.test/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<title>E2E authorization</title>",
      }),
    );
    const chat = new ShareChatPage(page, hub);
    await chat.open();

    emitMcpReconnect(hub, chat.sessionId, RECONNECT);
    await expect(page.getByText(RECONNECT.message)).toBeVisible();
    const popup = page.waitForEvent("popup");
    await page.getByRole("button", { name: "Reconnect E2E Docs" }).click();

    const authorization = await popup;
    await expect(authorization).toHaveURL(AUTHORIZATION_URL);
    expect(mockApi.requestsTo("GET", START_ROUTE)).toHaveLength(1);
    expect(mockApi.requestsTo("GET", START_ROUTE)[0].url).toBe(START_PATH);
    // The opener is cut off (noopener), so the authorization page cannot reach the chat.
    expect(await authorization.evaluate(() => window.opener)).toBeNull();
  });

  test.describe("when the authorization cannot be started", () => {
    test.use({ allowedConsoleErrors: [/Failed to load resource/] });

    test("shows the raw HTTP status instead of a friendly message and no new tab opens", async ({
      page,
      context,
      mockApi,
      hub,
    }) => {
      installShareChatMocks(mockApi);
      mockApi.on("GET", START_ROUTE, () =>
        reply({ errors: [{ property: "Config", code: "WKFLOAI0801" }] }, 400),
      );
      const opened: string[] = [];
      context.on("page", (newPage) => opened.push(newPage.url()));
      const chat = new ShareChatPage(page, hub);
      await chat.open();
      emitMcpReconnect(hub, chat.sessionId, RECONNECT);

      const started = page.waitForResponse((response) =>
        response.url().includes("/mcp/oauth/start"),
      );
      await page.getByRole("button", { name: "Reconnect E2E Docs" }).click();
      expect((await started).status()).toBe(400);

      // Known bug: see US 8186 item 47 (the card shows `${status}: ${statusText}` instead of the translated
      // text of WKFLOAI0801), shared/components/mcp-oauth-reconnect-card.tsx:37-38.
      await expect(page.getByText(/^400:/)).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Reconnect E2E Docs" }),
      ).toBeEnabled();
      expect(opened).toEqual([]);
    });
  });

  test("shows an error when the server returns no authorization URL", async ({
    page,
    mockApi,
    hub,
  }) => {
    installShareChatMocks(mockApi);
    mockApi.on("GET", START_ROUTE, () => ({}));
    const chat = new ShareChatPage(page, hub);
    await chat.open();
    emitMcpReconnect(hub, chat.sessionId, RECONNECT);

    await page.getByRole("button", { name: "Reconnect E2E Docs" }).click();

    await expect(
      page.getByText("The server did not return an authorization URL."),
    ).toBeVisible();
  });
});

test.describe("public chat: hub connection", () => {
  // The SignalR client logs the server-side close (1011) of a dropped connection as an error.
  test.use({
    allowedConsoleErrors: [
      /WebSocket closed with status code: 1011|Failed to load resource/,
    ],
  });

  test("reconnects by itself after the hub drops, rejoins the session and keeps chatting", async ({
    page,
    mockApi,
    hub,
  }) => {
    const mocks = installShareChatMocks(mockApi);
    const chat = new ShareChatPage(page, hub);
    await chat.open();
    const sessionId = chat.sessionId;
    const joinsBefore = hub.joinedSessions.length;

    hub.drop();

    // The chat joins its session again on the new connection.
    await expect
      .poll(() => hub.joinedSessions.length)
      .toBeGreaterThan(joinsBefore);
    expect(chat.sessionId).toBe(sessionId);
    await expect(chat.input).toBeEnabled();
    await expect(chat.connectionLabel).toBeVisible();

    await chat.send("Anyone there?");
    await expect.poll(() => mocks.sends().length).toBe(1);
    hub.streamReply(sessionId, ["Yes, I am back."]);
    await expect(chat.message("Yes, I am back.")).toBeVisible();
  });

  // Self-test of the shared fake hub: drop() is only used by this feature.
  test("hub.drop() closes the open connection with code 1011 and the client opens a new one", async ({
    page,
    mockApi,
    hub,
  }) => {
    installShareChatMocks(mockApi);
    const closeErrors: string[] = [];
    page.on("console", (message) => {
      if (
        message.type() === "error" &&
        /WebSocket closed with status code: 1011/.test(message.text())
      )
        closeErrors.push(message.text());
    });
    const chat = new ShareChatPage(page, hub);
    await chat.open();
    expect(hub.connectionCount).toBe(1);
    const joinsBefore = hub.invocations.filter(
      (call) => call.target === "JoinChat",
    ).length;

    hub.drop();

    await expect.poll(() => closeErrors.length).toBe(1);
    expect(closeErrors[0]).toContain("e2e drop");
    // The old socket is gone and exactly one new one replaced it.
    await expect
      .poll(
        () =>
          hub.invocations.filter((call) => call.target === "JoinChat").length,
      )
      .toBe(joinsBefore + 1);
    expect(hub.connectionCount).toBe(1);
  });
});
