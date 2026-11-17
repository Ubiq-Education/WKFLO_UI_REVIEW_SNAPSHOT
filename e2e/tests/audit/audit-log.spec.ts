import { expect, test } from "../../support/test";
import type { MockApi } from "../../support/mock-api";
import { AuditPage } from "../../pages/audit/audit.page";
import { serverError } from "../../support/mocks/ai-models";
import { createAuditFixtures, installAuditMocks } from "../../support/mocks/audit";

// The audit table formats timestamps with toLocaleString(): pin the locale and zone so the text is stable.
test.use({ locale: "en-US", timezoneId: "UTC" });

// The browser logs every non-2xx response as a console error; the error-path tests mock 400 / 500 on purpose.
const FAILED_REQUEST_LOG = /Failed to load resource: the server responded with a status of (400|500)/;

const AUDIT = "/md/api/v1/tenant/audit";

/** The query strings of the audit calls so far, oldest first. */
const auditCalls = (mockApi: MockApi) => mockApi.requestsTo("GET", AUDIT).map((request) => AuditPage.query(request.url));
const lastCall = (mockApi: MockApi) => auditCalls(mockApi).at(-1);

test.beforeEach(({ mockApi }) => installAuditMocks(mockApi));

test.describe("Audit log", () => {
  test("lists the newest entries first with the first page of the 25 per page", async ({ page, mockApi }) => {
    const audit = new AuditPage(page);
    await audit.goto();

    await expect(audit.bodyRows).toHaveCount(25);
    await expect(page.getByRole("columnheader")).toHaveText(["Timestamp", "Entity type", "Entity ID", "Action", "Actor", "Changes"]);
    // Entry 30 is the newest, entry 6 the oldest on page 1.
    await expect(audit.bodyRows.first()).toContainText("Agent");
    await expect(audit.bodyRows.last()).toContainText("Conversation");
    await expect(audit.pageIndicator).toHaveText("Page 1 of 2");
    expect(auditCalls(mockApi)).toHaveLength(1);
    expect(Object.fromEntries(lastCall(mockApi)!)).toEqual({ page: "1", pageSize: "25" });
  });

  test("a row shows its timestamp, entity, action badge and actor", async ({ page }) => {
    const audit = new AuditPage(page);
    await audit.goto();

    const row = audit.row("Agent", "1");
    await expect(row.getByRole("cell").nth(0)).toHaveText("1/30/2026, 12:00:00 PM");
    await expect(row.getByRole("cell").nth(3)).toHaveText("Update");
    await expect(row.getByRole("cell").nth(4)).toHaveText("E2E User");
    // No display name: the email stands in.
    await expect(audit.row("Tag", "1").getByRole("cell").nth(4)).toHaveText("e2e.second@example.test");
    await expect(audit.row("Secret", "3").getByRole("cell").nth(3)).toHaveText("Delete");
  });

  test("an entry without changes shows a dash and no View button", async ({ page }) => {
    const audit = new AuditPage(page);
    await audit.goto();

    await expect(audit.row("Tool", "7").getByRole("cell").nth(5)).toHaveText("—");
    await expect(audit.viewChanges("Tool", "7")).toHaveCount(0);
    await expect(audit.row("AIModel", "2").getByRole("cell").nth(5)).toContainText('{"IsActive":{"old":true,"new":false}}');
    await expect(audit.viewChanges("AIModel", "2")).toBeVisible();
  });

  test.describe("paging", () => {
    test("Next and Previous move between pages and ask the server for them", async ({ page, mockApi }) => {
      const audit = new AuditPage(page);
      await audit.gotoSettled();
      await expect(audit.previous).toHaveClass(/(^|\s)pointer-events-none(\s|$)/);

      await audit.next.click();

      await expect(audit.pageIndicator).toHaveText("Page 2 of 2");
      await expect(audit.bodyRows).toHaveCount(5);
      expect(lastCall(mockApi)!.get("page")).toBe("2");
      await expect(audit.next).toHaveClass(/(^|\s)pointer-events-none(\s|$)/);
      await expect(audit.previous).not.toHaveClass(/(^|\s)pointer-events-none(\s|$)/);
      // Entry 5 is a system write: no actor.
      await expect(audit.row("Conversation", "5").getByRole("cell").nth(4)).toHaveText("—");

      await audit.previous.click();

      await expect(audit.pageIndicator).toHaveText("Page 1 of 2");
      await expect(audit.bodyRows).toHaveCount(25);
      // Page 1 is already in React Query's cache: going back asks the server for nothing.
      expect(auditCalls(mockApi).map((call) => call.get("page"))).toEqual(["1", "2"]);
    });

    test("no pager is shown when everything fits on one page", async ({ page }) => {
      const audit = new AuditPage(page);
      await audit.goto();

      await audit.actionButton("Delete").click();

      await expect(audit.bodyRows).toHaveCount(1);
      await expect(audit.pageIndicator).toHaveCount(0);
      await expect(audit.next).toHaveCount(0);
    });

    test("a filter change goes back to page 1", async ({ page, mockApi }) => {
      const audit = new AuditPage(page);
      await audit.gotoSettled();
      await audit.next.click();
      await expect(audit.pageIndicator).toHaveText("Page 2 of 2");

      await audit.actionButton("Create").click();

      await expect(audit.pageIndicator).toHaveText("Page 1 of 2");
      expect(Object.fromEntries(lastCall(mockApi)!)).toEqual({ action: "Create", page: "1", pageSize: "25" });
    });

    test("a page past the end is clamped back to the last page instead of showing an empty list", async ({ page, mockApi }) => {
      // 60 entries make three pages. The 30 oldest age out while the user is on page 2.
      const older = Array.from({ length: 30 }, (_, index) => ({
        ...createAuditFixtures()[0],
        id: 100 + index,
        entityId: String(100 + index),
        timestamp: new Date(Date.UTC(2025, 11, 1 + index, 12, 0, 0)).toISOString(),
      }));
      const entries = installAuditMocks(mockApi, { entries: [...createAuditFixtures(), ...older] });
      const audit = new AuditPage(page);
      await audit.gotoSettled();
      await expect(audit.pageIndicator).toHaveText("Page 1 of 3");
      await audit.next.click();
      await expect(audit.pageIndicator).toHaveText("Page 2 of 3");
      entries.length = 30;

      await audit.next.click();

      // Page 3 no longer exists: the server answers with no items and two pages.
      await expect.poll(() => auditCalls(mockApi).map((call) => call.get("page"))).toEqual(["1", "2", "3"]);
      // The clamp lands on page 2, which React Query still has, so the user is not left on an empty list.
      // Current behaviour, pinned: that page 2 is stale cached data (staleTime is Infinity), so it still says "of 3"
      // and shows 25 rows although the server now has two pages and only 5 entries on page 2.
      await expect(audit.pageIndicator).toHaveText("Page 2 of 3");
      await expect(audit.bodyRows).toHaveCount(25);
      await expect(audit.emptyHeading).toHaveCount(0);
    });
  });

  test.describe("entity type filter", () => {
    test("choosing an entity type filters the list and shows the choice", async ({ page, mockApi }) => {
      const audit = new AuditPage(page);
      await audit.goto();
      await expect(audit.entityCombobox).toHaveText("All entity types");

      await audit.chooseEntityType("AIModel");

      await expect(audit.entityCombobox).toHaveText("AIModel");
      await expect(audit.bodyRows).toHaveCount(1);
      await expect(audit.row("AIModel", "2")).toBeVisible();
      expect(Object.fromEntries(lastCall(mockApi)!)).toEqual({ entityType: "AIModel", page: "1", pageSize: "25" });
    });

    test("the list can be searched, and says when nothing matches", async ({ page }) => {
      const audit = new AuditPage(page);
      await audit.goto();
      await audit.entityCombobox.click();

      await page.getByPlaceholder("Search entity types...").fill("Secr");
      await expect(page.getByRole("option")).toHaveText(["Secret"]);

      await page.getByPlaceholder("Search entity types...").fill("zzz");
      await expect(page.getByText("No entity types found.")).toBeVisible();
    });

    test("All entity types removes the filter again", async ({ page, mockApi }) => {
      const audit = new AuditPage(page);
      await audit.goto();
      await audit.chooseEntityType("Tag");
      await expect(audit.bodyRows).toHaveCount(1);

      await audit.chooseEntityType("All entity types");

      // The unfiltered list is served from React Query's cache.
      await expect(audit.bodyRows).toHaveCount(25);
      expect(auditCalls(mockApi).map((call) => call.get("entityType"))).toEqual([null, "Tag"]);
    });
  });

  test.describe("action filter", () => {
    test("each action button filters by that action and All actions resets", async ({ page, mockApi }) => {
      const audit = new AuditPage(page);
      await audit.goto();

      await audit.actionButton("Update").click();
      await expect(audit.bodyRows).toHaveCount(2);
      await expect(audit.row("Agent", "1")).toBeVisible();
      await expect(audit.row("AIModel", "2")).toBeVisible();
      expect(lastCall(mockApi)!.get("action")).toBe("Update");

      await audit.actionButton("Delete").click();
      await expect(audit.bodyRows).toHaveCount(1);
      await expect(audit.row("Secret", "3")).toBeVisible();
      expect(lastCall(mockApi)!.get("action")).toBe("Delete");

      await audit.actionButton("All actions").click();
      // Back to the unfiltered key, which React Query already has: no new request, the first page of 25 again.
      await expect(audit.bodyRows).toHaveCount(25);
      expect(auditCalls(mockApi).map((call) => call.get("action"))).toEqual([null, "Update", "Delete"]);
    });

    test("the active button is highlighted", async ({ page }) => {
      const audit = new AuditPage(page);
      await audit.goto();
      await expect(audit.actionButton("All actions")).toHaveClass(/(^|\s)bg-accent(\s|$)/);
      await expect(audit.actionButton("Create")).not.toHaveClass(/(^|\s)bg-accent(\s|$)/);

      await audit.actionButton("Create").click();

      await expect(audit.actionButton("Create")).toHaveClass(/(^|\s)bg-accent(\s|$)/);
      await expect(audit.actionButton("All actions")).not.toHaveClass(/(^|\s)bg-accent(\s|$)/);
    });
  });

  test.describe("actor filter", () => {
    test("waits for typing to settle for 400 ms before asking the server", async ({ page, mockApi }) => {
      await page.clock.install({ time: new Date("2026-03-01T10:00:00Z") });
      const audit = new AuditPage(page);
      await audit.goto();
      await expect(audit.bodyRows).toHaveCount(25);
      // From here time only moves when the test says so.
      await page.clock.pauseAt(new Date("2026-03-01T10:01:00Z"));
      const callsBefore = auditCalls(mockApi).length;

      await audit.actorInput.pressSequentially("e2e a");
      await page.clock.runFor(300);
      await audit.actorInput.pressSequentially("dmin");
      // 399 ms after the last keystroke: the second burst restarted the timer, so it has not fired yet.
      await page.clock.runFor(399);
      // Give the page a real task turn (the fake clock does not patch MessageChannel), so a request that wrongly
      // started would have reached the mock before the check below.
      await page.evaluate(
        () =>
          new Promise<void>((resolve) => {
            const channel = new MessageChannel();
            channel.port1.onmessage = () => resolve();
            channel.port2.postMessage(0);
          }),
      );
      expect(auditCalls(mockApi)).toHaveLength(callsBefore);
      await expect(audit.bodyRows).toHaveCount(25);

      await page.clock.runFor(1);
      await page.clock.resume();

      await expect.poll(() => auditCalls(mockApi).length).toBe(callsBefore + 1);
      expect(Object.fromEntries(lastCall(mockApi)!)).toEqual({ actor: "e2e admin", page: "1", pageSize: "25" });
      await expect(audit.bodyRows).toHaveCount(3);
    });

    test("matches a name or an email without regard to case, and a user id exactly", async ({ page, mockApi }) => {
      const audit = new AuditPage(page);
      await audit.goto();

      await audit.actorInput.fill("E2E.SECOND@EXAMPLE");
      await expect(audit.bodyRows).toHaveCount(1);
      await expect(audit.row("Tag", "1")).toBeVisible();

      await audit.actorInput.fill("e2e-actor-user");
      await expect(audit.bodyRows).toHaveCount(1);
      await expect(audit.row("Agent", "1")).toBeVisible();
      expect(lastCall(mockApi)!.get("actor")).toBe("e2e-actor-user");

      // A user id is an exact match only.
      await audit.actorInput.fill("e2e-actor-us");
      await expect(audit.emptyHeading).toBeVisible();
    });

    test("the actor is trimmed and a blank actor is not sent", async ({ page, mockApi }) => {
      const audit = new AuditPage(page);
      await audit.goto();

      await audit.actorInput.fill("  E2E User  ");
      await expect(audit.bodyRows).toHaveCount(1);
      expect(lastCall(mockApi)!.get("actor")).toBe("E2E User");

      await audit.actorInput.fill("   ");
      await expect(audit.bodyRows).toHaveCount(25);
      // Nothing was requested for the blank actor.
      expect(auditCalls(mockApi).map((call) => call.get("actor"))).toEqual([null, "E2E User"]);
      await expect(audit.clearFilters).toHaveCount(0);
    });
  });

  test.describe("date filter", () => {
    test("From and To are inclusive and To covers the whole day", async ({ page, mockApi }) => {
      const audit = new AuditPage(page);
      await audit.goto();

      await audit.dateFrom.fill("2026-01-28");
      await expect(audit.bodyRows).toHaveCount(3);
      expect(lastCall(mockApi)!.get("dateFrom")).toBe("2026-01-28");

      await audit.dateTo.fill("2026-01-29");
      // Entry 29 is stamped 12:00 on the 29th: inside the To day.
      await expect(audit.bodyRows).toHaveCount(2);
      await expect(audit.row("Secret", "3")).toBeVisible();
      await expect(audit.row("Tag", "1")).toBeVisible();
      expect(Object.fromEntries(lastCall(mockApi)!)).toEqual({ dateFrom: "2026-01-28", dateTo: "2026-01-29", page: "1", pageSize: "25" });
    });

    test("a To date alone keeps everything up to the end of that day", async ({ page }) => {
      const audit = new AuditPage(page);
      await audit.goto();

      await audit.dateTo.fill("2026-01-02");

      await expect(audit.bodyRows).toHaveCount(2);
      await expect(audit.row("Conversation", "1")).toBeVisible();
      await expect(audit.row("Conversation", "2")).toBeVisible();
    });

    test.describe("From after To", () => {
      test.use({ allowedConsoleErrors: [FAILED_REQUEST_LOG] });

      test("the server rejects the range and the raw error is shown", async ({ page }) => {
        const audit = new AuditPage(page);
        await audit.goto();

        await audit.dateFrom.fill("2026-01-20");
        await audit.dateTo.fill("2026-01-10");

        await expect(audit.errorAlert).toContainText("Failed to load audit log");
        await expect(audit.errorAlert).toContainText(/400: .*DateFrom must be less than or equal to DateTo\./);
        await expect(audit.bodyRows).toHaveCount(0);
      });
    });
  });

  test.describe("clear filters", () => {
    test("is only offered while a filter is active", async ({ page }) => {
      const audit = new AuditPage(page);
      await audit.goto();
      await expect(audit.clearFilters).toHaveCount(0);

      await audit.dateFrom.fill("2026-01-28");

      await expect(audit.clearFilters).toBeVisible();
    });

    test("resets every filter, the inputs and the request", async ({ page, mockApi }) => {
      const audit = new AuditPage(page);
      await audit.goto();
      await audit.chooseEntityType("Tag");
      await audit.actionButton("Create").click();
      await audit.actorInput.fill("second");
      await audit.dateFrom.fill("2026-01-01");
      await audit.dateTo.fill("2026-01-31");
      await expect(audit.bodyRows).toHaveCount(1);
      await expect.poll(() => lastCall(mockApi)!.get("actor")).toBe("second");

      await audit.clearFilters.click();

      await expect(audit.bodyRows).toHaveCount(25);
      await expect(audit.entityCombobox).toHaveText("All entity types");
      await expect(audit.actorInput).toHaveValue("");
      await expect(audit.dateFrom).toHaveValue("");
      await expect(audit.dateTo).toHaveValue("");
      await expect(audit.actionButton("All actions")).toHaveClass(/(^|\s)bg-accent(\s|$)/);
      await expect(audit.clearFilters).toHaveCount(0);
      // The unfiltered query is in React Query's cache from the first load: it was requested exactly once.
      expect(auditCalls(mockApi).filter((call) => call.size === 2)).toHaveLength(1);
    });
  });

  test.describe("empty list", () => {
    test("filters that match nothing suggest adjusting them", async ({ page }) => {
      const audit = new AuditPage(page);
      await audit.goto();

      await audit.chooseEntityType("Tag");
      await audit.actionButton("Delete").click();

      await expect(audit.emptyHeading).toBeVisible();
      await expect(page.getByText("Try adjusting your filters.")).toBeVisible();
      await expect(audit.bodyRows).toHaveCount(0);
    });

    test("an empty log without filters says how entries appear", async ({ page, mockApi }) => {
      installAuditMocks(mockApi, { entries: [] });
      const audit = new AuditPage(page);
      await audit.goto();

      await expect(audit.emptyHeading).toBeVisible();
      await expect(page.getByText("Create, update, or delete a Master Data record to see it appear here.")).toBeVisible();
    });
  });

  test.describe("errors", () => {
    test.use({ allowedConsoleErrors: [FAILED_REQUEST_LOG] });

    test("a failing request shows the error, and Retry loads the list", async ({ page, mockApi }) => {
      mockApi.on("GET", AUDIT, () => serverError());
      const audit = new AuditPage(page);
      await audit.goto();

      await expect(audit.errorAlert).toContainText("Failed to load audit log");
      await expect(audit.errorAlert).toContainText(/500: .*"code":"WKFLO0001"/);
      await expect(audit.bodyRows).toHaveCount(0);

      // Registered later, so it wins over the failing handler.
      installAuditMocks(mockApi);
      await audit.retryButton.click();

      await expect(audit.bodyRows).toHaveCount(25);
      await expect(audit.errorAlert).toHaveCount(0);
      expect(auditCalls(mockApi)).toHaveLength(2);
    });
  });
});

test.describe("Audit changes dialog", () => {
  test.use({ clipboardPermission: true });

  test("shows valid JSON pretty-printed with the entry in the description", async ({ page }) => {
    const audit = new AuditPage(page);
    await audit.goto();

    await audit.viewChanges("Agent", "1").click();

    await expect(audit.changesDialog).toBeVisible();
    await expect(audit.changesDialog).toContainText("Agent 1 - Update");
    await expect(audit.changesDialog.getByLabel("Changes content")).toHaveText(
      '{\n  "Name": {\n    "old": "E2E Agent",\n    "new": "E2E Agent Renamed"\n  }\n}',
    );
    await expect(audit.changesDialog.getByText("This content is not valid JSON, so it is shown as-is.")).toHaveCount(0);
  });

  test("text that is not JSON is shown as it is, with a note", async ({ page }) => {
    const audit = new AuditPage(page);
    await audit.goto();

    await audit.viewChanges("Secret", "3").click();

    await expect(audit.changesDialog.getByText("This content is not valid JSON, so it is shown as-is.")).toBeVisible();
    await expect(audit.changesDialog.getByLabel("Changes content")).toHaveText("{broken");
    await expect(audit.changesDialog).toContainText("Secret 3 - Delete");
  });

  test("Copy puts the formatted text on the clipboard and says so", async ({ page }) => {
    const audit = new AuditPage(page);
    await audit.goto();
    await audit.viewChanges("AIModel", "2").click();

    await audit.changesDialog.getByRole("button", { name: "Copy" }).click();

    await expect(page.locator('li[role="status"]').filter({ hasText: "Copied to clipboard" })).toBeVisible();
    // The OS clipboard may turn line feeds into CRLF.
    expect((await page.evaluate(() => navigator.clipboard.readText())).replaceAll("\r\n", "\n")).toBe('{\n  "IsActive": {\n    "old": true,\n    "new": false\n  }\n}');
  });

  test("a clipboard that refuses shows a failure toast", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", { value: { writeText: () => Promise.reject(new Error("denied")) }, configurable: true });
    });
    const audit = new AuditPage(page);
    await audit.goto();
    await audit.viewChanges("AIModel", "2").click();

    await audit.changesDialog.getByRole("button", { name: "Copy" }).click();

    await expect(page.locator('li[role="status"]').filter({ hasText: "Could not copy to clipboard" })).toBeVisible();
    await expect(page.locator('li[role="status"]').filter({ hasText: /^Copied to clipboard/ })).toHaveCount(0);
  });

  test("closes with Escape and opens another entry afterwards", async ({ page }) => {
    const audit = new AuditPage(page);
    await audit.goto();
    await audit.viewChanges("Agent", "1").click();
    await expect(audit.changesDialog).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(audit.changesDialog).toBeHidden();
    await audit.viewChanges("Secret", "3").click();

    await expect(audit.changesDialog).toContainText("Secret 3 - Delete");
  });
});

test.describe("Audit access", () => {
  test.use({ isSuperPowerUser: false });

  test("a standard user is redirected away without the log being requested", async ({ page, mockApi }) => {
    await page.goto("/audit");

    await expect(page).toHaveURL((url) => url.pathname === "/");
    await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
    expect(auditCalls(mockApi)).toHaveLength(0);
  });
});
