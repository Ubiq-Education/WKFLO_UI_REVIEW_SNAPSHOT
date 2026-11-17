import { expect, test } from "../../support/test";
import { McpEditorPage } from "../../pages/mcp/mcp-editor.page";
import { McpOAuthPanel } from "../../pages/mcp/mcp-oauth-panel.page";
import { McpFunctionsPanel } from "../../pages/mcp/mcp-functions-panel.page";
import { Toast } from "../../pages/components/toast";
import {
  connectionIdOf,
  installMcpToolsMocks,
  lastSavedConfig,
  mcpErrorReply,
  MCP_TOOL_IDS,
  withMcpFields,
  type McpToolsStore,
} from "../../support/mocks/mcp-tools";

// The browser logs every non-2xx response as a console error; the error-path tests mock 400 / 404 / 500 on purpose.
const FAILED_REQUEST_LOG = /Failed to load resource: the server responded with a status of (400|404|500)/;

const SHARED_ID = connectionIdOf(MCP_TOOL_IDS.oauthShared);
const STATUS_PATH = "/md/api/v1/tenant/tool/:id/mcp/oauth/status";
const START_PATH = "/md/api/v1/tenant/tool/:id/mcp/oauth/start";
const DISCONNECT_PATH = "/md/api/v1/tenant/tool/:id/mcp/oauth";

let store: McpToolsStore;
test.beforeEach(({ mockApi }) => {
  store = installMcpToolsMocks(mockApi);
});

test.describe("Connection panel: availability", () => {
  test("is not shown for a tool whose connection has not been provisioned yet", async ({ page, mockApi }) => {
    installMcpToolsMocks(mockApi, {
      tools: [withMcpFields(store.tool(MCP_TOOL_IDS.oauthShared), { mcpOAuthConnectionId: null })],
    });
    const editor = new McpEditorPage(page);
    await editor.gotoEdit(MCP_TOOL_IDS.oauthShared);

    await expect(editor.authType).toHaveText("OAuth 2.1");
    await expect(new McpOAuthPanel(page).title).toHaveCount(0);
    await expect(new McpFunctionsPanel(page).state).toHaveText("Save the tool, then connect it, to see its functions.");
  });

  test("is not shown when the auth type is None", async ({ page, mockApi }) => {
    const editor = new McpEditorPage(page);
    await editor.gotoEdit(MCP_TOOL_IDS.httpNoAuth);

    await expect(new McpFunctionsPanel(page).names()).toHaveCount(5);
    await expect(new McpOAuthPanel(page).title).toHaveCount(0);
    // No connection to ask about: the status endpoint is never called.
    expect(mockApi.requestsTo("GET", STATUS_PATH)).toHaveLength(0);
  });
});

test.describe("Connection panel: status badges", () => {
  test("Shared tool that is not connected offers Connect", async ({ page }) => {
    const editor = new McpEditorPage(page);
    const oauth = new McpOAuthPanel(page);
    await editor.gotoEdit(MCP_TOOL_IDS.oauthShared);

    await oauth.expectStatus("Not connected");
    await expect(page.getByText("Shared — connects for your whole tenant")).toBeVisible();
    await expect(page.getByText("Authorize this tool to call the MCP server. You'll be asked to sign in and grant access in a new tab.")).toBeVisible();
    await expect(oauth.connectButton).toBeEnabled();
    await expect(oauth.disconnectButton).toHaveCount(0);
  });

  test("Per-user tool that is not connected says the connection is personal", async ({ page }) => {
    const editor = new McpEditorPage(page);
    const oauth = new McpOAuthPanel(page);
    await editor.gotoEdit(MCP_TOOL_IDS.oauthPerUser);

    await oauth.expectStatus("Not connected");
    await expect(page.getByText("Personal — connects your own account")).toBeVisible();
    await expect(page.getByText(/Authorize this tool to call the MCP server using your own account/)).toBeVisible();
  });

  test("Shared tool that is connected offers Disconnect only", async ({ page }) => {
    store.setOAuth(MCP_TOOL_IDS.oauthShared, { status: "Connected" });
    const editor = new McpEditorPage(page);
    const oauth = new McpOAuthPanel(page);
    await editor.gotoEdit(MCP_TOOL_IDS.oauthShared);

    await oauth.expectStatus("Connected");
    await expect(page.getByText("This tool is authorized to call the MCP server on behalf of your tenant.")).toBeVisible();
    await expect(oauth.disconnectButton).toBeEnabled();
    await expect(oauth.connectButton).toHaveCount(0);
    await expect(oauth.reconnectButton).toHaveCount(0);
  });

  test("Per-user tool that is connected says other admins connect separately", async ({ page }) => {
    store.setOAuth(MCP_TOOL_IDS.oauthPerUser, { status: "Connected" });
    const editor = new McpEditorPage(page);
    await editor.gotoEdit(MCP_TOOL_IDS.oauthPerUser);

    await new McpOAuthPanel(page).expectStatus("Connected");
    await expect(page.getByText("You are authorized to call the MCP server with your own account. Other admins connect separately.")).toBeVisible();
  });

  test("a connection with an issue shows the reason and offers Reconnect and Disconnect", async ({ page }) => {
    store.setOAuth(MCP_TOOL_IDS.oauthShared, { status: "ConnectionIssue", reason: "The server rejected the saved sign-in." });
    const editor = new McpEditorPage(page);
    const oauth = new McpOAuthPanel(page);
    await editor.gotoEdit(MCP_TOOL_IDS.oauthShared);

    await oauth.expectStatus("Connected — issue");
    await expect(page.getByText("This tool completed authorization, but the MCP server rejected the connection.")).toBeVisible();
    await expect(page.getByText("The server rejected the saved sign-in.")).toBeVisible();
    await expect(oauth.reconnectButton).toBeEnabled();
    await expect(oauth.disconnectButton).toBeEnabled();
    await expect(oauth.connectButton).toHaveCount(0);
  });

  test.describe("when the status cannot be read", () => {
    test.use({ allowedConsoleErrors: [FAILED_REQUEST_LOG] });

    test("shows Status unavailable instead of Not connected", async ({ page, mockApi }) => {
      // An unhandled error: UnexpectedResult, HTTP 500 with one error { property: "", code: "WKFLO0001" }
      // (HttpGlobalExceptionFilter, CommonConsts UnexpectedResult).
      mockApi.on("GET", STATUS_PATH, () => mcpErrorReply(500, ["", "WKFLO0001"]));
      const editor = new McpEditorPage(page);
      const oauth = new McpOAuthPanel(page);
      await editor.gotoEdit(MCP_TOOL_IDS.oauthShared);

      await oauth.expectStatus("Status unavailable");
      await expect(page.getByText("Not connected", { exact: true })).toHaveCount(0);
      await expect(page.getByText("Couldn't check this tool's connection status. Its actual state may differ from what's shown below.")).toBeVisible();
      await expect(page.getByText(/500: [\s\S]*"code":"WKFLO0001"/)).toBeVisible();
      // The Functions panel waits for a known status too.
      await expect(new McpFunctionsPanel(page).state).toContainText("Functions are unavailable because this tool's connection status couldn't be checked.");
    });
  });
});

test.describe("Connect", () => {
  test("opens the authorization page in a new tab that has no link back to the app", async ({ page, context, mockApi }) => {
    await context.route("https://auth.e2e.test/**", (route) => route.fulfill({ contentType: "text/html", body: "<title>Consent</title>" }));
    const editor = new McpEditorPage(page);
    const oauth = new McpOAuthPanel(page);
    await editor.gotoEdit(MCP_TOOL_IDS.oauthShared);
    await oauth.expectStatus("Not connected");

    const popupPromise = page.waitForEvent("popup");
    await oauth.connectButton.click();
    const popup = await popupPromise;

    await expect(popup).toHaveURL(`https://auth.e2e.test/authorize?client_id=e2e&state=e2e-state-${MCP_TOOL_IDS.oauthShared}`);
    // window.open(..., "noopener,noreferrer"): the consent page cannot reach the app window.
    expect(await popup.evaluate(() => window.opener)).toBeNull();
    expect(mockApi.requestsTo("GET", START_PATH)).toHaveLength(1);
    expect(mockApi.requestsTo("GET", START_PATH)[0].path).toContain(SHARED_ID);
    // The page itself does not navigate away.
    await expect(page).toHaveURL((url) => url.pathname === `/tools/${MCP_TOOL_IDS.oauthShared}/edit`);
  });

  test("the status is polled, so the badge turns Connected once consent was given in the other tab", async ({ page, context, mockApi }) => {
    await context.route("https://auth.e2e.test/**", (route) => route.fulfill({ contentType: "text/html", body: "<title>Consent</title>" }));
    await page.clock.install();
    const editor = new McpEditorPage(page);
    const oauth = new McpOAuthPanel(page);
    const functions = new McpFunctionsPanel(page);
    await editor.gotoEdit(MCP_TOOL_IDS.oauthShared);
    await oauth.expectStatus("Not connected");
    await expect(functions.state).toContainText("Connect this tool first.");

    const popupPromise = page.waitForEvent("popup");
    await oauth.connectButton.click();
    await popupPromise;
    // The user finishes consent in the new tab: the backend now holds a token.
    store.setOAuth(MCP_TOOL_IDS.oauthShared, { status: "Connected" });
    const before = mockApi.requestsTo("GET", STATUS_PATH).length;

    // The status query refetches every 5 seconds.
    await page.clock.runFor(5000);

    await oauth.expectStatus("Connected");
    expect(mockApi.requestsTo("GET", STATUS_PATH).length).toBeGreaterThan(before);
    await expect(oauth.disconnectButton).toBeVisible();
    // The Functions panel shares the status and is usable now.
    await expect(functions.refresh).toBeVisible();
  });

  test.describe("when the flow cannot start", () => {
    test.use({ allowedConsoleErrors: [FAILED_REQUEST_LOG] });

    test("a config the backend cannot use is reported with its code", async ({ page, mockApi }) => {
      // A blank MCP server id fails McpServerConfig.Validate(), so start answers WKFLOMD1201 (ToolMcpOAuthNotConfigured).
      const tool = store.tool(MCP_TOOL_IDS.oauthShared);
      installMcpToolsMocks(mockApi, { tools: [withMcpFields(tool, { config: JSON.stringify({ ...JSON.parse(tool.config), id: "" }) })] });
      const editor = new McpEditorPage(page);
      const oauth = new McpOAuthPanel(page);
      await editor.gotoEdit(MCP_TOOL_IDS.oauthShared);

      await oauth.connectButton.click();

      // Known bug: see US 8186 item 54. The panel prints the raw response body; the code has no friendly message.
      await expect(page.getByText(/Failed to start the connection: 400: [\s\S]*WKFLOMD1201/)).toBeVisible();
      await expect(oauth.connectButton).toBeEnabled();
    });

    test("a consent flow that fails to start is reported with its code", async ({ page }) => {
      store.consentFails = true;
      const editor = new McpEditorPage(page);
      const oauth = new McpOAuthPanel(page);
      await editor.gotoEdit(MCP_TOOL_IDS.oauthShared);

      await oauth.connectButton.click();

      await expect(page.getByText(/Failed to start the connection: 400: [\s\S]*WKFLOMD1202/)).toBeVisible();
      await oauth.expectStatus("Not connected");
    });
  });
});

test.describe("Disconnect", () => {
  test("removes the connection and shows Not connected again", async ({ page, mockApi }) => {
    store.setOAuth(MCP_TOOL_IDS.oauthShared, { status: "Connected" });
    const editor = new McpEditorPage(page);
    const oauth = new McpOAuthPanel(page);
    await editor.gotoEdit(MCP_TOOL_IDS.oauthShared);
    await oauth.expectStatus("Connected");

    await oauth.disconnectButton.click();

    await oauth.expectStatus("Not connected");
    expect(mockApi.requestsTo("DELETE", DISCONNECT_PATH)).toHaveLength(1);
    expect(mockApi.requestsTo("DELETE", DISCONNECT_PATH)[0].path).toContain(SHARED_ID);
    await expect(oauth.connectButton).toBeVisible();
    await expect(oauth.disconnectButton).toHaveCount(0);
  });

  test.describe("when the backend rejects it", () => {
    test.use({ allowedConsoleErrors: [FAILED_REQUEST_LOG] });

    test("shows the error and keeps the status", async ({ page }) => {
      store.setOAuth(MCP_TOOL_IDS.oauthShared, { status: "Connected" });
      const editor = new McpEditorPage(page);
      const oauth = new McpOAuthPanel(page);
      await editor.gotoEdit(MCP_TOOL_IDS.oauthShared);
      await oauth.expectStatus("Connected");
      // The tool was deleted in another tab: the disconnect validator answers WKFLOMD0402 (ToolMustExist).
      store.tool(MCP_TOOL_IDS.oauthShared).isDeleted = true;

      await oauth.disconnectButton.click();

      await expect(page.getByText(/Failed to disconnect: 400: [\s\S]*WKFLOMD0402/)).toBeVisible();
      await oauth.expectStatus("Connected");
      await expect(oauth.disconnectButton).toBeEnabled();
    });
  });
});

test.describe("Connection mode", () => {
  test("changing it on a saved tool saves immediately and the panel follows", async ({ page, mockApi }) => {
    const editor = new McpEditorPage(page);
    const oauth = new McpOAuthPanel(page);
    await editor.gotoEdit(MCP_TOOL_IDS.oauthShared);
    await oauth.expectStatus("Not connected");
    await expect(page.getByText("One connection is shared by your whole tenant. Any admin can see and manage its status.")).toBeVisible();
    const statusCalls = mockApi.requestsTo("GET", STATUS_PATH).length;

    await editor.chooseConnectionMode("Per-user");

    // No click on "Save Tool": the change is persisted on its own.
    await new Toast(page).expectShown("Tool updated");
    expect(lastSavedConfig(mockApi).oAuthScope).toBe("PerUser");
    expect(JSON.parse(store.tool(MCP_TOOL_IDS.oauthShared).config).oAuthScope).toBe("PerUser");
    await expect(page.getByText("Each admin who opens this tool connects their own account. Statuses are not shared between admins.")).toBeVisible();
    await expect(page.getByText("Personal — connects your own account")).toBeVisible();
    // The status is read again for the new mode.
    await expect.poll(() => mockApi.requestsTo("GET", STATUS_PATH).length).toBeGreaterThan(statusCalls);
    await expect(editor.publishButton).toBeVisible();

    await editor.chooseConnectionMode(/^Shared/);
    await expect.poll(() => mockApi.requestsTo("PUT", "/md/api/v1/tenant/tool/:id").length).toBe(2);
    expect(lastSavedConfig(mockApi).oAuthScope).toBe("Shared");
  });

  test("on a tool that was never saved it only changes the form", async ({ page, mockApi }) => {
    const editor = new McpEditorPage(page);
    await editor.gotoCreate();
    await editor.selectToolType("MCP");
    await editor.fillBasics("E2E Mode Tool");
    await editor.chooseTransport("Http");
    await editor.chooseAuthType("OAuth 2.1");

    await editor.chooseConnectionMode("Per-user");
    await expect(page.getByText("Each admin who opens this tool connects their own account.")).toBeVisible();
    await editor.saveButton.click();

    await new Toast(page).expectShown("Tool created");
    // One save, the explicit one: nothing was sent for the mode change itself.
    expect(mockApi.requestsTo("POST", "/md/api/v1/tenant/tool")).toHaveLength(1);
    expect(lastSavedConfig(mockApi, "POST").oAuthScope).toBe("PerUser");
    await expect(editor.connectionMode).toHaveText("Per-user");
  });
});

test.describe("Unsaved credentials", () => {
  test("hold Connect back until the tool is saved, then say that connections were reset", async ({ page }) => {
    store.setOAuth(MCP_TOOL_IDS.oauthShared, { status: "Connected" });
    const editor = new McpEditorPage(page);
    const oauth = new McpOAuthPanel(page);
    await editor.gotoEdit(MCP_TOOL_IDS.oauthShared);
    await oauth.expectStatus("Connected");
    await expect(oauth.saveFirstHint).toHaveCount(0);

    await editor.clientId.fill("e2e-other-client-id");
    // Connected tools show no Connect button, so edit the saved state to see the blocked button: disconnect first.
    await oauth.disconnectButton.click();
    await oauth.expectStatus("Not connected");

    await expect(oauth.saveFirstHint).toBeVisible();
    await expect(oauth.connectButton).toBeDisabled();
    // Reverting the edit lifts the block.
    await editor.clientId.fill("e2e-client-id");
    await expect(oauth.saveFirstHint).toHaveCount(0);
    await expect(oauth.connectButton).toBeEnabled();

    await editor.clientId.fill("e2e-other-client-id");
    await expect(oauth.connectButton).toBeDisabled();
    await editor.saveButton.click();

    await new Toast(page).expectShown("Tool updated");
    await expect(oauth.resetNotice).toContainText("Everyone who uses this tool needs to connect again.");
    await expect(oauth.saveFirstHint).toHaveCount(0);
    await expect(oauth.connectButton).toBeEnabled();
  });

  test("a changed scope also holds Connect back", async ({ page }) => {
    const editor = new McpEditorPage(page);
    const oauth = new McpOAuthPanel(page);
    await editor.gotoEdit(MCP_TOOL_IDS.oauthShared);
    await oauth.expectStatus("Not connected");

    await editor.scopes.fill("records:read records:write");

    await expect(oauth.saveFirstHint).toBeVisible();
    await expect(oauth.connectButton).toBeDisabled();
    await expect(oauth.connectButton).toHaveAccessibleDescription(/Save the tool before connecting/);
  });
});
