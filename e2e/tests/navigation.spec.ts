import { test, expect } from "../support/test";
import { AppLayoutPage } from "../pages/app-layout.page";

const SIDEBAR_ITEMS = [
  { name: "Dashboard", path: "/", heading: "Dashboard", superPowerUserOnly: false },
  { name: "Agents", path: "/agents", heading: "Agents", superPowerUserOnly: false },
  { name: "Tools & Plugins", path: "/tools", heading: "Tools", superPowerUserOnly: false },
  { name: "AI Models", path: "/aimodels", heading: "AI Models", superPowerUserOnly: true },
  { name: "API Keys Vault", path: "/vault", heading: "Vault", superPowerUserOnly: true },
  { name: "Knowledge Base", path: "/knowledge", heading: "Knowledge Management", superPowerUserOnly: false },
  { name: "Tags", path: "/tags", heading: "Tags", superPowerUserOnly: true },
  { name: "Marketplace", path: "/marketplace/browse", heading: "Browse Marketplace", superPowerUserOnly: false },
  { name: "Manage Marketplace Agents", path: "/marketplace/manage-agents", heading: "Manage Marketplace Agents", superPowerUserOnly: true },
  { name: "Audit Log", path: "/audit", heading: "Audit Log", superPowerUserOnly: true },
] as const;

test.describe("super power user", () => {
  for (const item of SIDEBAR_ITEMS) {
    test(`sidebar "${item.name}" opens ${item.path}`, async ({ page }) => {
      const layout = new AppLayoutPage(page);
      await layout.goto("/settings/general");
      await layout.expectHeading("Settings");
      await layout.sidebarLink(item.name).click();
      await layout.expectPath(item.path);
      await layout.expectHeading(item.heading);
    });
  }

  test("sidebar Settings opens the settings page", async ({ page }) => {
    const layout = new AppLayoutPage(page);
    await layout.goto("/");
    await layout.expectHeading("Dashboard");
    await layout.settingsLink().click();
    await layout.expectPath("/settings/general");
    await layout.expectHeading("Settings");
  });

  test("clicking the logo returns to the dashboard", async ({ page }) => {
    const layout = new AppLayoutPage(page);
    await layout.goto("/agents");
    await layout.expectHeading("Agents");
    await page.getByRole("img", { name: "Wkflo Logo" }).click();
    await layout.expectPath("/");
    await layout.expectHeading("Dashboard");
  });
});

test.describe("standard user", () => {
  test.use({ isSuperPowerUser: false });

  test("only sees the sidebar items open to everyone", async ({ page }) => {
    const layout = new AppLayoutPage(page);
    await layout.goto("/");
    await layout.expectSignedIn();
    for (const item of SIDEBAR_ITEMS) {
      const link = layout.sidebarLink(item.name);
      if (item.superPowerUserOnly) {
        await expect(link).toHaveCount(0);
      } else {
        await expect(link).toBeVisible();
      }
    }
    await expect(layout.settingsLink()).toBeVisible();
  });
});
