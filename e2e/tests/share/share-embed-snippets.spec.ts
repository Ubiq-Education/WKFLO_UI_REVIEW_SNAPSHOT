import { expect, test } from "../../support/test";
import { TENANT_A } from "../../support/fixtures";
import { SharePage } from "../../pages/share/share-page";
import { FAKE_API_KEY, installIconAssets, installSharePagesMocks } from "../../support/mocks/share-pages";

const SHARE_ID = "e2e-share-snippets";
/** The default seed has a welcome and footer message; tests that need them absent clear them. */
const NO_MESSAGES = { welcomeMessage: "", footerMessage: "" };
const LINK = `https://api.e2e.test/md/chat/${SHARE_ID}`;

// Some settings point icons and the CSS URL at the fake CDN, which the widget preview loads.
test.beforeEach(async ({ page }) => {
  await installIconAssets(page);
});

test.describe("Chat UI embed snippets", () => {
  test("shows the iframe code and the direct link built from the share id", async ({ page, mockApi }) => {
    installSharePagesMocks(mockApi, { isShareable: true, shareId: SHARE_ID });
    const share = new SharePage(page, "chat-ui");
    await share.goto();

    await expect(share.snippet).toHaveValue(`<iframe\n  src="${LINK}"\n  width="400"\n  height="600"\n  frameborder="0"\n></iframe>`);
    await expect(share.directLink).toHaveValue(LINK);
    await expect(share.snippet).toHaveAttribute("readonly", "");
    await expect(share.directLink).toHaveAttribute("readonly", "");
  });

  test("never adds allow=microphone to the iframe, even when the agent has voice chat on", async ({ page, mockApi }) => {
    installSharePagesMocks(mockApi, { isShareable: true, shareId: SHARE_ID, setting: { isVoiceChatEnabled: true } });
    const share = new SharePage(page, "chat-ui");
    await share.goto();

    // Known bug: see US 8186 item 9. The attribute follows a global context flag, not this agent's setting.
    // Wait for the loaded setting (the share id) to reach the snippet before asserting the attribute is absent.
    await expect(share.snippet).toHaveValue(new RegExp(SHARE_ID));
    await expect(share.snippet).not.toHaveValue(/allow="microphone"/);
  });

  test.describe("copy buttons", () => {
    test.use({ clipboardPermission: true });

    test("copy the iframe code to the clipboard and confirm with a toast", async ({ page, mockApi }) => {
      installSharePagesMocks(mockApi, { isShareable: true, shareId: SHARE_ID });
      const share = new SharePage(page, "chat-ui");
      await share.goto();
      await expect(share.snippet).toHaveValue(new RegExp(SHARE_ID));
      const code = await share.snippet.inputValue();

      await share.copySnippetButton.click();

      await share.toast.expectShown("Code copied to clipboard");
      expect(await share.readClipboard()).toBe(code);
    });

    test("copy the direct link to the clipboard", async ({ page, mockApi }) => {
      installSharePagesMocks(mockApi, { isShareable: true, shareId: SHARE_ID });
      const share = new SharePage(page, "chat-ui");
      await share.goto();
      await expect(share.directLink).toHaveValue(LINK);

      await share.copyLinkButton.click();

      await share.toast.expectShown("Code copied to clipboard");
      expect(await share.readClipboard()).toBe(LINK);
    });
  });

  test("shows an error toast when the clipboard write is rejected", async ({ page, mockApi }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: () => Promise.reject(new Error("denied")), readText: () => Promise.resolve("") },
      });
    });
    installSharePagesMocks(mockApi, { isShareable: true, shareId: SHARE_ID });
    const share = new SharePage(page, "chat-ui");
    await share.goto();

    await share.copySnippetButton.click();

    await share.toast.expectShown("Failed to copy to clipboard");
    await share.toast.expectNotShown("Code copied to clipboard");
  });
});

test.describe("Chat Widget script snippet", () => {
  test("builds the script tag from the loaded settings", async ({ page, mockApi }) => {
    installSharePagesMocks(mockApi, {
      isShareable: true,
      shareId: SHARE_ID,
      setting: {
        headerTitle: "Ask E2E",
        welcomeMessage: "Hello from E2E",
        footerMessage: "E2E footer",
        bubbleIconPath: "https://assets.e2e.test/bubble.png",
        chatbotIconPath: "https://assets.e2e.test/chatbot.png",
        cssUrl: "https://assets.e2e.test/widget.css",
        floatingPosition: "left",
        launcherStyle: "pill",
        launcherText: "Need help?",
        predefinedPrompts: [{ title: "Hours", prompt: "What are the opening hours?" }],
      },
    });
    const share = new SharePage(page, "chat-widget");
    await share.goto();
    const origin = new URL(page.url()).origin;

    await expect(share.snippet).toHaveValue(
      `<script src="${origin}/assets/wkflo-widget.umd.cjs"` +
        ` data-share-id="${SHARE_ID}"` +
        ` data-tenant-guid="${TENANT_A.guid}"` +
        ` data-header-title="Ask E2E"` +
        ` data-api-endpoint="https://api.e2e.test"` +
        ` data-security-type="none"` +
        ` data-bubble-icon-path="https://assets.e2e.test/bubble.png"` +
        ` data-chatbot-icon-path="https://assets.e2e.test/chatbot.png"` +
        ` data-css-url="https://assets.e2e.test/widget.css"` +
        ` data-welcome-message="Hello from E2E"` +
        ` data-footer-message="E2E footer"` +
        ` data-predefined-prompts='[{"title":"Hours","prompt":"What are the opening hours?"}]'` +
        ` data-floating-position="left"` +
        ` data-launcher-style="pill"` +
        ` data-foreground-color="#ffffff"` +
        ` data-launcher-text="Need help?"` +
        ` ></script>`,
    );
  });

  test("leaves out the optional attributes when nothing is set, and the launcher text for a circle launcher", async ({ page, mockApi }) => {
    installSharePagesMocks(mockApi, { isShareable: true, shareId: SHARE_ID, setting: { ...NO_MESSAGES, launcherText: "Ignored text" } });
    const share = new SharePage(page, "chat-widget");
    await share.goto();

    await expect(share.snippet).toHaveValue(/data-launcher-style="circle"/);
    const code = await share.snippet.inputValue();
    for (const attribute of [
      "data-header-title",
      "data-bubble-icon-path",
      "data-chatbot-icon-path",
      "data-css-url",
      "data-welcome-message",
      "data-footer-message",
      "data-predefined-prompts",
      "data-launcher-text",
    ]) {
      expect(code).not.toContain(attribute);
    }
  });

  test("escapes single quotes in quick replies for the single-quoted attribute", async ({ page, mockApi }) => {
    installSharePagesMocks(mockApi, {
      isShareable: true,
      shareId: SHARE_ID,
      setting: { ...NO_MESSAGES, predefinedPrompts: [{ title: "Owner's hours", prompt: "When is it open?" }] },
    });
    const share = new SharePage(page, "chat-widget");
    await share.goto();

    await expect(share.snippet).toHaveValue(`<script src="${new URL(page.url()).origin}/assets/wkflo-widget.umd.cjs"` + " data-share-id=\"" + SHARE_ID + "\"" + ` data-tenant-guid="${TENANT_A.guid}" data-api-endpoint="https://api.e2e.test" data-security-type="none"` + ` data-predefined-prompts='[{"title":"Owner&#39;s hours","prompt":"When is it open?"}]'` + ` data-floating-position="right" data-launcher-style="circle" data-foreground-color="#ffffff" ></script>`);
  });

  test("follows edits made in the settings panel before they are saved", async ({ page, mockApi }) => {
    installSharePagesMocks(mockApi, { isShareable: true, shareId: SHARE_ID });
    const share = new SharePage(page, "chat-widget");
    await share.goto();

    await share.panel.headerTitle.fill("Live Title");
    await share.panel.choose(share.panel.position, "Bottom left");

    await expect(share.snippet).toHaveValue(/data-header-title="Live Title"/);
    await expect(share.snippet).toHaveValue(/data-floating-position="left"/);
  });

  test("does not escape double quotes in attribute values", async ({ page, mockApi }) => {
    installSharePagesMocks(mockApi, { isShareable: true, shareId: SHARE_ID, setting: { headerTitle: 'Ask "E2E" bot' } });
    const share = new SharePage(page, "chat-widget");
    await share.goto();

    // Known bug: see US 8186 item 8. The value's own quotes end the attribute early, breaking the tag.
    await expect(share.snippet).toHaveValue(/data-header-title="Ask "E2E" bot"/);
  });

  test("prints the API key in plain text in the snippet", async ({ page, mockApi }) => {
    installSharePagesMocks(mockApi, {
      isShareable: true,
      shareId: SHARE_ID,
      setting: { securityConfiguration: { type: "api-key", apiKey: { value: FAKE_API_KEY, tenantName: TENANT_A.name, tenantDomains: [] } } },
    });
    const share = new SharePage(page, "chat-widget");
    await share.goto();

    // Known bug: see US 8186 item 8. The secret is part of the copyable snippet.
    await expect(share.snippet).toHaveValue(
      new RegExp(`data-security-type="api-key" .*data-api-key-value="${FAKE_API_KEY}" data-api-key-tenant-name="${TENANT_A.name}"`),
    );
  });

  test("lists the Azure AD client, tenant and scopes", async ({ page, mockApi }) => {
    installSharePagesMocks(mockApi, {
      isShareable: true,
      shareId: SHARE_ID,
      setting: { securityConfiguration: { type: "azure-ad", azureAd: { clientId: "e2e-client", tenantId: "e2e-tenant", scopes: ["api://e2e/a", "api://e2e/b"] } } },
    });
    const share = new SharePage(page, "chat-widget");
    await share.goto();

    await expect(share.snippet).toHaveValue(
      /data-azure-client-id="e2e-client" data-azure-tenant-id="e2e-tenant" data-azure-scopes="api:\/\/e2e\/a,api:\/\/e2e\/b"/,
    );
  });

  test.describe("copy button", () => {
    test.use({ clipboardPermission: true });

    test("copies the script tag to the clipboard", async ({ page, mockApi }) => {
      installSharePagesMocks(mockApi, { isShareable: true, shareId: SHARE_ID });
      const share = new SharePage(page, "chat-widget");
      await share.goto();
      await expect(share.snippet).toHaveValue(new RegExp(SHARE_ID));
      const code = await share.snippet.inputValue();

      await share.copySnippetButton.click();

      await share.toast.expectShown("Code copied to clipboard");
      expect(await share.readClipboard()).toBe(code);
    });
  });
});
