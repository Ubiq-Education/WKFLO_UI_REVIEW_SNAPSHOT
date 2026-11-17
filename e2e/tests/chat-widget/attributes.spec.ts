import { expect, test } from "../../support/test";
import { WidgetHostPage } from "../../pages/chat-widget/widget-host.page";
import {
  HOST_PAGE_CONSOLE_NOISE,
  installChatWidgetMocks,
  type ChatWidgetMocks,
  WIDGET_SHARE_ID,
} from "../../support/mocks/chat-widget";

test.use({ allowedConsoleErrors: [HOST_PAGE_CONSOLE_NOISE] });

/** A 1x1 transparent PNG, so the icon attributes need no network. */
const ICON_DATA_URI =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

test.describe("chat widget data-* attributes", () => {
  let mocks: ChatWidgetMocks;
  test.beforeEach(({ mockApi }) => {
    mocks = installChatWidgetMocks(mockApi);
  });

  test("data-agent-name names the launcher", async ({ page }) => {
    const widget = new WidgetHostPage(
      page,
      WIDGET_SHARE_ID,
      "Front Desk Helper",
    );
    await widget.open({ "agent-name": "Front Desk Helper" });

    await expect(widget.launcher).toBeVisible();
  });

  test("without data-agent-name the launcher says Assistant", async ({
    page,
  }) => {
    const widget = new WidgetHostPage(page, WIDGET_SHARE_ID, "Assistant");
    await widget.open({ "agent-name": null });

    await expect(widget.launcher).toBeVisible();
  });

  test("data-primary-color and data-foreground-color colour the launcher and the chat header", async ({
    page,
  }) => {
    const widget = new WidgetHostPage(page, WIDGET_SHARE_ID);
    await widget.open({
      "primary-color": "#ff0000",
      "foreground-color": "#00ff00",
      "launcher-style": "pill",
    });

    await expect(widget.launcher).toHaveCSS(
      "background-color",
      "rgb(255, 0, 0)",
    );
    await expect(
      widget.launcher.locator(".wkflo-widget-launcher-text"),
    ).toHaveCSS("color", "rgb(0, 255, 0)");

    await widget.openChat();
    await expect(
      widget.chat.getByRole("heading", { name: "E2E Support Agent" }),
    ).toHaveCSS("color", "rgb(0, 255, 0)");
  });

  test("the launcher defaults to the primary colour #3b82f6", async ({
    page,
  }) => {
    const widget = new WidgetHostPage(page, WIDGET_SHARE_ID);
    await widget.open();

    await expect(widget.launcher).toHaveCSS(
      "background-color",
      "rgb(59, 130, 246)",
    );
  });

  test("data-launcher-style=pill shows the custom launcher text", async ({
    page,
  }) => {
    const widget = new WidgetHostPage(page, WIDGET_SHARE_ID);
    await widget.open({
      "launcher-style": "pill",
      "launcher-text": "Chat with us",
    });

    await expect(widget.launcher.getByText("Chat with us")).toBeVisible();
    await expect(widget.launcher).toHaveClass(/wkflo-widget-minimized--pill/);
  });

  test("the pill launcher falls back to the agent name when there is no launcher text", async ({
    page,
  }) => {
    const widget = new WidgetHostPage(page, WIDGET_SHARE_ID);
    await widget.open({ "launcher-style": "pill" });

    await expect(widget.launcher.getByText("E2E Support Agent")).toBeVisible();
  });

  test("the default circle launcher shows no text", async ({ page }) => {
    const widget = new WidgetHostPage(page, WIDGET_SHARE_ID);
    await widget.open({ "launcher-text": "Chat with us" });

    await expect(widget.launcher).toBeVisible();
    await expect(widget.launcher).not.toHaveClass(
      /wkflo-widget-minimized--pill/,
    );
    await expect(widget.launcher.getByText("Chat with us")).toHaveCount(0);
  });

  test("by default the launcher and the chat sit at the bottom right", async ({
    page,
  }) => {
    const widget = new WidgetHostPage(page, WIDGET_SHARE_ID);
    await widget.open();
    await expect(widget.launcher).toBeVisible();
    const viewport = page.viewportSize()!;
    const launcherBox = (await widget.launcher.boundingBox())!;
    expect(launcherBox.x).toBeGreaterThan(viewport.width / 2);
    expect(launcherBox.y + launcherBox.height).toBeGreaterThan(
      viewport.height / 2,
    );

    await widget.openChat();
    const chatBox = (await widget.chat.boundingBox())!;
    expect(chatBox.x).toBeGreaterThan(viewport.width / 2);
    expect(chatBox.y + chatBox.height).toBeGreaterThan(viewport.height / 2);
  });

  test("data-floating-position=left puts the launcher and the chat at the bottom left", async ({
    page,
  }) => {
    const widget = new WidgetHostPage(page, WIDGET_SHARE_ID);
    await widget.open({ "floating-position": "left" });
    await expect(widget.launcher).toBeVisible();
    const viewport = page.viewportSize()!;
    const launcherBox = (await widget.launcher.boundingBox())!;
    expect(launcherBox.x).toBeLessThan(viewport.width / 2);
    expect(launcherBox.y + launcherBox.height).toBeGreaterThan(
      viewport.height / 2,
    );

    await widget.openChat();
    const chatBox = (await widget.chat.boundingBox())!;
    expect(chatBox.x).toBeLessThan(viewport.width / 2);
    expect(chatBox.y + chatBox.height).toBeGreaterThan(viewport.height / 2);
  });

  test("data-header-title replaces the agent name in the chat header", async ({
    page,
  }) => {
    const widget = new WidgetHostPage(page, WIDGET_SHARE_ID);
    await widget.open({ "header-title": "Ask the front desk" });
    await widget.openChat();

    await expect(
      widget.chat.getByRole("heading", { name: "Ask the front desk" }),
    ).toBeVisible();
    await expect(
      widget.chat.getByRole("heading", { name: "E2E Support Agent" }),
    ).toHaveCount(0);
  });

  test("data-width and data-height size the chat window", async ({ page }) => {
    const widget = new WidgetHostPage(page, WIDGET_SHARE_ID);
    await widget.open({ width: "420px", height: "500px" });
    await widget.openChat();

    await expect(widget.chat).toHaveCSS("width", "420px");
    await expect(widget.chat).toHaveCSS("height", "500px");
  });

  test("data-chat-width=wide makes the chat window 28rem wide", async ({
    page,
  }) => {
    const widget = new WidgetHostPage(page, WIDGET_SHARE_ID);
    await widget.open({ "chat-width": "wide" });
    await widget.openChat();

    await expect(widget.chat).toHaveCSS("width", "448px");
  });

  test("the chat window is 24rem wide by default", async ({ page }) => {
    const widget = new WidgetHostPage(page, WIDGET_SHARE_ID);
    await widget.open();
    await widget.openChat();

    await expect(widget.chat).toHaveCSS("width", "384px");
  });

  test("data-footer-message shows under the composer", async ({ page }) => {
    const widget = new WidgetHostPage(page, WIDGET_SHARE_ID);
    await widget.open({ "footer-message": "Answers may be inaccurate." });
    await widget.openChat();

    await expect(
      widget.chat.getByText("Answers may be inaccurate."),
    ).toBeVisible();
  });

  test("data-bubble-icon-path replaces the launcher icon", async ({ page }) => {
    const widget = new WidgetHostPage(page, WIDGET_SHARE_ID);
    await widget.open({ "bubble-icon-path": ICON_DATA_URI });

    await expect(
      widget.launcher.getByRole("img", { name: "Chat bubble icon" }),
    ).toHaveAttribute("src", ICON_DATA_URI);
  });

  test("data-target-element mounts the widget inside that element of the host page", async ({
    page,
  }) => {
    const widget = new WidgetHostPage(page, WIDGET_SHARE_ID);
    await widget.open({
      "target-element": "#widget-target",
      "container-id": "e2e-widget-container",
    });

    await expect(
      page.locator("#widget-target > #e2e-widget-container"),
    ).toHaveCount(1);
    await expect(widget.launcher).toBeVisible();
  });

  test("data-predefined-prompts shows one chip per prompt under the welcome message", async ({
    page,
  }) => {
    const widget = new WidgetHostPage(page, WIDGET_SHARE_ID);
    await widget.open({
      "predefined-prompts": JSON.stringify([
        { title: "Opening hours", prompt: "What are your opening hours?" },
        { title: "Contact", prompt: "How can I contact you?" },
      ]),
    });
    await widget.openChat();
    await expect(widget.promptChips).toHaveCount(2);

    await expect(
      widget.chat.getByRole("button", { name: "Opening hours" }),
    ).toBeVisible();
    await expect(
      widget.chat.getByRole("button", { name: "Contact" }),
    ).toBeVisible();
  });

  test("clicking a predefined prompt sends its prompt text", async ({
    page,
    mockApi,
    hub,
  }) => {
    const widget = new WidgetHostPage(page, WIDGET_SHARE_ID);
    await widget.open({
      "predefined-prompts": JSON.stringify([
        { title: "Opening hours", prompt: "What are your opening hours?" },
      ]),
    });
    await widget.openChat();
    await widget.waitUntilConnected();

    await widget.chat.getByRole("button", { name: "Opening hours" }).click();

    await expect.poll(() => mocks.sends()).toHaveLength(1);
    expect(
      (mocks.sends()[0].body as { input: { text: string } }).input.text,
    ).toBe("What are your opening hours?");
    await expect(
      widget.chat.getByText("What are your opening hours?"),
    ).toBeVisible();
    expect(new Set(hub.joinedSessions).size).toBe(1);
  });

  test("invalid data-predefined-prompts JSON is ignored and the chat still opens", async ({
    page,
  }) => {
    const warnings: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "warning") warnings.push(message.text());
    });
    const widget = new WidgetHostPage(page, WIDGET_SHARE_ID);
    await widget.open({ "predefined-prompts": "not json" });
    await widget.openChat();

    await expect(
      widget.chat.getByText(
        "Hi! I'm E2E Support Agent. How can I assist you today?",
      ),
    ).toBeVisible();
    await expect(widget.promptChips).toHaveCount(0);
    expect(
      warnings.some((text) =>
        text.includes("invalid data-predefined-prompts JSON"),
      ),
    ).toBe(true);
  });
});
