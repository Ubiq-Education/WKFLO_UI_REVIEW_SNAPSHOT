# WKFLO UI

WKFLO UI is the React frontend for the WKFLO AI agent platform. It provides the interface for configuring agents and tools and interacting with them through chat.

# End-to-end tests (Playwright)

The `e2e/` folder holds a Playwright suite that drives the real SPA in Chromium against a **mocked backend**. It needs no Entra ID account, no API and no `.env` file.

## Run

```bash
npm install
npx playwright install chromium   # once per machine
npm run e2e                       # headless, builds and serves the app on http://127.0.0.1:5174
npm run e2e:ui                    # Playwright UI mode (watch, time travel, pick locators)
npm run e2e:report                # open the last HTML report
npm run e2e:typecheck             # type-check the e2e code
```

`npm run e2e` starts its own servers with `e2e/vite.e2e.config.ts` (`--mode e2e`, plain HTTP), so they do not clash with `npm run dev`: the app specs run against an e2e build (`npm run e2e:build`, output `dist-e2e/`) served by `vite preview` on port 5174, and the `chat-widget` specs, which load the widget from source, run against a Vite dev server on the next port (5175). A bundled build is much faster to load than the dev server compiling each module on demand. The build runs every time the server starts, so UI mode and the IDE extension test the current code too; in UI mode, restart it to pick up app changes (spec changes are picked up as usual). If a server is already running on those ports it is reused locally (never in CI). To run several checkouts side by side (e.g. git worktrees), give each its own port, two apart: `E2E_PORT=5176 npm run e2e` (uses 5176 and 5177).

## Debug

- `npx playwright test --debug` steps through a test with the inspector; `--headed` shows the browser.
- Failed tests keep a trace and a screenshot under `test-results/artifacts`. Open a trace with `npx playwright show-trace <trace.zip>`; the HTML report links to them too.
- A JUnit file is written to `test-results/e2e-junit.xml` for CI.

## CI

`pipelines/pr-validation.yml` runs `npm run test:run` and `npm run e2e` (Chromium, `CI=true`) on `ubuntu-latest`. It is non-blocking: both test steps use `continueOnError`, results are published to the Tests tab (JUnit), and the `playwright-report` and `test-results` (traces) artifacts are attached whenever the tests ran. Create the pipeline from that YAML and attach it as a Build Validation policy on `main` (optional, not required).

## How it works

- **Fake sign-in**: the e2e Vite config swaps `client/src/authConfig.ts` for `e2e/support/msal/fake-auth-config.ts`, a stand-in MSAL instance that never calls Entra ID. Production code is untouched. The signed-in state is set per test with `test.use({ signedIn: false })`; clicking "Log in with Azure" signs in for the rest of the browser session.
- **Runtime config**: the test fixture answers `/config.js` so the app points at the fake API origin `https://api.e2e.test`.
- **Mock API** (`e2e/support/mock-api.ts`): every request to the fake origin is intercepted with `page.route()`, including CORS preflights. It is stateful: collections are seeded from `e2e/support/fixtures.ts` and handle GET/POST/PUT/DELETE, so a test can create an entity and see it in the list. Responses use the API envelope `{ data, resultType }`.
- **Chat chrome**: the mock API also answers the GETs the agent and chat pages fire on load (tool permissions, spin-up agents, chats, classification summary, MCP functions, chat configuration and session messages, SignalR negotiate) and keeps a stateful entity-tags store (`mockApi.entityTags`). `mockApi.requestsTo("POST", "/path/:id")` returns the recorded calls (method, path, url with query, body). `replyRaw(body, { contentType, headers, status })` sends a download or any non-JSON body.
- **Fake SignalR hub** (`e2e/support/signalr-hub.ts`, the auto `hub` fixture): `page.routeWebSocket()` answers the JSON-protocol handshake, completes every invocation (so `JoinChat` resolves and the HTTP send fires) and lets a test push server events: `hub.streamReply(sessionId, chunks)`, `typing`, `idle`, `runtimeError`, `toolApproval`, `contactForm`, `stopped`, `drop`. Wait for the chat textarea to be enabled before sending: that means the hub is connected. A chat is live only when the agent's chat setting has a `shareId`, so add one per test (see `shareAgent()` in `e2e/tests/e2e-infra.spec.ts`).
- **Chat mocks** (`e2e/support/mocks/chat.ts`, page object `e2e/pages/chat/test-agent-chat.page.ts`): `installChatMocks(mockApi)` answers the tenant chat calls (send, stop, tool approval, contact form, rating) and returns accessors for what was posted; `emitRuntimeError(hub, sessionId, code, options)` pushes a failed-turn marker. They drive the agent view's "Test Agent" tab, which is live without a share id.
- **Chat's own MSAL**: for `shared/services/auth-service.ts` (the chat's "azure-ad" mode) the e2e Vite config also swaps `@azure/msal-browser` for `e2e/support/msal/fake-msal-browser.ts`, which shares the same fake sign-in state.
- **Strict by default**: a request that no handler matches (the mock answers 501) or a `console.error` / uncaught error fails the test. Expected console noise goes in the short `CONSOLE_ERROR_ALLOWLIST` in `e2e/support/test.ts`, or per test with `test.use({ allowedConsoleErrors: [/pattern/] })`. Use `test.use({ clipboardPermission: true })` for copy buttons.
- **Fixtures** are fake and audience-neutral (for example `E2E Tenant A`, `e2e.user@example.test`). Do not put real people, customers or organisations in them.

## Add a test

1. Import `test` and `expect` from `e2e/support/test` (not from `@playwright/test`) so the fake sign-in, mock API and strict checks are wired up.
2. Use `test.use({ isSuperPowerUser: false })` for a standard user or `test.use({ signedIn: false })` for the signed-out flow.
3. Need more data or an endpoint? Do not edit `fixtures.ts`, `mock-api.ts` or `test.ts` in a feature PR (they are shared). Add `e2e/support/mocks/<area>.ts` exporting `install<Area>Mocks(mockApi)` that registers handlers and seed data, call it from your spec, or override one endpoint in a single test with `mockApi.on("GET", "/md/api/v1/...", () => ...)`. Run the test once: the failure message lists every unmocked call.
4. Put your area's UI in `e2e/pages/<area>.page.ts` (page objects); shared pieces live in `e2e/pages/components/` (`ConfirmDialog`, `Toast`, `TagsPanel`). Prefer `getByRole`, `getByLabel` and headings; add a `data-testid` only when there is no accessible handle.
5. New routes go in `e2e/support/routes.ts`; the page-loads and route-guard specs pick them up automatically.

# Hotfix images

The container build pipeline (`pipelines/build-release.yml`) tags images by the branch it runs on. The tagging is done by the shared `build-push.yml` template in `infra-libraries`.

| Branch | Image tags | Deployed automatically |
|--------|------------|------------------------|
| `main` | `<BuildId>`, `latest` | Staging (`UpdateStaging`) |
| `hotfix/*` | `<BuildId>-hotfix` | No |
| Any other branch | `<BuildId>-preview` | No |

Only `main` moves `latest`, so staging never picks up a hotfix or preview image.

To release an emergency fix to production without the other changes being tested in staging:

1. Create `hotfix/<work-item>` from the commit that is running in production, and commit the fix there.
2. Run the service's build pipeline manually on the hotfix branch (default Run Type). Only the `Build` stage runs; `UpdateStaging` is skipped. The image is pushed as `<BuildId>-hotfix`.
3. Merge the hotfix branch into `main` with a PR, so the fix is also in the updates being tested in staging.
4. Give the `<BuildId>-hotfix` tag to the Ops team, who set it as the production image through the ControlMonkey variables.

A hotfix that needs a database change can't use this flow yet: `sql-release.yml` only releases the dacpac from `main` builds.