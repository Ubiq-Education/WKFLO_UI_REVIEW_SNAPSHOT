import { expect, test } from "../support/test";
import { TagsPanel } from "../pages/components/tags-panel";
import { replyRaw, type MockApi } from "../support/mock-api";

/**
 * Self-tests for the shared e2e infrastructure (fake SignalR hub, msal-browser swap, raw replies,
 * entity-tags store). Feature specs rely on these pieces, so a break here points at the setup and
 * not at the feature under test.
 */

/** Gives the share page's chat a share id, which turns it into a live (public API) chat. */
function shareAgent(mockApi: MockApi, shareId: string, securityConfiguration: unknown = { type: "none" }) {
  mockApi.on("GET", "/md/api/v1/tenant/agent/:id/chat-setting/:kind", ({ params }) => ({
    ...mockApi.seed.chatSetting,
    agentId: Number(params.id),
    isShareable: true,
    shareId,
    securityConfiguration,
  }));
}

test.describe("fake SignalR hub", () => {
  test("handshakes, joins the chat and streams a reply", async ({ page, mockApi, hub }) => {
    const shareId = "e2e-share-hub";
    shareAgent(mockApi, shareId);
    mockApi.on("POST", "/ai/api/v1/agent/:shareId/chat/message", () => ({ message: "accepted" }));

    await page.goto("/agents/1/share/chat-ui");
    const input = page.getByRole("textbox", { name: "Ask E2E Support Agent" });
    // The textarea is enabled once the hub is connected.
    await expect(input).toBeEnabled();
    await expect.poll(() => hub.joinedSessions.length).toBeGreaterThan(0);

    await input.fill("Hello there");
    await input.press("Enter");
    await expect.poll(() => mockApi.requestsTo("POST", "/ai/api/v1/agent/:shareId/chat/message").length).toBe(1);
    expect(mockApi.requestsTo("POST", "/ai/api/v1/agent/:shareId/chat/message")[0].url).toContain(shareId);

    hub.streamReply(hub.joinedSessions[0], ["The answer ", "is forty-two."]);
    await expect(page.getByText("The answer is forty-two.")).toBeVisible();
  });
});

test.describe("msal-browser swap", () => {
  test("the chat's azure-ad mode uses the fake MSAL and never reaches Entra ID", async ({ page, mockApi }) => {
    shareAgent(mockApi, "e2e-share-msal", {
      type: "azure-ad",
      azureAd: { clientId: "e2e-chat-client-id", tenantId: "e2e-chat-tenant-id", scopes: ["api://e2e/chat"] },
    });
    const entraRequests: string[] = [];
    page.on("request", (request) => {
      if (/login\.microsoftonline\.com/.test(request.url())) entraRequests.push(request.url());
    });

    await page.goto("/agents/1/share/chat-ui");
    await expect
      .poll(() =>
        page.evaluate(() => (window as unknown as { __E2E_MSAL_CONFIG__?: { auth?: { clientId?: string } } }).__E2E_MSAL_CONFIG__?.auth?.clientId),
      )
      .toBe("e2e-chat-client-id");
    expect(entraRequests).toEqual([]);
  });
});

test.describe("mock API", () => {
  test("replyRaw serves a download with its own content type and headers", async ({ page, mockApi }) => {
    mockApi.on("GET", "/md/api/v1/e2e/download", () =>
      replyRaw("id,name\n1,E2E Row\n", {
        contentType: "text/csv",
        headers: { "content-disposition": 'attachment; filename="e2e.csv"' },
      }),
    );
    await page.goto("/");
    const result = await page.evaluate(async () => {
      const response = await fetch("https://api.e2e.test/md/api/v1/e2e/download", { headers: { "x-e2e": "1" } });
      return { type: response.headers.get("content-type"), text: await response.text() };
    });
    expect(result).toEqual({ type: "text/csv", text: "id,name\n1,E2E Row\n" });
    expect(mockApi.requestsTo("GET", "/md/api/v1/e2e/download")).toHaveLength(1);
  });

  test("the entity-tags store assigns and removes a tag", async ({ page, mockApi }) => {
    const tags = new TagsPanel(page);
    await page.goto("/agents/1/edit");
    await tags.expectNoTags();

    await tags.assign("E2E Tag");
    await tags.expectAssigned("E2E Tag");
    expect(mockApi.entityTags.get("Agent:1")).toEqual([1]);

    await tags.remove("E2E Tag");
    await tags.expectNoTags();
    expect(mockApi.entityTags.get("Agent:1")).toEqual([]);
  });
});
