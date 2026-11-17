import { expect, test } from "../../support/test";
import { SuperPowerUsersPage } from "../../pages/settings/settings.page";
import { Toast } from "../../pages/components/toast";
import { errorReply, unexpectedReply } from "../../support/mocks/marketplace";
import { CALLER_EMAIL, installSettingsMocks, type SettingsStore } from "../../support/mocks/settings";

const EXPECTED_FAILURES = /Failed to load resource: the server responded with a status of (400|403|404|500)/;
const USERS_PATH = "/md/api/v1/super-power-users";

let store: SettingsStore;

test.beforeEach(({ mockApi }) => {
  store = installSettingsMocks(mockApi);
});

test("lists the super power users ordered by email, with who added them", async ({ page }) => {
  const settings = new SuperPowerUsersPage(page);
  await settings.gotoSection();

  await expect(settings.users.row("e2e.admin@example.test")).toContainText("e2e.seed@example.test");
  await expect(settings.users.root.getByRole("row")).toHaveCount(3);
  await expect(settings.users.root.getByRole("row").nth(1)).toContainText("e2e.admin@example.test");
  await expect(settings.users.root.getByRole("row").nth(2)).toContainText(CALLER_EMAIL);
});

test("a super power user cannot remove their own row", async ({ page }) => {
  const settings = new SuperPowerUsersPage(page);
  await settings.gotoSection();

  await expect(settings.users.removeButton(CALLER_EMAIL)).toBeDisabled();
  await expect(settings.users.removeButton(CALLER_EMAIL)).toHaveAttribute("title", "You can't remove your own access");
  await expect(settings.users.removeButton("e2e.admin@example.test")).toBeEnabled();
});

// The "No super power users." row is unreachable: the list endpoint answers 403 unless the caller is an active
// super power user, so the caller's own row is always present. It is therefore not tested.

test.describe("add", () => {
  test("posts the email, toasts, clears the field and lists the new user", async ({ page, mockApi }) => {
    const settings = new SuperPowerUsersPage(page);
    const toast = new Toast(page);
    await settings.gotoSection();

    await settings.users.add("person@example.test");

    await toast.expectShown("Super power user added");
    await toast.expectShown("person@example.test");
    expect(mockApi.requestsTo("POST", USERS_PATH).map((request) => request.body)).toEqual([{ email: "person@example.test" }]);
    await expect(settings.users.emailInput).toHaveValue("");
    await expect(settings.users.row("person@example.test")).toContainText(CALLER_EMAIL);
  });

  test("the server lower-cases the email", async ({ page }) => {
    const settings = new SuperPowerUsersPage(page);
    await settings.gotoSection();

    await settings.users.add("Person.Upper@Example.Test");

    await expect(settings.users.row("person.upper@example.test")).toBeVisible();
  });

  test("adding an email that is already listed is a success and adds no second row", async ({ page, mockApi }) => {
    const settings = new SuperPowerUsersPage(page);
    const toast = new Toast(page);
    await settings.gotoSection();

    await settings.users.add("e2e.admin@example.test");

    await toast.expectShown("Super power user added");
    // Wait for the list refetch that follows the add before counting rows (load, then add).
    await expect.poll(() => mockApi.requestsTo("GET", USERS_PATH).length).toBe(2);
    await expect(settings.users.root.getByRole("row")).toHaveCount(3);
  });

  test("adding refreshes the caller's own permissions", async ({ page, mockApi }) => {
    const settings = new SuperPowerUsersPage(page);
    await settings.gotoSection();
    const before = mockApi.requestsTo("GET", "/md/api/v1/me/permissions").length;

    await settings.users.add("person@example.test");

    await expect.poll(() => mockApi.requestsTo("GET", "/md/api/v1/me/permissions").length).toBeGreaterThan(before);
  });

  test("an empty email is rejected without a request", async ({ page, mockApi }) => {
    const settings = new SuperPowerUsersPage(page);
    await settings.gotoSection();

    await settings.users.addButton.click();

    await expect(settings.users.validationMessage).toHaveText("Enter an email address");
    expect(mockApi.requestsTo("POST", USERS_PATH)).toHaveLength(0);
  });

  test("an invalid email is rejected without a request", async ({ page, mockApi }) => {
    const settings = new SuperPowerUsersPage(page);
    await settings.gotoSection();

    await settings.users.add("not-an-email");

    await expect(settings.users.validationMessage).toHaveText("Enter a valid email address");
    expect(mockApi.requestsTo("POST", USERS_PATH)).toHaveLength(0);
  });

  test("an email over 320 characters is rejected without a request", async ({ page, mockApi }) => {
    const settings = new SuperPowerUsersPage(page);
    await settings.gotoSection();

    await settings.users.add(`${"a".repeat(320)}@example.test`);

    await expect(settings.users.validationMessage).toHaveText("Email address is too long");
    expect(mockApi.requestsTo("POST", USERS_PATH)).toHaveLength(0);
  });

  test.describe("failures", () => {
    test.use({ allowedConsoleErrors: [EXPECTED_FAILURES] });

    test("a 403 shows the friendly permission message and keeps the typed email", async ({ page, mockApi }) => {
      // Reachable only through a race: the caller's super power access was revoked after the page loaded.
      mockApi.on("POST", USERS_PATH, () => errorReply(403, ["Email", "WKFLOMD1601"]));
      const settings = new SuperPowerUsersPage(page);
      const toast = new Toast(page);
      await settings.gotoSection();

      await settings.users.add("person@example.test");

      await toast.expectShown("Couldn't add super power user");
      await toast.expectShown("Couldn't add super power user: You don't have permission to do this. Please contact Support.");
      await expect(settings.users.emailInput).toHaveValue("person@example.test");
      await expect(settings.users.row("person@example.test")).toHaveCount(0);
    });

    test("an unexpected error shows the friendly generic message", async ({ page, mockApi }) => {
      mockApi.on("POST", USERS_PATH, () => unexpectedReply());
      const settings = new SuperPowerUsersPage(page);
      const toast = new Toast(page);
      await settings.gotoSection();

      await settings.users.add("person@example.test");

      await toast.expectShown("Couldn't add super power user: An unexpected error occurred. Please try again later.");
    });
  });
});

test.describe("remove", () => {
  test("asks first, then deletes the row and toasts", async ({ page, mockApi }) => {
    const settings = new SuperPowerUsersPage(page);
    const toast = new Toast(page);
    await settings.gotoSection();

    await settings.users.removeButton("e2e.admin@example.test").click();
    await settings.users.removeDialog.expectVisible();
    await settings.users.removeDialog.expectText("e2e.admin@example.test will no longer see every tenant");
    expect(mockApi.requestsTo("DELETE", `${USERS_PATH}/:id`)).toHaveLength(0);
    await settings.users.removeDialog.confirm("Remove");

    await toast.expectShown("Super power user removed");
    expect(mockApi.requestsTo("DELETE", `${USERS_PATH}/1`)).toHaveLength(1);
    await expect(settings.users.row("e2e.admin@example.test")).toHaveCount(0);
    await expect(settings.users.row(CALLER_EMAIL)).toBeVisible();
  });

  test("Cancel keeps the user", async ({ page, mockApi }) => {
    const settings = new SuperPowerUsersPage(page);
    await settings.gotoSection();

    await settings.users.removeButton("e2e.admin@example.test").click();
    await settings.users.removeDialog.cancel();

    await settings.users.removeDialog.expectClosed();
    expect(mockApi.requestsTo("DELETE", `${USERS_PATH}/:id`)).toHaveLength(0);
    await expect(settings.users.row("e2e.admin@example.test")).toBeVisible();
  });

  test.describe("failures", () => {
    test.use({ allowedConsoleErrors: [EXPECTED_FAILURES] });

    test("a user someone else already removed is a 404 with no error code", async ({ page }) => {
      const settings = new SuperPowerUsersPage(page);
      const toast = new Toast(page);
      await settings.gotoSection();
      await expect(settings.users.row("e2e.admin@example.test")).toBeVisible();
      store.superPowerUsers.splice(0, 1);

      await settings.users.remove("e2e.admin@example.test");

      await toast.expectShown("Couldn't remove super power user");
      await toast.expectShown(/Couldn't remove super power user: .*"resultType":4.* \(HTTP 404\)/);
    });

    test("the server's last-user rule shows its friendly message", async ({ page, mockApi }) => {
      // Only reachable through a race: the UI disables the caller's row, so the last remaining row is the caller's
      // own, and the rule fires only when another super power user was removed concurrently.
      mockApi.on("DELETE", `${USERS_PATH}/:id`, () => errorReply(400, ["Id", "WKFLOMD1603"]));
      const settings = new SuperPowerUsersPage(page);
      const toast = new Toast(page);
      await settings.gotoSection();

      await settings.users.remove("e2e.admin@example.test");

      await toast.expectShown("Couldn't remove super power user: At least one super power user must remain. Please contact Support.");
      await expect(settings.users.row("e2e.admin@example.test")).toBeVisible();
    });

    test("a 403 shows the friendly permission message", async ({ page, mockApi }) => {
      // Reachable only through a race: the caller's super power access was revoked after the page loaded.
      mockApi.on("DELETE", `${USERS_PATH}/:id`, () => errorReply(403, ["Email", "WKFLOMD1601"]));
      const settings = new SuperPowerUsersPage(page);
      const toast = new Toast(page);
      await settings.gotoSection();

      await settings.users.remove("e2e.admin@example.test");

      await toast.expectShown("Couldn't remove super power user: You don't have permission to do this. Please contact Support.");
    });
  });
});

test.describe("when the list cannot be loaded", () => {
  test.use({ allowedConsoleErrors: [EXPECTED_FAILURES] });

  test("shows an error in that card only", async ({ page, mockApi }) => {
    mockApi.on("GET", USERS_PATH, () => unexpectedReply());
    const settings = new SuperPowerUsersPage(page);
    await settings.gotoSection();

    await expect(settings.users.root.getByText("Couldn't load super power users. Please contact Support.")).toBeVisible();
    await expect(settings.tenantAccess.row("e2e.member@example.test")).toBeVisible();
  });

  test("shows the tenant access error in its own card", async ({ page, mockApi }) => {
    mockApi.on("GET", "/md/api/v1/tenant-access", () => unexpectedReply());
    const settings = new SuperPowerUsersPage(page);
    await settings.gotoSection();

    await expect(settings.tenantAccess.root.getByText("Couldn't load tenant access. Please contact Support.")).toBeVisible();
    await expect(settings.users.row(CALLER_EMAIL)).toBeVisible();
  });
});
