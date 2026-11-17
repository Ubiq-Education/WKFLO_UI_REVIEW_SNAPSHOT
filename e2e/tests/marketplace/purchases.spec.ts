import { expect, test } from "../../support/test";
import { AppLayoutPage } from "../../pages/app-layout.page";
import { installMarketplaceMocks } from "../../support/mocks/marketplace";

test.beforeEach(({ mockApi }) => {
  installMarketplaceMocks(mockApi);
});

test.describe("marketplace landing", () => {
  test("the Browse card opens the catalog", async ({ page }) => {
    const layout = new AppLayoutPage(page);
    await layout.goto("/marketplace");
    await expect(page.getByRole("heading", { level: 1, name: "Marketplace" })).toBeVisible();

    await page.getByText("Explore and discover new tools, plugins, and extensions").click();

    await layout.expectPath("/marketplace/browse");
    await layout.expectHeading("Browse Marketplace");
  });

  test("the Open button on the Purchases card opens My Purchases", async ({ page }) => {
    const layout = new AppLayoutPage(page);
    await layout.goto("/marketplace");

    const purchasesCard = page.locator("div.rounded-lg.border").filter({ has: page.getByText("My Purchases", { exact: true }) });
    await purchasesCard.getByRole("button", { name: "Open" }).click();

    await layout.expectPath("/marketplace/purchases");
    await layout.expectHeading("My Purchases");
  });
});

// The page renders hard-coded sample data (client/src/pages/marketplace/purchases.tsx); it makes no API call.
test.describe("my purchases", () => {
  // Known bug: see US 8186 item 80 (purchases.tsx renders hard-coded sample purchases and subscriptions for every user;
  // the buttons do nothing). These tests pin the sample data.
  test("shows the one-time purchases", async ({ page }) => {
    const layout = new AppLayoutPage(page);
    await layout.goto("/marketplace/purchases");
    await layout.expectHeading("My Purchases");

    await expect(page.getByText("Email Automation Tool", { exact: true })).toBeVisible();
    await expect(page.getByText("Data Analytics Plugin", { exact: true })).toBeVisible();
    await expect(page.getByText("$29.99")).toBeVisible();
    await expect(page.getByRole("button", { name: "Re-download" })).toHaveCount(2);
  });

  test("the Subscriptions tab shows the subscription", async ({ page }) => {
    const layout = new AppLayoutPage(page);
    await layout.goto("/marketplace/purchases");
    await layout.expectHeading("My Purchases");

    await page.getByRole("tab", { name: "Subscriptions" }).click();

    await expect(page.getByText("Premium Analytics Suite", { exact: true })).toBeVisible();
    await expect(page.getByText("$19.99/month")).toBeVisible();
    await expect(page.getByText("Priority Support")).toBeVisible();
    await expect(page.getByText("Email Automation Tool")).toBeHidden();
  });

  test("the back button returns to the marketplace landing page", async ({ page }) => {
    const layout = new AppLayoutPage(page);
    await layout.goto("/marketplace/purchases");

    await page.getByRole("button", { name: "Back to marketplace" }).click();

    await layout.expectPath("/marketplace");
    await layout.expectHeading("Marketplace");
  });
});
