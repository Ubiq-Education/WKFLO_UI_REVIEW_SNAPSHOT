import { expect, test } from "../../support/test";
import { HeaderPage } from "../../pages/header/header.page";

test.describe("signed in", () => {
  test("greets the account by name and offers Logout", async ({ page }) => {
    const header = new HeaderPage(page);
    await page.goto("/");

    await header.layout.expectSignedIn("E2E User");
    await expect(header.layout.logoutButton).toBeVisible();
  });

  test("greets whichever account is signed in", async ({ page }) => {
    await page.addInitScript(() => {
      const state = (window as unknown as { __E2E_AUTH__: { account?: { name: string; username: string } } }).__E2E_AUTH__;
      state.account = { name: "E2E Person", username: "person@example.test" };
    });
    const header = new HeaderPage(page);
    await page.goto("/");

    await header.layout.expectSignedIn("E2E Person");
  });

  test("Logout signs out and lands on the login page without the header controls", async ({ page }) => {
    const header = new HeaderPage(page);
    await page.goto("/agents");
    await header.layout.expectSignedIn();

    await header.logout();

    await header.layout.expectPath("/login");
    await header.layout.expectHeading("Login");
    await expect(header.layout.greeting).toHaveCount(0);
    await expect(header.layout.logoutButton).toHaveCount(0);
    await expect(header.tenantCombobox).toHaveCount(0);
  });

  test("after logging out, protected pages send the user back to the login page", async ({ page }) => {
    const header = new HeaderPage(page);
    await page.goto("/");
    await header.layout.expectSignedIn();
    await header.logout();
    await header.layout.expectPath("/login");

    await page.goto("/agents");

    await header.layout.expectPath("/login");
  });

  test("the logo returns to the dashboard", async ({ page }) => {
    const header = new HeaderPage(page);
    await page.goto("/tools");
    await header.layout.expectSignedIn();

    await page.getByRole("img", { name: "Wkflo Logo" }).click();

    await header.layout.expectPath("/");
    await header.layout.expectHeading("Dashboard");
  });
});

test.describe("signed out", () => {
  test.use({ signedIn: false });

  test("the login page has no account controls", async ({ page }) => {
    const header = new HeaderPage(page);
    await page.goto("/login");

    await header.layout.expectHeading("Login");
    await expect(header.layout.logoutButton).toHaveCount(0);
    await expect(header.tenantCombobox).toHaveCount(0);
  });

  test("logging in shows the greeting and selects the first tenant", async ({ page }) => {
    const header = new HeaderPage(page);
    await page.goto("/login");

    await page.getByRole("button", { name: "Log in with Azure" }).click();

    await header.layout.expectPath("/");
    await header.layout.expectSignedIn("E2E User");
    await expect(header.tenantCombobox).toHaveText("E2E Tenant A");
  });

  test("logging in again after logging out works", async ({ page }) => {
    const header = new HeaderPage(page);
    await page.goto("/login");
    await page.getByRole("button", { name: "Log in with Azure" }).click();
    await header.layout.expectSignedIn();
    await header.logout();
    await header.layout.expectPath("/login");

    await page.getByRole("button", { name: "Log in with Azure" }).click();

    await header.layout.expectPath("/");
    await header.layout.expectSignedIn();
  });
});
