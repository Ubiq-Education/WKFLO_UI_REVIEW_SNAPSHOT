import { defineConfig, devices } from "@playwright/test";

// E2E_PORT lets parallel checkouts (e.g. git worktrees) run the suite side by side;
// otherwise reuseExistingServer would attach to another checkout's server.
const PORT = Number(process.env.E2E_PORT ?? 5174);
// The chat-widget specs load chat-widget/src/widget.tsx from source through Vite's /@fs/, which
// only a dev server can serve, so they get their own dev server on the next port.
const WIDGET_PORT = PORT + 1;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const WIDGET_BASE_URL = `http://127.0.0.1:${WIDGET_PORT}`;
const WIDGET_SPECS = "chat-widget/**/*.spec.ts";
const isCI = !!process.env.CI;

export default defineConfig({
  testDir: "./e2e/tests",
  outputDir: "./test-results/artifacts",
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 2 : undefined,
  fullyParallel: true,
  reporter: [
    ["list"],
    ["html", { open: "never" }],
    ["junit", { outputFile: "test-results/e2e-junit.xml" }],
  ],
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      testIgnore: WIDGET_SPECS,
      use: { ...devices["Desktop Chrome"], baseURL: BASE_URL },
    },
    {
      name: "chat-widget",
      testMatch: WIDGET_SPECS,
      use: { ...devices["Desktop Chrome"], baseURL: WIDGET_BASE_URL },
    },
  ],
  webServer: [
    {
      // Builds dist-e2e/ (a few seconds) and serves it. A bundled build loads far faster than the dev
      // server compiling each module on demand. Building here, not in an npm script, means UI mode,
      // the IDE extension and plain `npx playwright test` never run against a stale build.
      command: "npm run e2e:build && npx vite preview --config e2e/vite.e2e.config.ts --mode e2e",
      url: BASE_URL,
      reuseExistingServer: !isCI,
      // Covers the build as well as the server start; slower CI agents need the headroom.
      timeout: 240_000,
    },
    {
      // Dev mode (443 + HTTPS + .pem files) is unusable in CI, so e2e has its own config, port and mode.
      command: "npx vite --config e2e/vite.e2e.config.ts --mode e2e",
      url: WIDGET_BASE_URL,
      reuseExistingServer: !isCI,
      timeout: 120_000,
      env: { E2E_PORT: String(WIDGET_PORT) },
    },
  ],
});
