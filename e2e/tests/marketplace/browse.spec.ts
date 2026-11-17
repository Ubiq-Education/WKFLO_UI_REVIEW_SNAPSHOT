import { expect, test } from "../../support/test";
import { BrowseMarketplacePage } from "../../pages/marketplace/browse.page";
import { Toast } from "../../pages/components/toast";
import { installMarketplaceMocks, ratingsSent, unexpectedReply, type MarketplaceMocks } from "../../support/mocks/marketplace";

// The browser logs every non-2xx response as a console error; the failure tests mock these on purpose.
// The app also logs its own message when the item list cannot be loaded.
const EXPECTED_FAILURES = /Failed to load resource: the server responded with a status of (400|404|500)|Failed to fetch marketplace items/;

let market: MarketplaceMocks;

const sortedNames = async (browse: BrowseMarketplacePage) => (await browse.cardNames().allTextContents()).sort();

test.describe("super power user", () => {
  test.beforeEach(({ mockApi }) => {
    market = installMarketplaceMocks(mockApi);
  });

  test.describe("browse", () => {
    test("lists every agent and tool, with category, vendor and download count", async ({ page }) => {
      const browse = new BrowseMarketplacePage(page);
      await browse.goto();

      // The API unions agents and tools without an ORDER BY, so only the set of names is asserted.
      await expect.poll(() => sortedNames(browse)).toEqual(["E2E Lookup Plugin", "E2E Research Template", "E2E Template Agent", "E2E Template Tool"]);
      const card = browse.card("E2E Template Agent");
      await expect(card).toContainText("by UBIQ Education");
      await expect(card).toContainText("AI Agents");
      await expect(card).toContainText("A template agent that answers questions.");
      await expect(browse.downloads("E2E Template Agent")).toHaveText("3");
      await expect(browse.card("E2E Template Tool")).toContainText("Tools");
    });

    test("search narrows the list by name, ignoring case", async ({ page }) => {
      const browse = new BrowseMarketplacePage(page);
      await browse.goto();

      await browse.searchBox.fill("RESEARCH");

      await expect(browse.cardNames()).toHaveText(["E2E Research Template"]);
    });

    test("a search with no match shows the empty state, and clearing it brings the items back", async ({ page }) => {
      const browse = new BrowseMarketplacePage(page);
      await browse.goto();

      await browse.searchBox.fill("no such item");
      await expect(browse.emptyState).toBeVisible();
      await expect(browse.cardNames()).toHaveCount(0);

      await browse.searchBox.fill("");
      await expect(browse.cardNames()).toHaveCount(4);
      await expect(browse.emptyState).toHaveCount(0);
    });

    test("the category buttons filter the list, and All restores it", async ({ page }) => {
      const browse = new BrowseMarketplacePage(page);
      await browse.goto();

      await browse.category("Tools").click();
      await expect(browse.cardNames()).toHaveText(["E2E Template Tool", "E2E Lookup Plugin"]);

      await browse.category("AI Agents").click();
      await expect(browse.cardNames()).toHaveText(["E2E Template Agent", "E2E Research Template"]);

      await browse.category("All").click();
      await expect(browse.cardNames()).toHaveCount(4);
    });

    test("search and category combine", async ({ page }) => {
      const browse = new BrowseMarketplacePage(page);
      await browse.goto();

      await browse.category("Tools").click();
      await browse.searchBox.fill("lookup");
      await expect(browse.cardNames()).toHaveText(["E2E Lookup Plugin"]);

      await browse.searchBox.fill("research");
      await expect(browse.emptyState).toBeVisible();
    });

    test("an empty catalog shows the empty state", async ({ page }) => {
      market.store.agents.forEach((agent) => (agent.isDeleted = true));
      market.store.tools.forEach((tool) => (tool.isDeleted = true));
      const browse = new BrowseMarketplacePage(page);
      await browse.goto();

      await expect(browse.emptyState).toBeVisible();
    });

    test.describe("when the list cannot be loaded", () => {
      test.use({ allowedConsoleErrors: [EXPECTED_FAILURES] });

      test("shows the same empty state as an empty catalog", async ({ page, mockApi }) => {
        mockApi.on("GET", "/md/api/v1/marketplace/items", () => unexpectedReply());
        const browse = new BrowseMarketplacePage(page);
        await browse.goto();

        // Known bug: see US 8186 item 77 (browse.tsx:79-85 only logs the failure; the user cannot tell it from an empty marketplace)
        await expect(browse.emptyState).toBeVisible();
        await expect(page.getByText(/error|failed|try again/i)).toHaveCount(0);
      });
    });
  });

  test.describe("rating", () => {
    test("shows the rounded average as filled stars", async ({ page }) => {
      const browse = new BrowseMarketplacePage(page);
      await browse.goto();

      await expect(browse.card("E2E Template Agent")).toBeVisible();
      await expect(browse.filledStars("E2E Template Agent")).toHaveCount(4);
      // Ratings 5 and 4 average 4.5, which rounds up.
      await expect(browse.filledStars("E2E Research Template")).toHaveCount(5);
      await expect(browse.filledStars("E2E Template Tool")).toHaveCount(3);
      await expect(browse.filledStars("E2E Lookup Plugin")).toHaveCount(0);
    });

    test("every star has an accessible name but is a plain svg, not a keyboard-operable control", async ({ page }) => {
      const browse = new BrowseMarketplacePage(page);
      await browse.goto();

      for (let rating = 1; rating <= 5; rating += 1) {
        await expect(browse.star("E2E Template Agent", rating)).toBeVisible();
      }
      // Known bug: see US 8186 item 79 (browse.tsx renders each star as an <svg onClick> with an aria-label,
      // no role and no tabindex, so keyboard and assistive-technology users cannot rate)
      const star = browse.star("E2E Template Agent", 5);
      await expect(star).not.toHaveAttribute("role", /.+/);
      await expect(star).not.toHaveAttribute("tabindex", /.*/);
      await expect(page.getByRole("button", { name: /^Rate / })).toHaveCount(0);
    });

    test("rating an agent posts the rating, toasts and refreshes the average", async ({ page, mockApi }) => {
      const browse = new BrowseMarketplacePage(page);
      const toast = new Toast(page);
      await browse.goto();
      await expect(browse.filledStars("E2E Template Agent")).toHaveCount(4);

      await browse.star("E2E Template Agent", 5).click();

      await toast.expectShown("Rating updated");
      await toast.expectShown("Thank you for rating this item!");
      expect(ratingsSent(mockApi, "agent", 1)).toEqual([{ rating: 5 }]);
      // The list is fetched again: ratings 4 and 5 now average 4.5.
      await expect(browse.filledStars("E2E Template Agent")).toHaveCount(5);
      expect(mockApi.requestsTo("GET", "/md/api/v1/marketplace/items")).toHaveLength(2);
    });

    test("rating a tool uses the tool endpoint", async ({ page, mockApi }) => {
      const browse = new BrowseMarketplacePage(page);
      const toast = new Toast(page);
      await browse.goto();

      await browse.star("E2E Lookup Plugin", 2).click();

      await toast.expectShown("Rating updated");
      expect(ratingsSent(mockApi, "tool", 2)).toEqual([{ rating: 2 }]);
      expect(ratingsSent(mockApi, "agent", 2)).toEqual([]);
      await expect(browse.filledStars("E2E Lookup Plugin")).toHaveCount(2);
    });

    test.describe("when the item was deleted meanwhile", () => {
      test.use({ allowedConsoleErrors: [EXPECTED_FAILURES] });

      test("shows the raw error and keeps the stale card", async ({ page, mockApi }) => {
        const browse = new BrowseMarketplacePage(page);
        const toast = new Toast(page);
        await browse.goto();
        await expect(browse.card("E2E Template Agent")).toBeVisible();
        market.store.agents[0].isDeleted = true;

        await browse.star("E2E Template Agent", 3).click();

        await toast.expectShown(/Failed to update rating: 400: .*"code":"WKFLOMD0303"/);
        expect(ratingsSent(mockApi, "agent", 1)).toEqual([{ rating: 3 }]);
        await expect(browse.card("E2E Template Agent")).toBeVisible();
      });
    });
  });

  test.describe("install", () => {
    test("installing an agent posts, toasts, switches to Re-install and adds a download", async ({ page, mockApi }) => {
      const browse = new BrowseMarketplacePage(page);
      const toast = new Toast(page);
      await browse.goto();
      await expect(browse.downloads("E2E Research Template")).toHaveText("7");
      await expect(browse.installButton("E2E Research Template")).toHaveText("Install");

      await browse.installButton("E2E Research Template").click();

      await toast.expectShown("Agent installed");
      await toast.expectShown("The agent has been successfully installed.");
      expect(mockApi.requestsTo("POST", "/md/api/v1/marketplace/agents/2/install")).toHaveLength(1);
      await expect(browse.installButton("E2E Research Template")).toHaveText("Re-install");
      await expect(browse.downloads("E2E Research Template")).toHaveText("8");
    });

    test("installing a tool uses the tool endpoint", async ({ page, mockApi }) => {
      const browse = new BrowseMarketplacePage(page);
      const toast = new Toast(page);
      await browse.goto();

      await browse.installButton("E2E Template Tool").click();

      await toast.expectShown("Tool installed");
      expect(mockApi.requestsTo("POST", "/md/api/v1/marketplace/tools/1/install")).toHaveLength(1);
      expect(mockApi.requestsTo("POST", "/md/api/v1/marketplace/agents/1/install")).toHaveLength(0);
      await expect(browse.installButton("E2E Template Tool")).toHaveText("Re-install");
      await expect(browse.downloads("E2E Template Tool")).toHaveText("2");
    });

    test("an installed agent shows up in the tenant's agents", async ({ page }) => {
      const browse = new BrowseMarketplacePage(page);
      const toast = new Toast(page);
      await browse.goto();
      await browse.installButton("E2E Template Agent").click();
      await toast.expectShown("Agent installed");

      await page.getByRole("link", { name: "Agents", exact: true }).click();

      await expect(page.getByRole("heading", { level: 1, name: "Agents" })).toBeVisible();
      await expect(page.getByText("E2E Template Agent", { exact: true })).toBeVisible();
    });

    test.describe("an item the caller installed before", () => {
      test.beforeEach(() => {
        market.store.userInstalls.add("AIAgent_1");
      });

      test("offers Re-install and asks for confirmation first", async ({ page, mockApi }) => {
        const browse = new BrowseMarketplacePage(page);
        await browse.goto();
        await expect(browse.installButton("E2E Template Agent")).toHaveText("Re-install");

        await browse.installButton("E2E Template Agent").click();

        await browse.warningDialog.expectVisible();
        await browse.warningDialog.expectText("You have already clicked to install this item before.");
        expect(mockApi.requestsTo("POST", "/md/api/v1/marketplace/agents/1/install")).toHaveLength(0);
      });

      test("cancelling the warning installs nothing", async ({ page, mockApi }) => {
        const browse = new BrowseMarketplacePage(page);
        await browse.goto();
        await browse.installButton("E2E Template Agent").click();

        await browse.warningDialog.cancel();

        await browse.warningDialog.expectClosed();
        expect(mockApi.requestsTo("POST", "/md/api/v1/marketplace/agents/1/install")).toHaveLength(0);
        await expect(browse.downloads("E2E Template Agent")).toHaveText("3");
      });

      test("proceeding installs the agent", async ({ page, mockApi }) => {
        const browse = new BrowseMarketplacePage(page);
        const toast = new Toast(page);
        await browse.goto();
        await browse.installButton("E2E Template Agent").click();

        await browse.warningDialog.confirm("Proceed with Installation");

        await toast.expectShown("Agent installed");
        await browse.warningDialog.expectClosed();
        expect(mockApi.requestsTo("POST", "/md/api/v1/marketplace/agents/1/install")).toHaveLength(1);
        await expect(browse.downloads("E2E Template Agent")).toHaveText("4");
      });

      test("installing again into the same tenant does not add another download", async ({ page, mockApi }) => {
        const browse = new BrowseMarketplacePage(page);
        const toast = new Toast(page);
        await browse.goto();
        await browse.installButton("E2E Template Agent").click();
        await browse.warningDialog.confirm("Proceed with Installation");
        await expect(browse.downloads("E2E Template Agent")).toHaveText("4");
        await toast.expectShown("Agent installed");
        await expect.poll(() => mockApi.requestsTo("GET", "/md/api/v1/marketplace/items").length).toBe(2);

        await browse.installButton("E2E Template Agent").click();
        await browse.warningDialog.confirm("Proceed with Installation");

        await expect.poll(() => mockApi.requestsTo("POST", "/md/api/v1/marketplace/agents/1/install").length).toBe(2);
        // Wait for the list refetch that follows the second install (load, first install, second install).
        await expect.poll(() => mockApi.requestsTo("GET", "/md/api/v1/marketplace/items").length).toBe(3);
        await expect(browse.downloads("E2E Template Agent")).toHaveText("4");
        expect(mockApi.seed.agents.filter((agent) => agent.name === "E2E Template Agent")).toHaveLength(1);
      });
    });

    test.describe("failures", () => {
      test.use({ allowedConsoleErrors: [EXPECTED_FAILURES] });

      test("an agent deleted meanwhile is a raw 404 and the button comes back", async ({ page }) => {
        const browse = new BrowseMarketplacePage(page);
        const toast = new Toast(page);
        await browse.goto();
        await expect(browse.card("E2E Research Template")).toBeVisible();
        market.store.agents[1].isDeleted = true;

        await browse.installButton("E2E Research Template").click();

        await toast.expectShown(/Failed to install agent: 404: .*"code":"WKFLOMD0303"/);
        await expect(browse.installButton("E2E Research Template")).toHaveText("Install");
        await expect(browse.installButton("E2E Research Template")).toBeEnabled();
      });

      test("a tool deleted meanwhile is a raw 404", async ({ page }) => {
        const browse = new BrowseMarketplacePage(page);
        const toast = new Toast(page);
        await browse.goto();
        await expect(browse.card("E2E Template Tool")).toBeVisible();
        market.store.tools[0].isDeleted = true;

        await browse.installButton("E2E Template Tool").click();

        await toast.expectShown(/Failed to install tool: 404: .*"code":"WKFLOMD0403"/);
        await expect(browse.installButton("E2E Template Tool")).toHaveText("Install");
      });

      test("an unexpected server error shows the raw 500 body", async ({ page, mockApi }) => {
        mockApi.on("POST", "/md/api/v1/marketplace/agents/:id/install", () => unexpectedReply());
        const browse = new BrowseMarketplacePage(page);
        const toast = new Toast(page);
        await browse.goto();

        await browse.installButton("E2E Template Agent").click();

        await toast.expectShown(/Failed to install agent: 500: .*"code":"WKFLO0001"/);
        await expect(browse.installButton("E2E Template Agent")).toHaveText("Install");
      });
    });
  });

  test.describe("delete", () => {
    test("deleting an agent asks first, then removes it", async ({ page, mockApi }) => {
      const browse = new BrowseMarketplacePage(page);
      const toast = new Toast(page);
      await browse.goto();

      await browse.deleteButton("E2E Template Agent").click();
      await browse.deleteDialog.expectVisible();
      await browse.deleteDialog.expectText("permanently delete the agent");
      expect(mockApi.requestsTo("DELETE", "/md/api/v1/marketplace/agent/1")).toHaveLength(0);
      await browse.deleteDialog.confirm("Delete");

      await toast.expectShown("Agent deleted");
      expect(mockApi.requestsTo("DELETE", "/md/api/v1/marketplace/agent/1")).toHaveLength(1);
      await expect.poll(() => sortedNames(browse)).toEqual(["E2E Lookup Plugin", "E2E Research Template", "E2E Template Tool"]);
    });

    test("cancelling the confirmation keeps the agent", async ({ page, mockApi }) => {
      const browse = new BrowseMarketplacePage(page);
      await browse.goto();

      await browse.deleteButton("E2E Template Agent").click();
      await browse.deleteDialog.cancel();

      await browse.deleteDialog.expectClosed();
      expect(mockApi.requestsTo("DELETE", /\/marketplace\/agent\//)).toHaveLength(0);
      await expect(browse.card("E2E Template Agent")).toBeVisible();
    });

    test("deleting a tool uses the tool endpoint", async ({ page, mockApi }) => {
      const browse = new BrowseMarketplacePage(page);
      const toast = new Toast(page);
      await browse.goto();

      await browse.deleteButton("E2E Lookup Plugin").click();
      await browse.deleteDialog.expectText("permanently delete the tool");
      await browse.deleteDialog.confirm("Delete");

      await toast.expectShown("Tool deleted");
      expect(mockApi.requestsTo("DELETE", "/md/api/v1/marketplace/tool/2")).toHaveLength(1);
      await expect(browse.card("E2E Lookup Plugin")).toHaveCount(0);
      await expect(browse.card("E2E Template Tool")).toBeVisible();
    });

    test.describe("failures", () => {
      test.use({ allowedConsoleErrors: [EXPECTED_FAILURES] });

      test("a tool already deleted by someone else is a raw 400", async ({ page }) => {
        const browse = new BrowseMarketplacePage(page);
        const toast = new Toast(page);
        await browse.goto();
        await expect(browse.card("E2E Lookup Plugin")).toBeVisible();
        market.store.tools[1].isDeleted = true;

        await browse.deleteButton("E2E Lookup Plugin").click();
        await browse.deleteDialog.confirm("Delete");

        await toast.expectShown(/Failed to delete tool: 400: .*"code":"WKFLOMD0402"/);
        await expect(browse.card("E2E Lookup Plugin")).toBeVisible();
      });

      test("an agent already deleted by someone else is a raw 400", async ({ page }) => {
        const browse = new BrowseMarketplacePage(page);
        const toast = new Toast(page);
        await browse.goto();
        await expect(browse.card("E2E Template Agent")).toBeVisible();
        market.store.agents[0].isDeleted = true;

        await browse.deleteButton("E2E Template Agent").click();
        await browse.deleteDialog.confirm("Delete");

        await toast.expectShown(/Failed to delete agent: 400: .*"code":"WKFLOMD0302"/);
      });
    });
  });
});

test.describe("standard user", () => {
  test.use({ isSuperPowerUser: false });

  test.beforeEach(({ mockApi }) => {
    market = installMarketplaceMocks(mockApi);
  });

  test("can browse and filter but has no Install or Delete buttons", async ({ page }) => {
    const browse = new BrowseMarketplacePage(page);
    await browse.goto();

    await expect(browse.cardNames()).toHaveCount(4);
    await expect(page.getByRole("button", { name: /^(Install|Re-install)$/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Delete / })).toHaveCount(0);
    await browse.category("Tools").click();
    await expect(browse.cardNames()).toHaveCount(2);
  });

  test("can still rate an item", async ({ page, mockApi }) => {
    const browse = new BrowseMarketplacePage(page);
    const toast = new Toast(page);
    await browse.goto();

    await browse.star("E2E Template Tool", 1).click();

    await toast.expectShown("Rating updated");
    expect(ratingsSent(mockApi, "tool", 1)).toEqual([{ rating: 1 }]);
    // Ratings 3 and 1 average 2.
    await expect(browse.filledStars("E2E Template Tool")).toHaveCount(2);
  });
});
