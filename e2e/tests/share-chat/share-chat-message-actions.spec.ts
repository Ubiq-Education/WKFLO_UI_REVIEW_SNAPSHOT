import { expect, test } from "../../support/test";
import { ShareChatPage } from "../../pages/share-chat/share-chat.page";
import {
  PUBLIC_PATHS,
  installShareChatMocks,
  reply,
} from "../../support/mocks/share-chat";

/** A 1x1 transparent PNG. */
const PIXEL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

test.describe("public chat: copy", () => {
  test.use({ clipboardPermission: true });

  test("Copy message puts the reply on the clipboard as markdown", async ({
    page,
    mockApi,
    hub,
  }) => {
    installShareChatMocks(mockApi);
    const chat = new ShareChatPage(page, hub);
    await chat.open();

    hub.streamReply(chat.sessionId, [
      "<p>Plain text with <strong>bold</strong> words.</p>",
    ]);
    await expect(chat.message("Plain text with bold words.")).toBeVisible();
    await chat.copyButtons.click();

    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe("Plain text with **bold** words.");
  });

  test("the welcome message has no copy or rating buttons", async ({
    page,
    mockApi,
    hub,
  }) => {
    installShareChatMocks(mockApi);
    const chat = new ShareChatPage(page, hub);
    await chat.open();

    await expect(chat.message("Welcome to the E2E assistant.")).toBeVisible();
    await expect(chat.copyButtons).toHaveCount(0);
    await expect(chat.thumbsUpButtons).toHaveCount(0);
  });
});

test.describe("public chat: rating", () => {
  test("thumbs up and thumbs down send the rating for the reply and highlight the choice", async ({
    page,
    mockApi,
    hub,
  }) => {
    const mocks = installShareChatMocks(mockApi);
    const chat = new ShareChatPage(page, hub);
    await chat.open();
    hub.streamReply(chat.sessionId, ["A rateable answer."], {
      messageId: "e2e-rate-msg",
    });
    await expect(chat.message("A rateable answer.")).toBeVisible();

    await chat.thumbsUpButtons.click();

    await expect.poll(() => mocks.ratings().length).toBe(1);
    expect(mocks.ratings()[0].body).toEqual({
      sessionId: chat.sessionId,
      input: { messageId: "e2e-rate-msg", isThumbsUp: true },
    });
    await expect(chat.thumbsUpButtons.locator("svg")).toHaveAttribute(
      "fill",
      "currentColor",
    );
    await expect(chat.thumbsDownButtons.locator("svg")).toHaveAttribute(
      "fill",
      "none",
    );

    await chat.thumbsDownButtons.click();

    await expect.poll(() => mocks.ratings().length).toBe(2);
    expect(mocks.ratings()[1].body).toEqual({
      sessionId: chat.sessionId,
      input: { messageId: "e2e-rate-msg", isThumbsUp: false },
    });
    await expect(chat.thumbsDownButtons.locator("svg")).toHaveAttribute(
      "fill",
      "currentColor",
    );
    await expect(chat.thumbsUpButtons.locator("svg")).toHaveAttribute(
      "fill",
      "none",
    );
  });

  test("a stored rating is shown when the history loads", async ({
    page,
    mockApi,
    hub,
  }) => {
    const mocks = installShareChatMocks(mockApi);
    mocks.history.push({
      id: "h-1",
      messageId: "h-1",
      type: "assistant",
      content: "A rated answer.",
      channelMessageType: 1,
      rating: "thumbsUp",
    });
    const chat = new ShareChatPage(page, hub);
    await chat.open();

    await expect(chat.message("A rated answer.")).toBeVisible();
    await expect(chat.thumbsUpButtons.locator("svg")).toHaveAttribute(
      "fill",
      "currentColor",
    );
    await expect(chat.thumbsDownButtons.locator("svg")).toHaveAttribute(
      "fill",
      "none",
    );
  });

  test.describe("when the API rejects the rating", () => {
    test.use({
      allowedConsoleErrors: [
        /Failed to load resource|Rate message API request failed/,
      ],
    });

    test("keeps showing the rating although it was not saved", async ({
      page,
      mockApi,
      hub,
    }) => {
      const mocks = installShareChatMocks(mockApi);
      mockApi.on("POST", PUBLIC_PATHS.rate, () =>
        reply({ errors: [{ property: "", code: "WKFLO0001" }] }, 500),
      );
      const chat = new ShareChatPage(page, hub);
      await chat.open();
      hub.streamReply(chat.sessionId, ["An answer whose rating fails."]);
      await expect(chat.message("An answer whose rating fails.")).toBeVisible();

      const rated = page.waitForResponse((response) =>
        response.url().includes("/chat/message/rate"),
      );
      await chat.thumbsUpButtons.click();
      expect((await rated).status()).toBe(500);

      // Known bug: see US 8186 item 46 (the thumb stays highlighted and no error is shown, so the user believes it was saved).
      // shared/components/agent-chat-interface.tsx:1177 updates the rating before the call and ignores its result.
      expect(mocks.ratings()).toHaveLength(1);
      await expect(chat.thumbsUpButtons.locator("svg")).toHaveAttribute(
        "fill",
        "currentColor",
      );
      await expect(page.getByRole("alert")).toHaveCount(0);
      await expect(page.locator('li[role="status"]')).toHaveCount(0);
    });
  });
});

test.describe("public chat: images", () => {
  test("downloads an image of a reply with the file name of its URL", async ({
    page,
    mockApi,
    hub,
  }) => {
    installShareChatMocks(mockApi);
    await page.route("https://img.e2e.test/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "image/png",
        headers: { "access-control-allow-origin": "*" },
        body: Buffer.from(PIXEL_PNG_BASE64, "base64"),
      }),
    );
    const chat = new ShareChatPage(page, hub);
    await chat.open();

    hub.streamReply(chat.sessionId, [
      '<p>Here is the chart.</p><img src="https://img.e2e.test/files/chart.png" alt="Sales chart">',
    ]);
    const image = page.getByRole("img", { name: "Sales chart" });
    await expect(image).toBeVisible();

    const download = page.waitForEvent("download");
    // The button is transparent until hovered, but clickable.
    await page.getByRole("button", { name: "Download image" }).click();

    expect((await download).suggestedFilename()).toBe("chart.png");
  });

  test("downloads an inline (data URL) image", async ({
    page,
    mockApi,
    hub,
  }) => {
    installShareChatMocks(mockApi);
    const chat = new ShareChatPage(page, hub);
    await chat.open();

    hub.streamReply(chat.sessionId, [
      `<p>Inline picture.</p><img src="data:image/png;base64,${PIXEL_PNG_BASE64}" alt="Inline picture">`,
    ]);
    const image = page.getByRole("img", { name: "Inline picture" });
    await expect(image).toBeVisible();

    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download image" }).click();

    expect((await download).suggestedFilename()).toBe("image.png");
  });

  test.describe("broken image", () => {
    // The browser logs the failed image request.
    test.use({ allowedConsoleErrors: [/Failed to load resource/] });

    test("an image that cannot load is swapped for the placeholder and cannot be downloaded", async ({
      page,
      mockApi,
      hub,
    }) => {
      installShareChatMocks(mockApi);
      await page.route("https://img.e2e.test/**", (route) => route.abort());
      // The placeholder is a static asset of the app, so it is served by the e2e web server as usual.
      const chat = new ShareChatPage(page, hub);
      await chat.open();

      hub.streamReply(chat.sessionId, [
        '<p>A missing picture.</p><img src="https://img.e2e.test/files/gone.png" alt="Gone picture">',
      ]);

      await expect(
        page.getByRole("img", { name: "Image no longer available" }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Download image" }),
      ).toHaveCount(0);
    });
  });
});
