import { test, expect } from "../support/test";
import { APP_ROUTES, GUARD_REDIRECTS } from "../support/routes";
import { AppLayoutPage } from "../pages/app-layout.page";

test.describe("signed out", () => {
  test.use({ signedIn: false });

  for (const path of ["/", "/agents", "/tags", "/settings/general"]) {
    test(`${path} redirects to /login`, async ({ page }) => {
      const layout = new AppLayoutPage(page);
      await layout.goto(path);
      await layout.expectPath("/login");
      await layout.expectHeading("Login");
    });
  }

  test("logging in lands on the dashboard", async ({ page }) => {
    const layout = new AppLayoutPage(page);
    await layout.goto("/login");
    await page.getByRole("button", { name: "Log in with Azure" }).click();
    await layout.expectPath("/");
    await layout.expectHeading("Dashboard");
    await layout.expectSignedIn();
  });
});

test.describe("signed in", () => {
  test("/login redirects to the dashboard", async ({ page }) => {
    const layout = new AppLayoutPage(page);
    await layout.goto("/login");
    await layout.expectPath("/");
    await layout.expectHeading("Dashboard");
  });

  test("/settings redirects to its default section", async ({ page }) => {
    const layout = new AppLayoutPage(page);
    await layout.goto("/settings");
    await layout.expectPath("/settings/general");
    await layout.expectHeading("Settings");
  });

  test("/workflows is hidden and redirects to the dashboard", async ({ page }) => {
    const layout = new AppLayoutPage(page);
    await layout.goto("/workflows");
    await layout.expectPath("/");
    await layout.expectHeading("Dashboard");
  });

  test("an unknown URL shows the not-found page inside the layout", async ({ page }) => {
    const layout = new AppLayoutPage(page);
    await layout.goto("/this/does/not/exist");
    await layout.expectHeading("404 Page Not Found");
    await layout.expectPath("/this/does/not/exist");
    await expect(layout.sidebar).toBeVisible();
  });
});

test.describe("standard user (not a super power user)", () => {
  test.use({ isSuperPowerUser: false });

  const guarded = APP_ROUTES.filter((route) => route.guard !== "none");

  for (const route of guarded) {
    if (route.guard === "none") continue;
    const target = GUARD_REDIRECTS[route.guard];
    test(`${route.path} redirects to ${target}`, async ({ page }) => {
      const layout = new AppLayoutPage(page);
      await layout.goto(route.path);
      await layout.expectPath(target);
    });
  }

  test("unguarded pages still load", async ({ page }) => {
    const layout = new AppLayoutPage(page);
    await layout.goto("/agents");
    await layout.expectHeading("Agents");
    await layout.expectPath("/agents");
  });
});
