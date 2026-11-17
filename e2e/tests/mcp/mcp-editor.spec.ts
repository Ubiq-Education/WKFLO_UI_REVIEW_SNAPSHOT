import { expect, test } from "../../support/test";
import { McpEditorPage } from "../../pages/mcp/mcp-editor.page";
import { McpOAuthPanel } from "../../pages/mcp/mcp-oauth-panel.page";
import { Toast } from "../../pages/components/toast";
import {
  installMcpToolsMocks,
  lastSavedConfig,
  MCP_TOOL_IDS,
  NEW_MCP_TOOL_ID,
  withMcpFields,
  type McpToolsStore,
} from "../../support/mocks/mcp-tools";

// The browser logs every non-2xx response as a console error; the error-path tests mock 400 on purpose.
const FAILED_REQUEST_LOG = /Failed to load resource: the server responded with a status of 400/;

const TOOL_PATH = "/md/api/v1/tenant/tool/:id";

let store: McpToolsStore;
test.beforeEach(({ mockApi }) => {
  store = installMcpToolsMocks(mockApi);
});

test.describe("Create an MCP tool", () => {
  test("choosing the MCP type shows a Stdio server form with empty defaults", async ({ page }) => {
    const editor = new McpEditorPage(page);
    await editor.gotoCreate();
    await editor.selectToolType("MCP");

    await expect(page.getByRole("heading", { level: 3, name: "MCP Configuration" })).toBeVisible();
    await expect(editor.transport).toHaveText("Stdio");
    await expect(editor.serverId).toHaveValue("");
    await expect(editor.command).toHaveValue("");
    await expect(editor.addArgument).toBeVisible();
    await expect(editor.addVariable).toBeVisible();
    // Http-only fields are not shown, and the edit-only panels need a saved tool.
    await expect(editor.endpoint).toHaveCount(0);
    await expect(editor.authType).toHaveCount(0);
    await expect(page.getByTestId("mcp-functions-panel")).toHaveCount(0);
  });

  test("saves a Stdio tool with arguments and an environment variable, then opens it in the edit page", async ({ page, mockApi }) => {
    const editor = new McpEditorPage(page);
    await editor.gotoCreate();
    await editor.selectToolType("MCP");
    await editor.fillBasics("E2E New Stdio Server");
    await editor.serverId.fill("e2e-new-stdio");
    await editor.command.fill("node");
    await editor.addArgument.click();
    await editor.argument(1).fill("server.js");
    await editor.addArgument.click();
    await editor.argument(2).fill("--stdio");
    await editor.addVariable.click();
    await editor.variableNames.first().fill("E2E_API_BASE");
    await editor.variableValues.first().fill("https://example.test/api");

    await editor.saveButton.click();

    await new Toast(page).expectShown("Tool created");
    await expect(page).toHaveURL((url) => url.pathname === `/tools/${NEW_MCP_TOOL_ID}/edit`);
    expect(lastSavedConfig(mockApi, "POST")).toMatchObject({
      id: "e2e-new-stdio",
      transportType: "Stdio",
      command: "node",
      arguments: ["server.js", "--stdio"],
      environmentVariables: { E2E_API_BASE: "https://example.test/api" },
      endpoint: "",
      additionalHeaders: {},
      authType: "None",
      oAuthScope: "Shared",
    });
    // The edit page is filled from what the backend stored.
    await expect(editor.serverId).toHaveValue("e2e-new-stdio");
    await expect(editor.argument(2)).toHaveValue("--stdio");
    await expect(editor.variableNames.first()).toHaveValue("E2E_API_BASE");
    await expect(page.getByTestId("mcp-functions-panel")).toBeVisible();
  });

  test("switching the type from HTTP leaves the HTTP settings in the saved MCP config", async ({ page, mockApi }) => {
    const editor = new McpEditorPage(page);
    await editor.gotoCreate();
    await editor.selectToolType("MCP");
    await editor.fillBasics("E2E Switched Tool");
    await editor.saveButton.click();
    await new Toast(page).expectShown("Tool created");

    // Known bug: see US 8186 item 53. The create page starts as an HTTP tool whose default config
    // ({ method, url, headers, parameters, ... }) is spread into the MCP config on type change and then saved with it.
    // Repro: Tools > create > pick MCP > fill name and description > Save, and read the request body's config.
    // client/src/components/tools/config-editors/mcp-config-editor.tsx (mount effect: `...parsedConfig`).
    const config = lastSavedConfig(mockApi, "POST");
    expect(config).toMatchObject({ transportType: "Stdio", authType: "None" });
    expect(config).toMatchObject({ method: "GET", url: "", headers: { "Content-Type": "application/json" } });
  });

  test("an Http server with OAuth 2.1 shows the connection mode and client credentials, but no connection panel before the first save", async ({ page }) => {
    const editor = new McpEditorPage(page);
    await editor.gotoCreate();
    await editor.selectToolType("MCP");
    await editor.chooseTransport("Http");
    await expect(editor.endpoint).toBeVisible();
    await expect(editor.command).toHaveCount(0);
    await expect(page.getByText("Additional Headers")).toBeVisible();

    await editor.chooseAuthType("OAuth 2.1");

    await expect(editor.connectionMode).toHaveText("Shared (tenant-wide)");
    await expect(editor.clientId).toBeVisible();
    await expect(editor.clientSecret).toBeVisible();
    await expect(editor.scopes).toBeVisible();
    // Headers do not apply to OAuth, and there is nothing to connect until the tool (and its connection id) exists.
    await expect(page.getByText("Additional Headers")).toHaveCount(0);
    await expect(new McpOAuthPanel(page).title).toHaveCount(0);
  });

  test("saving an OAuth 2.1 tool provisions its connection, so the Connection panel appears in the edit page", async ({ page, mockApi }) => {
    const editor = new McpEditorPage(page);
    await editor.gotoCreate();
    await editor.selectToolType("MCP");
    await editor.fillBasics("E2E New OAuth Server");
    await editor.serverId.fill("e2e-new-oauth");
    await editor.chooseTransport("Http");
    await editor.endpoint.fill("https://oauth-mcp.example.test/mcp");
    await editor.chooseAuthType("OAuth 2.1");
    await editor.saveButton.click();

    const oauth = new McpOAuthPanel(page);
    await expect(page).toHaveURL((url) => url.pathname === `/tools/${NEW_MCP_TOOL_ID}/edit`);
    await oauth.expectStatus("Not connected");
    expect(lastSavedConfig(mockApi, "POST")).toMatchObject({ transportType: "Http", authType: "OAuth2", endpoint: "https://oauth-mcp.example.test/mcp" });
    await expect(editor.connectionMode).toHaveText("Shared (tenant-wide)");

    // The backend filled in the redirect uri; the UI keeps it when the tool is saved again.
    await editor.scopes.fill("records:read");
    await editor.saveButton.click();
    await new Toast(page).expectShown("Tool updated");
    expect(lastSavedConfig(mockApi).redirectUri).toBe("https://md.e2e.test/md/api/v1/tenant/tool/mcp/oauth/callback");
  });
});

test.describe("Arguments and environment variables (Stdio)", () => {
  test("arguments can be added, edited and removed, and the rest are renumbered", async ({ page, mockApi }) => {
    const editor = new McpEditorPage(page);
    await editor.gotoEdit(MCP_TOOL_IDS.stdio);
    await expect(editor.argument(1)).toHaveValue("server.js");
    await expect(editor.argument(2)).toHaveValue("--stdio");

    await editor.addArgument.click();
    await editor.argument(3).fill("--verbose");
    await editor.argument(1).fill("main.js");
    await editor.removeArgument(2).click();

    await expect(editor.argument(1)).toHaveValue("main.js");
    await expect(editor.argument(2)).toHaveValue("--verbose");
    await expect(editor.argument(3)).toHaveCount(0);

    await editor.saveButton.click();
    await new Toast(page).expectShown("Tool updated");
    expect(lastSavedConfig(mockApi).arguments).toEqual(["main.js", "--verbose"]);
  });

  test("an environment variable value is masked until it is revealed, and a variable can be removed", async ({ page, mockApi }) => {
    const editor = new McpEditorPage(page);
    await editor.gotoEdit(MCP_TOOL_IDS.stdio);
    await expect(editor.variableNames.first()).toHaveValue("E2E_API_BASE");
    await expect(editor.variableValues.first()).toHaveAttribute("type", "password");

    await editor.toggleEnvVariable("E2E_API_BASE").click();
    await expect(editor.variableValues.first()).toHaveAttribute("type", "text");
    await editor.toggleEnvVariable("E2E_API_BASE").click();
    await expect(editor.variableValues.first()).toHaveAttribute("type", "password");

    await editor.removeEnvVariable("E2E_API_BASE").click();
    await expect(editor.variableNames).toHaveCount(0);
    await editor.saveButton.click();
    await new Toast(page).expectShown("Tool updated");
    expect(lastSavedConfig(mockApi).environmentVariables).toEqual({});
  });

  test("a new environment variable starts as env_1 and can be renamed", async ({ page, mockApi }) => {
    const editor = new McpEditorPage(page);
    await editor.gotoCreate();
    await editor.selectToolType("MCP");
    await editor.fillBasics("E2E Variable Tool");

    await editor.addVariable.click();
    await expect(editor.variableNames).toHaveValue("env_1");
    await editor.variableNames.fill("E2E_FLAG");
    await editor.variableValues.fill("on");
    await editor.saveButton.click();

    await new Toast(page).expectShown("Tool created");
    expect(lastSavedConfig(mockApi, "POST").environmentVariables).toEqual({ E2E_FLAG: "on" });
  });

  test("a variable added after another one was removed overwrites an existing variable", async ({ page }) => {
    const editor = new McpEditorPage(page);
    await editor.gotoCreate();
    await editor.selectToolType("MCP");
    await editor.addVariable.click();
    await editor.addVariable.click();
    await expect(editor.variableNames.nth(0)).toHaveValue("env_1");
    await expect(editor.variableNames.nth(1)).toHaveValue("env_2");
    await editor.variableValues.nth(1).fill("keep-me");
    await editor.removeEnvVariable("env_1").click();
    await expect(editor.variableNames).toHaveCount(1);

    await editor.addVariable.click();

    // Known bug: see US 8186 item 52. The new key is `env_${count + 1}`, which is env_2 again, so the
    // existing env_2 is overwritten with an empty value instead of a second variable being added.
    // Repro: Tools > create > MCP > Add Variable twice > remove env_1 > Add Variable.
    // client/src/components/tools/config-editors/mcp-config-editor.tsx (Add Variable onClick, `env_${Object.keys(envVars).length + 1}`).
    await expect(editor.variableNames).toHaveCount(1);
    await expect(editor.variableNames.first()).toHaveValue("env_2");
    await expect(editor.variableValues.first()).toHaveValue("");
  });
});

test.describe("Http transport and additional headers", () => {
  test("switching the transport swaps the Stdio fields for the endpoint and keeps the other values", async ({ page }) => {
    const editor = new McpEditorPage(page);
    await editor.gotoEdit(MCP_TOOL_IDS.stdio);
    await expect(editor.transport).toHaveText("Stdio");
    await expect(editor.command).toHaveValue("node");
    await expect(editor.endpoint).toHaveCount(0);

    await editor.chooseTransport("Http");
    await expect(editor.endpoint).toBeVisible();
    await expect(editor.authType).toHaveText("None");
    await expect(editor.command).toHaveCount(0);
    await expect(editor.addArgument).toHaveCount(0);

    await editor.chooseTransport("Stdio");
    await expect(editor.command).toHaveValue("node");
    await expect(editor.argument(1)).toHaveValue("server.js");
  });

  test("an Http tool loads its endpoint and headers, and header edits are saved", async ({ page, mockApi }) => {
    const editor = new McpEditorPage(page);
    await editor.gotoEdit(MCP_TOOL_IDS.httpNoAuth);
    await expect(editor.transport).toHaveText("Http");
    await expect(editor.endpoint).toHaveValue("https://mcp.example.test/mcp");
    await expect(editor.variableNames).toHaveValue("X-E2E-Header");
    await expect(editor.variableValues).toHaveAttribute("type", "password");

    await editor.toggleHeader("X-E2E-Header").click();
    await expect(editor.variableValues).toHaveAttribute("type", "text");
    await editor.variableValues.fill("changed");
    await editor.endpoint.fill("https://mcp.example.test/v2");
    await editor.saveButton.click();

    await new Toast(page).expectShown("Tool updated");
    expect(lastSavedConfig(mockApi)).toMatchObject({
      transportType: "Http",
      endpoint: "https://mcp.example.test/v2",
      additionalHeaders: { "X-E2E-Header": "changed" },
    });
  });

  test("a header can be added and removed", async ({ page, mockApi }) => {
    const editor = new McpEditorPage(page);
    await editor.gotoEdit(MCP_TOOL_IDS.httpNoAuth);

    await editor.addVariable.click();
    await expect(editor.variableNames.nth(1)).toHaveValue("header_2");
    await editor.variableNames.nth(1).fill("X-E2E-Extra");
    await editor.variableValues.nth(1).fill("extra");
    await editor.removeHeader("X-E2E-Header").click();
    await expect(editor.variableNames).toHaveCount(1);

    await editor.saveButton.click();
    await new Toast(page).expectShown("Tool updated");
    expect(lastSavedConfig(mockApi).additionalHeaders).toEqual({ "X-E2E-Extra": "extra" });
  });

  test("a header added after another one was removed overwrites an existing header", async ({ page }) => {
    const editor = new McpEditorPage(page);
    await editor.gotoEdit(MCP_TOOL_IDS.httpNoAuth);
    await editor.addVariable.click();
    await editor.addVariable.click();
    await expect(editor.variableNames.nth(1)).toHaveValue("header_2");
    await expect(editor.variableNames.nth(2)).toHaveValue("header_3");
    await editor.variableValues.nth(2).fill("keep-me");
    await editor.removeHeader("header_2").click();
    await expect(editor.variableNames).toHaveCount(2);

    await editor.addVariable.click();

    // Known bug: see US 8186 item 52 (same cause for headers: `header_${count + 1}` repeats header_3).
    await expect(editor.variableNames).toHaveCount(2);
    await expect(editor.variableNames.nth(1)).toHaveValue("header_3");
    await expect(editor.variableValues.nth(1)).toHaveValue("");
  });

  test("an OAuth 2.1 tool loaded from the backend has no header section", async ({ page }) => {
    const editor = new McpEditorPage(page);
    await editor.gotoEdit(MCP_TOOL_IDS.oauthShared);

    await expect(editor.authType).toHaveText("OAuth 2.1");
    await expect(page.getByText("Additional Headers")).toHaveCount(0);
    await editor.chooseAuthType("None");
    await expect(page.getByText("Additional Headers")).toBeVisible();
    await expect(new McpOAuthPanel(page).title).toHaveCount(0);
  });
});

test.describe("Stored config normalisation", () => {
  test("legacy numeric enum values are shown as their names", async ({ page, mockApi }) => {
    store = installMcpToolsMocks(mockApi, {
      tools: [
        withMcpFields(store.tool(MCP_TOOL_IDS.oauthPerUser), {
          // A backend serialization bug briefly wrote the enums as integers: Http = 1, OAuth2 = 1, PerUser = 1.
          config: JSON.stringify({
            id: "e2e-legacy",
            transportType: 1,
            endpoint: "https://legacy-mcp.example.test/mcp",
            authType: 1,
            oAuthScope: 1,
            redirectUri: "https://md.e2e.test/md/api/v1/tenant/tool/mcp/oauth/callback",
          }),
        }),
      ],
    });
    const editor = new McpEditorPage(page);
    await editor.gotoEdit(MCP_TOOL_IDS.oauthPerUser);

    await expect(editor.transport).toHaveText("Http");
    await expect(editor.authType).toHaveText("OAuth 2.1");
    await expect(editor.connectionMode).toHaveText("Per-user");
  });

  test("an unknown transport falls back to Stdio", async ({ page, mockApi }) => {
    store = installMcpToolsMocks(mockApi, {
      tools: [withMcpFields(store.tool(MCP_TOOL_IDS.stdio), { config: JSON.stringify({ id: "e2e-odd", transportType: "WebSocket", command: "node" }) })],
    });
    const editor = new McpEditorPage(page);
    await editor.gotoEdit(MCP_TOOL_IDS.stdio);

    await expect(editor.transport).toHaveText("Stdio");
    await expect(editor.command).toHaveValue("node");
  });
});

test.describe("Saving an MCP tool", () => {
  test("a saved edit is sent as a full update and the page stays on the tool", async ({ page, mockApi }) => {
    const editor = new McpEditorPage(page);
    await editor.gotoEdit(MCP_TOOL_IDS.stdio);
    await editor.command.fill("python");
    await editor.saveButton.click();

    await new Toast(page).expectShown("Tool updated");
    await expect(page).toHaveURL((url) => url.pathname === `/tools/${MCP_TOOL_IDS.stdio}/edit`);
    const put = mockApi.requestsTo("PUT", TOOL_PATH).at(-1)?.body as Record<string, unknown>;
    expect(put).toMatchObject({ name: "E2E Stdio Server", type: "MCP", isActive: true, permissionsEnabled: false });
    expect(lastSavedConfig(mockApi)).toMatchObject({ id: "e2e-stdio-server", command: "python", arguments: ["server.js", "--stdio"] });
    expect(store.tool(MCP_TOOL_IDS.stdio).config).toContain('"command":"python"');
    // Nothing about permissions changed, so there is no "publish to apply" hint.
    await expect(page.getByTestId("tool-publish-hint")).toHaveCount(0);
  });

  test("an unsaved edit holds back Publish until the tool is saved", async ({ page }) => {
    const editor = new McpEditorPage(page);
    await editor.gotoEdit(MCP_TOOL_IDS.httpNoAuth);
    await expect(editor.publishBadge).toHaveText("Published");
    await expect(editor.publishButton).toBeVisible();

    await editor.endpoint.fill("https://mcp.example.test/v3");
    await expect(editor.publishDisabled).toBeVisible();
    await expect(editor.publishButton).toHaveCount(0);

    await editor.saveButton.click();
    await new Toast(page).expectShown("Tool updated");
    await expect(editor.publishButton).toBeVisible();
    await expect(editor.publishDisabled).toHaveCount(0);
    // The edit happened after the last publish.
    await expect(editor.publishBadge).toHaveText("Unpublished changes");
  });

  test.describe("when the backend rejects the save", () => {
    test.use({ allowedConsoleErrors: [FAILED_REQUEST_LOG] });

    test("shows the error and keeps the unsaved edit", async ({ page }) => {
      const editor = new McpEditorPage(page);
      await editor.gotoEdit(MCP_TOOL_IDS.stdio);
      // The tool was deleted in another tab: the update validator answers WKFLOMD0402 (ToolMustExist).
      store.tool(MCP_TOOL_IDS.stdio).isDeleted = true;
      await editor.command.fill("python");
      await editor.saveButton.click();

      await new Toast(page).expectShown(/Failed to update tool: 400: [\s\S]*WKFLOMD0402/);
      await expect(editor.command).toHaveValue("python");
      await expect(editor.publishDisabled).toBeVisible();
    });
  });
});
