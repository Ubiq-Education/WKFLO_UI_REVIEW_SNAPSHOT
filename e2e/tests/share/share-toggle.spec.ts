import { expect, test } from "../../support/test";
import { API_ORIGIN } from "../../support/mock-api";
import { SharePage, type ShareKind } from "../../pages/share/share-page";
import { failShareRequest, installSharePagesMocks, SHARE_PATHS } from "../../support/mocks/share-pages";

const KINDS: ShareKind[] = ["chat-ui", "chat-widget"];
const SNIPPET_TITLE: Record<ShareKind, string> = { "chat-ui": "Embed Code", "chat-widget": "Widget Script" };

for (const kind of KINDS) {
  test.describe(`share toggle on ${kind}`, () => {
    test("is off for an unshared agent and hides the embed snippet", async ({ page, mockApi }) => {
      installSharePagesMocks(mockApi);
      const share = new SharePage(page, kind);
      await share.goto();

      await expect(share.shareToggle).not.toBeChecked();
      await expect(page.getByText(SNIPPET_TITLE[kind], { exact: true })).toHaveCount(0);
    });

    test("turning it on sends the sharable PUT, shows the snippet and picks up the generated share id", async ({ page, mockApi }) => {
      installSharePagesMocks(mockApi);
      const share = new SharePage(page, kind);
      await share.goto();

      await share.shareToggle.click();

      await share.toast.expectShown("Shareable setting has been updated successfully");
      await expect(share.shareToggle).toBeChecked();
      const puts = mockApi.requestsTo("PUT", SHARE_PATHS.sharable);
      expect(puts).toHaveLength(1);
      expect(puts[0].body).toMatchObject({ isShareable: true, isWidget: kind === "chat-widget", primaryColor: "#3b82f6", bubbleStyle: "rounded" });
      // The success handler refetches the setting, which carries the share id the API generated.
      await expect(share.snippet).toHaveValue(/e2e-generated-share-id/);
    });

    test("turning it off hides the snippet again", async ({ page, mockApi }) => {
      installSharePagesMocks(mockApi, { isShareable: true, shareId: "e2e-share-1" });
      const share = new SharePage(page, kind);
      await share.goto();
      await expect(share.shareToggle).toBeChecked();
      await expect(share.snippet).toBeVisible();

      await share.shareToggle.click();

      await share.toast.expectShown("Shareable setting has been updated successfully");
      await expect(share.shareToggle).not.toBeChecked();
      await expect(share.snippet).toHaveCount(0);
      expect(mockApi.requestsTo("PUT", SHARE_PATHS.sharable)[0].body).toMatchObject({ isShareable: false });
    });

    test.describe("when the API rejects the change", () => {
      // The 4xx reply makes the browser log a failed resource load.
      test.use({ allowedConsoleErrors: [/Failed to load resource/] });

      test("the toggle reverts and an error toast is shown", async ({ page, mockApi }) => {
        installSharePagesMocks(mockApi);
        failShareRequest(mockApi, "sharable", "WKFLOMD0305");
        const share = new SharePage(page, kind);
        await share.goto();

        await share.shareToggle.click();

        // The error code is translated into its friendly text.
        await share.toast.expectShown(
          "Failed to update shareable setting: No published version found for this tenant agent. Please publish the agent first before sharing.",
        );
        await expect(share.shareToggle).not.toBeChecked();
        await expect(share.shareToggle).toBeEnabled();
        await expect(page.getByText(SNIPPET_TITLE[kind], { exact: true })).toHaveCount(0);
      });

      test("turning sharing off reverts back to on", async ({ page, mockApi }) => {
        installSharePagesMocks(mockApi, { isShareable: true, shareId: "e2e-share-1" });
        failShareRequest(mockApi, "sharable", "WKFLO0001", 500);
        const share = new SharePage(page, kind);
        await share.goto();

        await share.shareToggle.click();

        await share.toast.expectShown("Failed to update shareable setting: An unexpected error occurred. Please try again later.");
        await expect(share.shareToggle).toBeChecked();
        await expect(share.snippet).toBeVisible();
      });
    });
  });
}

test.describe("agent loading and not-found states", () => {
  for (const kind of KINDS) {
    test(`${kind}: shows "Agent not found" while the agent is still loading`, async ({ page, mockApi }) => {
      installSharePagesMocks(mockApi);
      const share = new SharePage(page, kind);
      // Hold the agent GET until the test releases it; the mock API answers once it is let through.
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      let held = false;
      await page.route(`${API_ORIGIN}/md/api/v1/tenant/agent/1`, async (route) => {
        held = true;
        await gate;
        await route.fallback();
      });

      await page.goto(`/agents/1/share/${kind}`);
      await expect.poll(() => held).toBe(true);

      // Known bug: see US 8186 item 6. The page treats "not loaded yet" as "not found".
      await expect(page.getByText("Agent not found")).toBeVisible();
      await expect(share.heading).toHaveCount(0);

      release();
      await expect(share.heading).toBeVisible();
      await expect(page.getByText("Agent not found")).toHaveCount(0);
    });

    test.describe(`${kind} with a missing agent`, () => {
      test.use({ allowedConsoleErrors: [/Failed to load resource/] });

      test("keeps showing \"Agent not found\"", async ({ page, mockApi }) => {
        installSharePagesMocks(mockApi);
        await page.goto(`/agents/999/share/${kind}`);

        // The agent GET answers 404 (not in the seed); wait for it before asserting the final state.
        await expect.poll(() => mockApi.requests.some((r) => r.path === "/md/api/v1/tenant/agent/999")).toBe(true);
        await expect(page.getByText("Agent not found")).toBeVisible();
        await expect(page.getByRole("heading", { level: 1 })).toHaveCount(0);
      });
    });
  }
});

test.describe("entry from the agent view page", () => {
  test("the Share tab links to both share pages and each page links back", async ({ page, mockApi }) => {
    installSharePagesMocks(mockApi);
    await page.goto("/agents/view/1");
    await page.getByRole("tab", { name: "Share" }).click();

    await page.getByRole("heading", { name: "Chat UI", level: 3 }).click();
    await expect(page).toHaveURL(/\/agents\/1\/share\/chat-ui$/);
    const ui = new SharePage(page, "chat-ui");
    await expect(ui.heading).toBeVisible();

    await ui.backButton.click();
    await expect(page).toHaveURL(/\/agents\/view\/1$/);
    await page.getByRole("tab", { name: "Share" }).click();

    await page.getByRole("heading", { name: "Chat Widget", level: 3 }).click();
    await expect(page).toHaveURL(/\/agents\/1\/share\/chat-widget$/);
    const widget = new SharePage(page, "chat-widget");
    await expect(widget.heading).toBeVisible();

    await widget.backButton.click();
    await expect(page).toHaveURL(/\/agents\/view\/1$/);
  });
});
