import { readFile } from "node:fs/promises";
import { expect, test } from "../../support/test";
import { TENANT_A } from "../../support/fixtures";
import { KnowledgePage } from "../../pages/knowledge/knowledge.page";
import { DocumentUploaderPage } from "../../pages/knowledge/document-uploader.page";
import { Toast } from "../../pages/components/toast";
import { DOC_IDS, errorReply, installKnowledgeMocks } from "../../support/mocks/knowledge";

// The browser logs every non-2xx response as a console error; the error-path tests mock these statuses on purpose.
const FAILED_REQUEST_LOG = /Failed to load resource: the server responded with a status of (400|404|500)/;

const HANDBOOK = "e2e-handbook.pdf";
const FAQ = "e2e-faq.txt";
const BUDGET = "e2e-budget.xlsx";

test.describe("Knowledge: document library", () => {
  test("lists a card per document with its type badge and tags", async ({ page, mockApi }) => {
    installKnowledgeMocks(mockApi);
    const knowledge = new KnowledgePage(page);
    await knowledge.goto();

    for (const name of [HANDBOOK, FAQ, BUDGET]) await expect(knowledge.cardHeading(name)).toBeVisible();
    await expect(knowledge.card(HANDBOOK)).toContainText("PDF");
    await expect(knowledge.card(FAQ)).toContainText("TXT");
    await expect(knowledge.card(BUDGET)).toContainText("XLSX");

    await expect(knowledge.tagRemoveButton(HANDBOOK, "policy")).toBeVisible();
    await expect(knowledge.tagRemoveButton(BUDGET, "finance")).toBeVisible();
    await expect(knowledge.tagRemoveButton(BUDGET, "2026")).toBeVisible();
    // A document without tags (null from the API) shows the placeholder chip.
    await expect(knowledge.card(FAQ)).toContainText("No Tags");
    await expect(knowledge.card(HANDBOOK)).not.toContainText("No Tags");
  });

  test("Download appears only for documents that have a stored file", async ({ page, mockApi }) => {
    installKnowledgeMocks(mockApi);
    const knowledge = new KnowledgePage(page);
    await knowledge.goto();

    await expect(knowledge.downloadButton(HANDBOOK)).toBeVisible();
    await expect(knowledge.downloadButton(BUDGET)).toBeVisible();
    await expect(knowledge.card(FAQ)).toBeVisible();
    await expect(knowledge.downloadButton(FAQ)).toHaveCount(0);
  });

  test("the three tabs switch the panel, and the library buttons open the uploader", async ({ page, mockApi }) => {
    installKnowledgeMocks(mockApi);
    const knowledge = new KnowledgePage(page);
    await knowledge.goto();

    await expect(knowledge.libraryTab).toHaveAttribute("aria-selected", "true");
    await knowledge.searchTab.click();
    await expect(knowledge.searchTab).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText("Search Knowledge Base")).toBeVisible();
    await expect(knowledge.cardHeading(HANDBOOK)).toHaveCount(0);

    await knowledge.uploaderTab.click();
    await expect(page.getByLabel("Document drop zone")).toBeVisible();

    await knowledge.libraryTab.click();
    await expect(knowledge.cardHeading(HANDBOOK)).toBeVisible();
    await page.getByRole("button", { name: "View Upload Options" }).click();
    await expect(knowledge.uploaderTab).toHaveAttribute("aria-selected", "true");
    await expect(new DocumentUploaderPage(page).dropZone).toBeVisible();
  });

  test("shows an empty state whose button opens the uploader", async ({ page, mockApi }) => {
    installKnowledgeMocks(mockApi, { documents: [] });
    const knowledge = new KnowledgePage(page);
    await knowledge.goto();

    await expect(knowledge.emptyMessage).toBeVisible();
    await page.getByRole("button", { name: "Go to Upload Section" }).click();
    await expect(knowledge.uploaderTab).toHaveAttribute("aria-selected", "true");
    await expect(knowledge.emptyMessage).toHaveCount(0);
  });

  test.describe("load error", () => {
    test.use({ allowedConsoleErrors: [FAILED_REQUEST_LOG] });

    test("an API failure shows the error alert instead of the list", async ({ page, mockApi }) => {
      installKnowledgeMocks(mockApi);
      mockApi.on("GET", "/md/api/v1/tenant/knowledge", () => errorReply(500, ["", "WKFLO0001"]));
      const knowledge = new KnowledgePage(page);
      await knowledge.goto();

      await expect(knowledge.loadError).toBeVisible();
      await expect(knowledge.cardHeading(HANDBOOK)).toHaveCount(0);
      // Known bug: see US 8186 item 58. A failed list is also reported as an empty library.
      await expect(knowledge.emptyMessage).toBeVisible();
    });
  });

  test.describe("download", () => {
    test("saves the file under the document's name with the bytes the API sent", async ({ page, mockApi }) => {
      const store = installKnowledgeMocks(mockApi);
      const knowledge = new KnowledgePage(page);
      await knowledge.goto();

      const downloadPromise = page.waitForEvent("download");
      await knowledge.downloadButton(HANDBOOK).click();
      const download = await downloadPromise;

      expect(download.suggestedFilename()).toBe(HANDBOOK);
      expect(await readFile(await download.path(), "utf8")).toBe("E2E handbook fake content");
      expect(store.downloads).toHaveLength(1);
      expect(store.downloads[0].id).toBe(DOC_IDS.handbook);
      expect(store.downloads[0].authorization).toMatch(/^Bearer .+/);
      expect(store.downloads[0].tenantGuid).toBe(TENANT_A.guid);
    });

    test.describe("failure", () => {
      test.use({ allowedConsoleErrors: [FAILED_REQUEST_LOG] });

      test("a failed download shows the friendly toast and saves nothing", async ({ page, mockApi }) => {
        installKnowledgeMocks(mockApi);
        const toast = new Toast(page);
        const knowledge = new KnowledgePage(page);
        await knowledge.goto();
        // The document disappears between the list and the click (another tab deleted it).
        mockApi.on("GET", "/md/api/v1/tenant/knowledge/download/:id", () => errorReply(404, ["Document", "Document with ID x not found"]));

        let downloaded = false;
        page.on("download", () => (downloaded = true));
        const response = page.waitForResponse((r) => r.url().includes("/knowledge/download/"));
        await knowledge.downloadButton(HANDBOOK).click();
        await response;

        await toast.expectShown("Download failed");
        expect(downloaded).toBe(false);
      });
    });
  });

  test.describe("delete", () => {
    test("confirming deletes the document, shows a toast and removes the card", async ({ page, mockApi }) => {
      installKnowledgeMocks(mockApi);
      const toast = new Toast(page);
      const knowledge = new KnowledgePage(page);
      await knowledge.goto();

      await knowledge.deleteButton(FAQ).click();
      await knowledge.deleteDialog.expectVisible();
      await knowledge.deleteDialog.expectText("permanently delete the document");
      await knowledge.deleteDialog.confirm("Delete");

      await toast.expectShown("Document deleted");
      await expect(knowledge.cardHeading(FAQ)).toHaveCount(0);
      await expect(knowledge.cardHeading(HANDBOOK)).toBeVisible();
      expect(mockApi.requestsTo("DELETE", "/md/api/v1/tenant/knowledge/:id").map((request) => request.path)).toEqual([
        `/md/api/v1/tenant/knowledge/${DOC_IDS.faq}`,
      ]);
    });

    test("cancelling closes the dialog and keeps the document", async ({ page, mockApi }) => {
      installKnowledgeMocks(mockApi);
      const knowledge = new KnowledgePage(page);
      await knowledge.goto();

      await knowledge.deleteButton(FAQ).click();
      await knowledge.deleteDialog.cancel();

      await knowledge.deleteDialog.expectClosed();
      await expect(knowledge.cardHeading(FAQ)).toBeVisible();
      expect(mockApi.requestsTo("DELETE", "/md/api/v1/tenant/knowledge/:id")).toHaveLength(0);
    });

    test("deleting the last document leaves the empty state", async ({ page, mockApi }) => {
      installKnowledgeMocks(mockApi, {
        documents: [{ id: DOC_IDS.faq, fileName: FAQ, contentType: "text/plain", tags: [], blobUrl: null, description: null, timestamp: "2026-01-15T09:00:00Z" }],
      });
      const knowledge = new KnowledgePage(page);
      await knowledge.goto();

      await knowledge.deleteButton(FAQ).click();
      await knowledge.deleteDialog.confirm("Delete");

      await expect(knowledge.emptyMessage).toBeVisible();
    });

    test.describe("failure", () => {
      test.use({ allowedConsoleErrors: [FAILED_REQUEST_LOG] });

      test("an unknown document shows a failure toast with the raw response and keeps the card", async ({ page, mockApi }) => {
        const store = installKnowledgeMocks(mockApi);
        const toast = new Toast(page);
        const knowledge = new KnowledgePage(page);
        await knowledge.goto();
        await expect(knowledge.cardHeading(FAQ)).toBeVisible();
        // Another session deleted the document first: the DELETE validator answers WKFLOMD0702.
        store.documents.splice(store.documents.findIndex((doc) => doc.id === DOC_IDS.faq), 1);

        await knowledge.deleteButton(FAQ).click();
        await knowledge.deleteDialog.confirm("Delete");

        await toast.expectShown("Delete failed");
        // Known bug: see US 8186 item 59. The description is the raw "{status}: {body}" text, not a friendly message.
        await toast.expectShown(/400: \{"resultType":2,"errors":\[\{"code":"WKFLOMD0702","property":"Knowledge"\}\]\}/);
        await expect(knowledge.cardHeading(FAQ)).toBeVisible();
      });
    });
  });

  test.describe("per-document tags", () => {
    test("pressing Enter adds the trimmed tag, saves the full list and clears the input", async ({ page, mockApi }) => {
      const store = installKnowledgeMocks(mockApi);
      const toast = new Toast(page);
      const knowledge = new KnowledgePage(page);
      await knowledge.goto();

      await knowledge.addTag(HANDBOOK, "  hr  ");

      await expect(knowledge.tagRemoveButton(HANDBOOK, "hr")).toBeVisible();
      await expect(knowledge.tagInput(HANDBOOK)).toHaveValue("");
      await toast.expectShown("Tags updated");
      expect(store.tagUpdates).toEqual([{ id: DOC_IDS.handbook, tags: ["policy", "hr"] }]);
      expect(mockApi.requestsTo("PUT", "/md/api/v1/tenant/knowledge/:id/tags").map((request) => request.path)).toEqual([
        `/md/api/v1/tenant/knowledge/${DOC_IDS.handbook}/tags`,
      ]);
    });

    test("adding the first tag replaces the No Tags chip", async ({ page, mockApi }) => {
      const store = installKnowledgeMocks(mockApi);
      const knowledge = new KnowledgePage(page);
      await knowledge.goto();

      await knowledge.addTag(FAQ, "faq");

      await expect(knowledge.tagRemoveButton(FAQ, "faq")).toBeVisible();
      await expect(knowledge.card(FAQ)).not.toContainText("No Tags");
      expect(store.tagUpdates).toEqual([{ id: DOC_IDS.faq, tags: ["faq"] }]);
    });

    test("a blank tag is ignored and sends nothing", async ({ page, mockApi }) => {
      const store = installKnowledgeMocks(mockApi);
      const knowledge = new KnowledgePage(page);
      await knowledge.goto();

      await knowledge.addTag(HANDBOOK, "   ");
      // A real tag afterwards proves the first Enter was handled (and ignored) before we look at the requests.
      await knowledge.addTag(HANDBOOK, "after");
      await expect(knowledge.tagRemoveButton(HANDBOOK, "after")).toBeVisible();

      expect(store.tagUpdates).toEqual([{ id: DOC_IDS.handbook, tags: ["policy", "after"] }]);
    });

    test("removing a tag saves the remaining list and the change survives a reload", async ({ page, mockApi }) => {
      const store = installKnowledgeMocks(mockApi);
      const toast = new Toast(page);
      const knowledge = new KnowledgePage(page);
      await knowledge.goto();

      await knowledge.tagRemoveButton(BUDGET, "finance").click();

      await toast.expectShown("Tags updated");
      await expect(knowledge.tagRemoveButton(BUDGET, "finance")).toHaveCount(0);
      await expect(knowledge.tagRemoveButton(BUDGET, "2026")).toBeVisible();
      expect(store.tagUpdates).toEqual([{ id: DOC_IDS.budget, tags: ["2026"] }]);

      await page.reload();
      await expect(knowledge.cardHeading(BUDGET)).toBeVisible();
      await expect(knowledge.tagRemoveButton(BUDGET, "2026")).toBeVisible();
      await expect(knowledge.tagRemoveButton(BUDGET, "finance")).toHaveCount(0);
    });

    test("removing the last tag brings back the No Tags chip", async ({ page, mockApi }) => {
      const store = installKnowledgeMocks(mockApi);
      const knowledge = new KnowledgePage(page);
      await knowledge.goto();

      await knowledge.tagRemoveButton(HANDBOOK, "policy").click();

      await expect(knowledge.card(HANDBOOK)).toContainText("No Tags");
      expect(store.tagUpdates).toEqual([{ id: DOC_IDS.handbook, tags: [] }]);
    });

    test("a duplicate tag is added twice", async ({ page, mockApi }) => {
      const store = installKnowledgeMocks(mockApi);
      const knowledge = new KnowledgePage(page);
      await knowledge.goto();

      await knowledge.addTag(HANDBOOK, "policy");

      // Known bug: see US 8186 item 60. The page never de-duplicates, so the same tag is saved twice.
      await expect(knowledge.tagRemoveButton(HANDBOOK, "policy")).toHaveCount(2);
      expect(store.tagUpdates).toEqual([{ id: DOC_IDS.handbook, tags: ["policy", "policy"] }]);
    });

    test.describe("failure", () => {
      test.use({ allowedConsoleErrors: [FAILED_REQUEST_LOG] });

      test("a failed save shows a toast with the raw response but keeps the unsaved tag on screen", async ({ page, mockApi }) => {
        installKnowledgeMocks(mockApi);
        mockApi.on("PUT", "/md/api/v1/tenant/knowledge/:id/tags", () => errorReply(500, ["Tags", "Failed to update document tags"]));
        const toast = new Toast(page);
        const knowledge = new KnowledgePage(page);
        await knowledge.goto();

        const response = page.waitForResponse((r) => r.url().endsWith("/tags") && r.request().method() === "PUT");
        await knowledge.addTag(HANDBOOK, "hr");
        await response;

        await toast.expectShown("Tag update failed");
        // Known bug: see US 8186 item 59. The description is the raw "{status}: {body}" text.
        await toast.expectShown(/500: \{"resultType":5,"errors":\[\{"code":"Failed to update document tags","property":"Tags"\}\]\}/);
        // Known bug: see US 8186 item 61. The tag is added optimistically and never rolled back on failure.
        await expect(knowledge.tagRemoveButton(HANDBOOK, "hr")).toBeVisible();

        await page.reload();
        await expect(knowledge.cardHeading(HANDBOOK)).toBeVisible();
        await expect(knowledge.tagRemoveButton(HANDBOOK, "policy")).toBeVisible();
        await expect(knowledge.tagRemoveButton(HANDBOOK, "hr")).toHaveCount(0);
      });
    });
  });

  test.describe("standard user", () => {
    test.use({ isSuperPowerUser: false });

    test("can open the library (the page is not super-power-user only)", async ({ page, mockApi }) => {
      installKnowledgeMocks(mockApi);
      const knowledge = new KnowledgePage(page);
      await knowledge.goto();

      await expect(page).toHaveURL((url) => url.pathname === "/knowledge");
      await expect(knowledge.cardHeading(HANDBOOK)).toBeVisible();
    });
  });
});
