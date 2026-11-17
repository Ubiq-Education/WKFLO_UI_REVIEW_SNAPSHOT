import { expect, test } from "../../support/test";
import { WidgetHostPage } from "../../pages/chat-widget/widget-host.page";
import {
  HOST_PAGE_CONSOLE_NOISE,
  installChatWidgetMocks,
  WIDGET_SHARE_ID,
} from "../../support/mocks/chat-widget";

test.use({ allowedConsoleErrors: [HOST_PAGE_CONSOLE_NOISE] });

test.describe("chat widget launcher", () => {
  test.beforeEach(({ mockApi }) => {
    installChatWidgetMocks(mockApi);
  });

  test("starts minimised as a launcher button on the host page", async ({
    page,
  }) => {
    const widget = new WidgetHostPage(page, WIDGET_SHARE_ID);
    await widget.open();

    await expect(widget.launcher).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "E2E host page" }),
    ).toBeVisible();
    await expect(widget.chat).toHaveCount(0);
    // css-prefix isolation: the widget lives in the host document, not in a shadow root.
    await expect(widget.root).toHaveCount(1);
  });

  test("opens the chat with the agent name and the welcome message when the launcher is clicked", async ({
    page,
  }) => {
    const widget = new WidgetHostPage(page, WIDGET_SHARE_ID);
    await widget.open({ "welcome-message": "Welcome to the e2e widget." });
    await widget.openChat();

    await expect(widget.launcher).toHaveCount(0);
    await expect(
      widget.chat.getByRole("heading", { name: "E2E Support Agent" }),
    ).toBeVisible();
    await expect(
      widget.chat.getByText("Welcome to the e2e widget."),
    ).toBeVisible();
  });

  test("falls back to a generated welcome message when none is configured", async ({
    page,
  }) => {
    const widget = new WidgetHostPage(page, WIDGET_SHARE_ID);
    await widget.open();
    await widget.openChat();

    await expect(
      widget.chat.getByText(
        "Hi! I'm E2E Support Agent. How can I assist you today?",
      ),
    ).toBeVisible();
  });

  test("the minimise button returns to the launcher", async ({ page }) => {
    const widget = new WidgetHostPage(page, WIDGET_SHARE_ID);
    await widget.open();
    await widget.openChat();

    await widget.minimizeButton.click();

    await expect(widget.chat).toHaveCount(0);
    await expect(widget.launcher).toBeVisible();
  });

  test("the close button only minimises the widget; it does not remove it", async ({
    page,
  }) => {
    const widget = new WidgetHostPage(page, WIDGET_SHARE_ID);
    await widget.open();
    await widget.openChat();

    await widget.closeButton.click();

    // chat-widget/src/widget.tsx wires onClose to minimize(), so the launcher is always left behind.
    await expect(widget.chat).toHaveCount(0);
    await expect(widget.launcher).toBeVisible();
  });

  test("data-start-minimized=false opens the chat straight away", async ({
    page,
  }) => {
    const widget = new WidgetHostPage(page, WIDGET_SHARE_ID);
    await widget.open({ "start-minimized": "false" });

    await expect(widget.chat).toBeVisible();
    await expect(widget.launcher).toHaveCount(0);
  });

  test("keeps the conversation when the widget is minimised and opened again", async ({
    page,
    hub,
  }) => {
    const widget = new WidgetHostPage(page, WIDGET_SHARE_ID);
    await widget.open();
    await widget.openChat();
    await widget.waitUntilConnected();
    await widget.send("Remember this message");
    await expect(widget.chat.getByText("Remember this message")).toBeVisible();

    await widget.minimizeButton.click();
    await expect(widget.chat).toHaveCount(0);
    await widget.openChat();

    await expect(widget.chat.getByText("Remember this message")).toBeVisible();
    expect(new Set(hub.joinedSessions).size).toBe(1);
  });

  test("the launcher is reachable by its title only (no role or accessible name)", async ({
    page,
  }) => {
    const widget = new WidgetHostPage(page, WIDGET_SHARE_ID);
    await widget.open();

    await expect(widget.launcher).toBeVisible();
    // Known bug: see US 8186 item 56 - the launcher is a clickable <div> (shared/components/agent-chat-interface.tsx:1190-1201
    // "wkflo-widget-minimized"), so it is not a button for assistive tech and cannot be reached with the keyboard.
    await expect(
      page.getByRole("button", { name: /Open E2E Support Agent chat/ }),
    ).toHaveCount(0);
  });
});

test("the header's minimise and close buttons have no accessible name", async ({
  page,
  mockApi,
}) => {
  installChatWidgetMocks(mockApi);
  const widget = new WidgetHostPage(page, WIDGET_SHARE_ID);
  await widget.open();
  await widget.openChat();

  await expect(widget.minimizeButton).toBeVisible();
  await expect(widget.closeButton).toBeVisible();
  // Known bug: see US 8186 item 57 - the icon-only buttons in WidgetControls
  // (shared/components/chat-header.tsx:192-212) have no aria-label or title, so a screen reader announces just "button".
  await expect(widget.minimizeButton).toHaveAccessibleName("");
  await expect(widget.closeButton).toHaveAccessibleName("");
});
