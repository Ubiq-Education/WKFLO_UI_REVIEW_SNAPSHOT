import { expect, test } from "../../support/test";
import { KnowledgePage } from "../../pages/knowledge/knowledge.page";
import { KnowledgeSearchPage } from "../../pages/knowledge/knowledge-search.page";
import { Toast } from "../../pages/components/toast";
import { errorReply, installKnowledgeMocks } from "../../support/mocks/knowledge";

// The browser logs every non-2xx response as a console error; the error-path tests mock these statuses on purpose.
const FAILED_REQUEST_LOG = /Failed to load resource: the server responded with a status of 500/;

async function openSearch(page: import("@playwright/test").Page) {
  const knowledge = new KnowledgePage(page);
  const search = new KnowledgeSearchPage(page);
  await knowledge.goto();
  await search.open();
  return search;
}

test.describe("Knowledge: search", () => {
  test("Search stays disabled until the query has text", async ({ page, mockApi }) => {
    installKnowledgeMocks(mockApi);
    const search = await openSearch(page);

    await expect(search.searchButton).toBeDisabled();
    await search.queryBox.fill("   ");
    await expect(search.searchButton).toBeDisabled();
    await search.queryBox.fill("visitors");
    await expect(search.searchButton).toBeEnabled();
    expect(mockApi.requestsTo("POST", "/md/api/v1/tenant/knowledge/query")).toHaveLength(0);
  });

  test("a query is posted with an empty tag list and a limit of 5, and the passages are listed", async ({ page, mockApi }) => {
    const store = installKnowledgeMocks(mockApi);
    const search = await openSearch(page);

    await search.search("visitors");

    await expect(search.resultsHeading).toBeVisible();
    await expect(page.getByText("Found 2 relevant passages in your knowledge base")).toBeVisible();
    await expect(page.getByText("e2e-handbook.pdf")).toBeVisible();
    await expect(page.getByText("Match: 100%")).toBeVisible();
    await expect(page.getByText("Match: 50%")).toBeVisible();
    expect(store.searches).toEqual([{ query: "visitors", tags: [], limit: 5 }]);
  });

  test("the highlight markup in a passage is rendered, not shown as text", async ({ page, mockApi }) => {
    installKnowledgeMocks(mockApi);
    const search = await openSearch(page);

    await search.search("visitors");

    await expect(page.locator("p strong", { hasText: "sign in" })).toBeVisible();
    await expect(page.getByText("<strong>")).toHaveCount(0);
  });

  test("tags are added with Enter, sent with the query and can be removed", async ({ page, mockApi }) => {
    const store = installKnowledgeMocks(mockApi);
    const search = await openSearch(page);

    await search.addTag("policy");
    await search.addTag("   ");
    await search.addTag("finance");
    await expect(search.tagRemoveButton("policy")).toBeVisible();
    await expect(search.tagRemoveButton("finance")).toBeVisible();
    await search.tagRemoveButton("finance").click();
    await expect(search.tagRemoveButton("finance")).toHaveCount(0);
    await expect(search.tagInput).toHaveValue("");

    await search.search("visitors");

    // Only the handbook carries the "policy" tag, so only its passage comes back.
    await expect(page.getByText("Found 1 relevant passages in your knowledge base")).toBeVisible();
    await expect(page.getByText("Match: 100%")).toBeVisible();
    await expect(page.getByText("Match: 50%")).toHaveCount(0);
    expect(store.searches).toEqual([{ query: "visitors", tags: ["policy"], limit: 5 }]);
  });

  test("a search with no hits shows no results and no message", async ({ page, mockApi }) => {
    const store = installKnowledgeMocks(mockApi);
    store.searchHits.length = 0;
    const search = await openSearch(page);

    await search.search("nothing matches");

    expect(store.searches).toHaveLength(1);
    await expect(search.searchButton).toBeEnabled();
    await expect(search.resultsHeading).toHaveCount(0);
    // Known bug: see US 8186 item 65. There is no "no results" feedback, the form just looks unchanged.
  });

  test("a new search replaces the previous results", async ({ page, mockApi }) => {
    const store = installKnowledgeMocks(mockApi);
    const search = await openSearch(page);

    await search.search("visitors");
    await expect(page.getByText("Found 2 relevant passages in your knowledge base")).toBeVisible();

    store.searchHits.splice(1);
    await search.search("visitors again");

    await expect(page.getByText("Found 1 relevant passages in your knowledge base")).toBeVisible();
    expect(store.searches.map((entry) => entry.query)).toEqual(["visitors", "visitors again"]);
  });

  test.describe("failure", () => {
    test.use({ allowedConsoleErrors: [FAILED_REQUEST_LOG] });

    test("an API error shows a toast with the raw response and no results", async ({ page, mockApi }) => {
      installKnowledgeMocks(mockApi);
      // The provider returns [] for no hits; a transport failure throws and HttpGlobalExceptionFilter answers 500 WKFLO0001.
      mockApi.on("POST", "/md/api/v1/tenant/knowledge/query", () => errorReply(500, ["", "WKFLO0001"]));
      const toast = new Toast(page);
      const search = await openSearch(page);

      await search.search("visitors");

      await toast.expectShown("Query failed");
      // Known bug: see US 8186 item 59. The description is the raw "{status}: {body}" text.
      await toast.expectShown(/500: \{"resultType":5,"errors":\[\{"code":"WKFLO0001","property":"\x22\}\]\}/);
      await expect(search.resultsHeading).toHaveCount(0);
      await expect(search.searchButton).toBeEnabled();
    });
  });
});
