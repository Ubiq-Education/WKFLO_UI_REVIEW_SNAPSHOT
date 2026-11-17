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

const ERROR_URL = "https://api.e2e.test/e2e/widget-errors";

test.describe("chat widget with data-require-remote-config", () => {
  test.describe("configuration loads", () => {
    test.use({ allowedConsoleErrors: [HOST_PAGE_CONSOLE_NOISE] });

    test("the saved configuration overrides the colour from the embed attributes", async ({
      page,
      mockApi,
    }) => {
      installChatWidgetMocks(mockApi);
      // Backend: PublicAgentChatConfiguration.cs returns AgentChatSettingResult.
      mockApi.on("GET", WIDGET_PATHS.configuration, () => ({
        ...mockApi.seed.chatSetting,
        primaryColor: "#00aa00",
        launcherStyle: "pill",
        launcherText: "Saved launcher text",
      }));
      const widget = new WidgetHostPage(page, WIDGET_SHARE_ID);
      await widget.open({
        "require-remote-config": "true",
        "primary-color": "#ff0000",
      });

      await expect(widget.launcher).toBeVisible();
      await expect(widget.launcher).toHaveCSS(
        "background-color",
        "rgb(0, 170, 0)",
      );
      await expect(
        widget.launcher.getByText("Saved launcher text"),
      ).toBeVisible();
    });

    test("an explicit data-agent-name still wins over the saved agent name", async ({
      page,
      mockApi,
    }) => {
      installChatWidgetMocks(mockApi);
      mockApi.on("GET", WIDGET_PATHS.configuration, () => ({
        ...mockApi.seed.chatSetting,
        agentName: "Saved Agent Name",
      }));
      const widget = new WidgetHostPage(page, WIDGET_SHARE_ID);
      await widget.open({ "require-remote-config": "true" });

      await expect(widget.launcher).toBeVisible();
    });

    test("without an embed agent name the saved one is used", async ({
      page,
      mockApi,
    }) => {
      installChatWidgetMocks(mockApi);
      mockApi.on("GET", WIDGET_PATHS.configuration, () => ({
        ...mockApi.seed.chatSetting,
        agentName: "Saved Agent Name",
      }));
      const widget = new WidgetHostPage(
        page,
        WIDGET_SHARE_ID,
        "Saved Agent Name",
      );
      await widget.open({
        "require-remote-config": "true",
        "agent-name": null,
      });

      await expect(widget.launcher).toBeVisible();
    });

    test("the saved welcome message is shown when the chat opens", async ({
      page,
      mockApi,
    }) => {
      installChatWidgetMocks(mockApi);
      const widget = new WidgetHostPage(page, WIDGET_SHARE_ID);
      await widget.open({ "require-remote-config": "true" });
      await widget.openChat();

      // The default configuration's welcome message (e2e/support/fixtures.ts chatSetting).
      await expect(
        widget.chat.getByText("Welcome to the E2E assistant."),
      ).toBeVisible();
    });
  });

  test.describe("configuration fails", () => {
    test.use({
      allowedConsoleErrors: [
        hostPageConsoleNoise(
          "Failed to load resource: the server responded with a status of 404",
          "Failed to load settings for agent",
        ),
      ],
    });

    test("renders nothing and reports the failure to data-error-url", async ({
      page,
      mockApi,
    }) => {
      installChatWidgetMocks(mockApi);
      // Backend: GetPublicAgentChatSettingQueryHandler answers 404 (resultType 4) with ErrorConst.AgentNotFound (WKFLOAI0303) on ShareId for an unknown share id.
      mockApi.on("GET", WIDGET_PATHS.configuration, () =>
        reply(
          {
            resultType: 4,
            errors: [{ code: "WKFLOAI0303", property: "ShareId" }],
          },
          404,
        ),
      );
      mockApi.on("POST", "/e2e/widget-errors", () => true);
      const widget = new WidgetHostPage(page, WIDGET_SHARE_ID);
      await widget.open({
        "require-remote-config": "true",
        "error-url": ERROR_URL,
      });

      await expect
        .poll(() => mockApi.requestsTo("POST", "/e2e/widget-errors"))
        .toHaveLength(1);
      expect(mockApi.requestsTo("POST", "/e2e/widget-errors")[0].body).toEqual({
        message: "Failed to load agent settings: request returned status 404",
      });
      await expect(widget.launcher).toHaveCount(0);
      await expect(widget.chat).toHaveCount(0);
      await expect(
        page.getByRole("heading", { name: "E2E host page" }),
      ).toBeVisible();
    });
  });
});
