import { test as base, expect } from "@playwright/test";
import { API_ORIGIN, MockApi } from "./mock-api";
import { SignalRHub } from "./signalr-hub";

/** Console errors that are expected noise and must not fail a test. Keep this list short. */
const CONSOLE_ERROR_ALLOWLIST: RegExp[] = [];

interface E2EOptions {
  /** Start the test signed in (default). Set false to start on the signed-out login flow. */
  signedIn: boolean;
  /** What /me/permissions reports (default true). */
  isSuperPowerUser: boolean;
  /** Console errors this test expects, on top of the global allowlist: `test.use({ allowedConsoleErrors: [/.../] })`. */
  allowedConsoleErrors: RegExp[];
  /** Grant clipboard read / write permission (for copy buttons). Default false. */
  clipboardPermission: boolean;
}

interface E2EFixtures {
  mockApi: MockApi;
  /** Fake SignalR chat hub, installed for every test and harmless when the page never opens a chat. */
  hub: SignalRHub;
  /** Auto fixture: wires config, fake sign-in and mock API, then fails on unmocked calls and console errors. */
  e2eApp: void;
}

export const test = base.extend<E2EOptions & E2EFixtures>({
  signedIn: [true, { option: true }],
  isSuperPowerUser: [true, { option: true }],
  allowedConsoleErrors: [[], { option: true }],
  clipboardPermission: [false, { option: true }],

  mockApi: async ({ isSuperPowerUser }, use) => {
    await use(new MockApi({ isSuperPowerUser }));
  },

  hub: async ({ page }, use) => {
    const hub = new SignalRHub();
    await hub.install(page);
    await use(hub);
    hub.dispose();
  },

  e2eApp: [
    async ({ page, context, mockApi, hub: _hub, signedIn, baseURL, allowedConsoleErrors, clipboardPermission }, use) => {
      const consoleErrors: string[] = [];
      const isAllowed = (text: string) =>
        [...CONSOLE_ERROR_ALLOWLIST, ...allowedConsoleErrors].some((pattern) => {
          // A global or sticky pattern keeps lastIndex between messages.
          pattern.lastIndex = 0;
          return pattern.test(text);
        });
      page.on("console", (message) => {
        if (message.type() === "error" && !isAllowed(message.text())) {
          consoleErrors.push(`console.error: ${message.text()}`);
        }
      });
      page.on("pageerror", (error) => consoleErrors.push(`uncaught: ${error.message}`));

      // Runtime config normally comes from the nginx-generated /config.js.
      await page.route("**/config.js", (route) =>
        route.fulfill({
          contentType: "application/javascript",
          body: `window.__APP_CONFIG__ = ${JSON.stringify({
            VITE_API_URL: API_ORIGIN,
            VITE_MSAL_REDIRECT_URI: `${baseURL}/`,
            VITE_ENTRA_CLIENT_ID: "e2e-client-id",
            VITE_ENTRA_TENANT_ID: "e2e-entra-tenant-id",
            VITE_ENTRA_SCOPE: "api://e2e/access",
          })};`,
        }),
      );
      await page.addInitScript((state) => {
        (window as unknown as { __E2E_AUTH__: unknown }).__E2E_AUTH__ = state;
      }, { signedIn });
      await mockApi.install(page);
      if (clipboardPermission) {
        await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseURL });
      }

      await use();

      // Let in-flight route handlers finish so late calls are recorded and fulfill() can't hit a closed page.
      await page.unrouteAll({ behavior: "wait" });
      expect(mockApi.unmocked, "Every API call made by the app must be mocked").toEqual([]);
      expect(consoleErrors, "The app must not log console errors").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
