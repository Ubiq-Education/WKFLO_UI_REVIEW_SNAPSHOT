import { test, expect } from "../support/test";
import { APP_ROUTES } from "../support/routes";
import { AppLayoutPage } from "../pages/app-layout.page";

test.describe("page loads (super power user)", () => {
  for (const route of APP_ROUTES) {
    test(`${route.path} shows "${route.heading}"`, async ({ page }) => {
      const layout = new AppLayoutPage(page);
      await layout.goto(route.path);
      await layout.expectHeading(route.heading);
      await layout.expectPath(route.path);
    });
  }

  test("the layout shows the signed-in user and the selected tenant", async ({ page }) => {
    const layout = new AppLayoutPage(page);
    await layout.goto("/");
    await layout.expectSignedIn();
    await expect(layout.tenantSelector).toContainText("E2E Tenant A");
  });
});
