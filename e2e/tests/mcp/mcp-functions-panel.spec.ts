import { expect, test } from "../../support/test";
import { McpEditorPage } from "../../pages/mcp/mcp-editor.page";
import { McpFunctionsPanel } from "../../pages/mcp/mcp-functions-panel.page";
import { McpOAuthPanel } from "../../pages/mcp/mcp-oauth-panel.page";
import { ConfirmDialog } from "../../pages/components/confirm-dialog";
import { Toast } from "../../pages/components/toast";
import { installMcpToolsMocks, lastBody, MCP_TOOL_IDS, type McpToolsStore } from "../../support/mocks/mcp-tools";

// The browser logs every non-2xx response as a console error; the error-path tests mock 400 on purpose.
const FAILED_REQUEST_LOG = /Failed to load resource: the server responded with a status of 400/;

const FUNCTIONS_PATH = "/md/api/v1/tenant/tool/:id/functions";
const DISCOVER_PATH = "/ai/api/v1/tenant/tool/:id/functions/discover";
const PUBLISH_HINT = "Saved. Publish the tool to apply these changes in chat.";

/** What the Http tool starts with: search_records and the Removed legacy_export are enabled. */
const ALL_NAMES = ["search_records", "get_record", "create_note", "list_tags", "legacy_export"];

let store: McpToolsStore;
test.beforeEach(({ mockApi }) => {
  store = installMcpToolsMocks(mockApi);
});

interface SavedFunctions {
  enabledFunctions: string[];
  functions?: Array<{ name: string; displayName: string | null; displayDescription: string | null }>;
}

const lastFunctionsPut = (mockApi: Parameters<typeof lastBody>[0]) => lastBody<SavedFunctions>(mockApi, "PUT", FUNCTIONS_PATH);

test.describe("Loading the functions", () => {
  test("lists every function with its description, status, display text and switch", async ({ page }) => {
    const editor = new McpEditorPage(page);
    const functions = new McpFunctionsPanel(page);
    await editor.gotoEdit(MCP_TOOL_IDS.httpNoAuth);

    await expect(functions.names()).toHaveText(ALL_NAMES);
    await expect(functions.discoveredOn).toHaveText(/^Last refreshed /);
    await expect(functions.count).toHaveText("2 of 5 enabled");
    await expect(functions.toggle("search_records")).toBeChecked();
    await expect(functions.toggle("get_record")).not.toBeChecked();
    await expect(functions.toggle("legacy_export")).toBeChecked();
    await expect(functions.row("search_records")).toContainText("Search records by keyword.");
    // Statuses: create_note is New, legacy_export is enabled but no longer offered by the server.
    await expect(functions.row("create_note").getByText("New", { exact: true })).toBeVisible();
    await expect(functions.row("legacy_export").getByText("Removed", { exact: true })).toBeVisible();
    await expect(functions.row("search_records").getByText(/^(New|Removed)$/)).toHaveCount(0);
    await expect(functions.save).toBeDisabled();
    await expect(functions.unsaved).toHaveCount(0);
  });

  test("a function with display text shows it, the server wording and the original name", async ({ page }) => {
    const editor = new McpEditorPage(page);
    const functions = new McpFunctionsPanel(page);
    await editor.gotoEdit(MCP_TOOL_IDS.httpNoAuth);

    const row = functions.row("get_record");
    await expect(row.getByTestId("mcp-function-display-name")).toHaveText("Look up record");
    await expect(row.getByTestId("mcp-function-display-description")).toHaveText("Finds one record by its ID.");
    await expect(row.getByTestId("mcp-function-server-description")).toHaveText("From the server: Fetch a single record by its ID.");
  });

  test("a tool whose functions were never loaded asks for a refresh", async ({ page }) => {
    const editor = new McpEditorPage(page);
    const functions = new McpFunctionsPanel(page);
    await editor.gotoEdit(MCP_TOOL_IDS.stdio);

    await expect(functions.discoveredOn).toHaveText("Not loaded from the server yet.");
    await expect(functions.state).toHaveText('No functions yet. Use "Refresh from server" to load the functions this MCP server offers.');
    await expect(functions.search).toHaveCount(0);
    await expect(functions.save).toHaveCount(0);
  });

  test("when permissions are off the switches are hidden and the selection comes back when they are turned on", async ({ page }) => {
    const editor = new McpEditorPage(page);
    const functions = new McpFunctionsPanel(page);
    await editor.gotoEdit(MCP_TOOL_IDS.httpNoAuth);
    await expect(functions.toggle("search_records")).toBeChecked();

    await editor.permissionsCheckbox.uncheck();

    await expect(functions.permissionsOffNote).toContainText("All functions are available to agents.");
    await expect(functions.root.getByRole("switch")).toHaveCount(0);
    await expect(functions.count).toHaveCount(0);
    await expect(functions.enableAll).toHaveCount(0);
    // Display text can still be edited.
    await expect(functions.displayToggle("search_records")).toBeVisible();

    await editor.permissionsCheckbox.check();
    await expect(functions.permissionsOffNote).toHaveCount(0);
    await expect(functions.toggle("search_records")).toBeChecked();
    await expect(functions.count).toHaveText("2 of 5 enabled");
  });
});

test.describe("Refreshing from the server", () => {
  test("the first refresh lists the functions as New and says to publish", async ({ page, mockApi }) => {
    const editor = new McpEditorPage(page);
    const functions = new McpFunctionsPanel(page);
    await editor.gotoEdit(MCP_TOOL_IDS.stdio);
    await expect(editor.publishBadge).toHaveText("Unpublished");

    await functions.refresh.click();

    await expect(functions.names()).toHaveText(["search_records", "get_record", "create_note", "list_tags"]);
    await expect(functions.discoveredOn).toHaveText(/^Last refreshed /);
    for (const name of ["search_records", "get_record", "create_note", "list_tags"]) {
      await expect(functions.row(name).getByText("New", { exact: true })).toBeVisible();
    }
    await expect(functions.publishHint).toHaveText(PUBLISH_HINT);
    expect(mockApi.requestsTo("POST", DISCOVER_PATH)).toHaveLength(1);
    expect(mockApi.requestsTo("POST", DISCOVER_PATH)[0].path).toContain(`/tool/${MCP_TOOL_IDS.stdio}/`);
    // Refreshing is not an unsaved change: Publish stays available.
    await expect(editor.publishButton).toBeVisible();
  });

  test("a refresh keeps the decisions and display text of known functions and flags new and gone ones", async ({ page }) => {
    // The server dropped list_tags and added export_report.
    store.serverFunctions = [
      ...store.serverFunctions.filter((fn) => fn.name !== "list_tags"),
      { name: "export_report", description: "Export a report.", inputSchema: null },
    ];
    const editor = new McpEditorPage(page);
    const functions = new McpFunctionsPanel(page);
    await editor.gotoEdit(MCP_TOOL_IDS.httpNoAuth);
    await expect(editor.publishBadge).toHaveText("Published");

    await functions.refresh.click();

    await expect(functions.names()).toHaveText(["search_records", "get_record", "create_note", "export_report", "legacy_export"]);
    await expect(functions.row("export_report").getByText("New", { exact: true })).toBeVisible();
    await expect(functions.row("legacy_export").getByText("Removed", { exact: true })).toBeVisible();
    await expect(functions.toggle("search_records")).toBeChecked();
    await expect(functions.toggle("export_report")).not.toBeChecked();
    await expect(functions.row("get_record").getByTestId("mcp-function-display-name")).toHaveText("Look up record");
    await expect(functions.count).toHaveText("2 of 5 enabled");
    // The draft tool changed after it was published.
    await expect(editor.publishBadge).toHaveText("Unpublished changes");
  });

  test("works for an OAuth tool once it is connected", async ({ page }) => {
    store.setOAuth(MCP_TOOL_IDS.oauthShared, { status: "Connected" });
    const editor = new McpEditorPage(page);
    const functions = new McpFunctionsPanel(page);
    await editor.gotoEdit(MCP_TOOL_IDS.oauthShared);

    await functions.refresh.click();

    await expect(functions.names()).toHaveText(["search_records", "get_record", "create_note", "list_tags"]);
  });

  test.describe("when it fails", () => {
    test.use({ allowedConsoleErrors: [FAILED_REQUEST_LOG] });

    test("an unreachable server is reported with its code and the list is kept", async ({ page }) => {
      store.discoverFails = true;
      const editor = new McpEditorPage(page);
      const functions = new McpFunctionsPanel(page);
      await editor.gotoEdit(MCP_TOOL_IDS.httpNoAuth);

      await functions.refresh.click();

      // Known bug: see US 8186 item 54. The panel prints the raw response body; the codes have no friendly message.
      await expect(functions.root.getByRole("alert")).toHaveText(/Couldn't load functions from the server: [\s\S]*"code":"WKFLOAI0406"/);
      await expect(functions.names()).toHaveText(ALL_NAMES);
      await expect(functions.refresh).toBeEnabled();
    });

    test("a connection that was lost since the status was read is reported", async ({ page }) => {
      store.setOAuth(MCP_TOOL_IDS.oauthShared, { status: "Connected" });
      const editor = new McpEditorPage(page);
      const functions = new McpFunctionsPanel(page);
      await editor.gotoEdit(MCP_TOOL_IDS.oauthShared);
      await new McpOAuthPanel(page).expectStatus("Connected");
      // The token was revoked in the meantime; the status is only polled every 5 seconds.
      store.setOAuth(MCP_TOOL_IDS.oauthShared, { status: "NotConnected" });

      await functions.refresh.click();

      await expect(functions.root.getByRole("alert")).toHaveText(/Couldn't load functions from the server: [\s\S]*"code":"WKFLOAI0405"/);
    });
  });
});

test.describe("Choosing functions", () => {
  test("a switch marks unsaved changes, Discard reverts them and Save sends the allowlist", async ({ page, mockApi }) => {
    const editor = new McpEditorPage(page);
    const functions = new McpFunctionsPanel(page);
    await editor.gotoEdit(MCP_TOOL_IDS.httpNoAuth);

    await functions.toggle("create_note").click();
    await expect(functions.count).toHaveText("3 of 5 enabled");
    await expect(functions.unsaved).toBeVisible();
    await expect(functions.save).toBeEnabled();

    await functions.discard.click();
    await expect(functions.count).toHaveText("2 of 5 enabled");
    await expect(functions.toggle("create_note")).not.toBeChecked();
    await expect(functions.unsaved).toHaveCount(0);
    await expect(functions.save).toBeDisabled();

    await functions.toggle("create_note").click();
    await functions.toggle("search_records").click();
    await functions.save.click();

    await expect(functions.publishHint).toHaveText(PUBLISH_HINT);
    await expect(functions.unsaved).toHaveCount(0);
    const saved = lastFunctionsPut(mockApi);
    expect([...saved!.enabledFunctions].sort()).toEqual(["create_note", "legacy_export"]);
    // Nothing about display text changed, so the body keeps the plain allowlist shape.
    expect(saved).not.toHaveProperty("functions");
    await expect(functions.toggle("create_note")).toBeChecked();
    await expect(functions.toggle("search_records")).not.toBeChecked();
    // Saving the allowlist reviews every function: none is New any more.
    await expect(functions.row("create_note").getByText("New", { exact: true })).toHaveCount(0);
  });

  test("Disable all and Enable all change every function, and none selected means all are available", async ({ page }) => {
    const editor = new McpEditorPage(page);
    const functions = new McpFunctionsPanel(page);
    await editor.gotoEdit(MCP_TOOL_IDS.httpNoAuth);

    await functions.disableAll.click();
    await expect(functions.count).toHaveText("No functions selected — all functions are available");
    await expect(functions.root.getByRole("switch", { checked: true })).toHaveCount(0);

    await functions.enableAll.click();
    await expect(functions.count).toHaveText("5 of 5 enabled");
    await expect(functions.root.getByRole("switch", { checked: false })).toHaveCount(0);
  });

  test("a Removed function can be turned off and then disappears", async ({ page, mockApi }) => {
    const editor = new McpEditorPage(page);
    const functions = new McpFunctionsPanel(page);
    await editor.gotoEdit(MCP_TOOL_IDS.httpNoAuth);
    // Nothing to set display text on: the server no longer offers it.
    await expect(functions.displayToggle("legacy_export")).toHaveCount(0);

    await functions.toggle("legacy_export").click();
    await functions.save.click();

    await expect(functions.names()).toHaveText(["search_records", "get_record", "create_note", "list_tags"]);
    expect(lastFunctionsPut(mockApi)?.enabledFunctions).toEqual(["search_records"]);
  });
});

test.describe("Searching", () => {
  test("filters by name, description and display text, ignoring case", async ({ page }) => {
    const editor = new McpEditorPage(page);
    const functions = new McpFunctionsPanel(page);
    await editor.gotoEdit(MCP_TOOL_IDS.httpNoAuth);

    await functions.search.fill("SEARCH_REC");
    await expect(functions.names()).toHaveText(["search_records"]);

    await functions.search.fill("keyword");
    await expect(functions.names()).toHaveText(["search_records"]);

    await functions.search.fill("look up");
    await expect(functions.names()).toHaveText(["get_record"]);

    await functions.search.fill("");
    await expect(functions.names()).toHaveText(ALL_NAMES);
  });

  test("shows a message when nothing matches", async ({ page }) => {
    const editor = new McpEditorPage(page);
    const functions = new McpFunctionsPanel(page);
    await editor.gotoEdit(MCP_TOOL_IDS.httpNoAuth);

    await functions.search.fill("  zzz  ");

    await expect(functions.state).toHaveText('No functions match "zzz".');
    await expect(functions.rows).toHaveCount(0);
    await expect(functions.enableAll).toBeDisabled();
  });

  test("Enable all shown and Disable all shown only touch the matching functions", async ({ page }) => {
    const editor = new McpEditorPage(page);
    const functions = new McpFunctionsPanel(page);
    await editor.gotoEdit(MCP_TOOL_IDS.httpNoAuth);

    await functions.search.fill("tag");
    await expect(functions.names()).toHaveText(["list_tags"]);
    await functions.root.getByRole("button", { name: "Enable all shown" }).click();
    await functions.search.fill("");
    await expect(functions.count).toHaveText("3 of 5 enabled");
    await expect(functions.toggle("list_tags")).toBeChecked();

    await functions.search.fill("records");
    await expect(functions.names()).toHaveText(["search_records"]);
    await functions.root.getByRole("button", { name: "Disable all shown" }).click();
    await functions.search.fill("");
    // search_records was shown and is now off; list_tags and legacy_export (not shown) are untouched.
    await expect(functions.toggle("list_tags")).toBeChecked();
    await expect(functions.toggle("search_records")).not.toBeChecked();
    await expect(functions.toggle("legacy_export")).toBeChecked();
    await expect(functions.count).toHaveText("2 of 5 enabled");
  });
});

test.describe("Display name and description", () => {
  test("shows the saved values with counters and sends only the changed function", async ({ page, mockApi }) => {
    const editor = new McpEditorPage(page);
    const functions = new McpFunctionsPanel(page);
    await editor.gotoEdit(MCP_TOOL_IDS.httpNoAuth);
    await expect(functions.displayToggle("get_record")).toHaveAttribute("aria-expanded", "false");

    const fields = await functions.displayFields("get_record");
    await expect(fields.displayName).toHaveValue("Look up record");
    await expect(fields.displayDescription).toHaveValue("Finds one record by its ID.");
    await expect(functions.row("get_record")).toContainText("14/100");
    await expect(functions.row("get_record")).toContainText("27/500");
    // An untouched function that is opened is not a change.
    await functions.displayFields("search_records");
    await expect(functions.unsaved).toHaveCount(0);

    await fields.displayName.fill("Find a record");
    await expect(functions.row("get_record")).toContainText("13/100");
    await expect(functions.unsaved).toBeVisible();
    await functions.save.click();

    await expect(functions.publishHint).toBeVisible();
    expect(lastFunctionsPut(mockApi)?.functions).toEqual([
      { name: "get_record", displayName: "Find a record", displayDescription: "Finds one record by its ID." },
    ]);
    await expect(functions.row("get_record").getByTestId("mcp-function-display-name")).toHaveText("Find a record");
  });

  test("clearing both fields falls back to the server's wording", async ({ page, mockApi }) => {
    const editor = new McpEditorPage(page);
    const functions = new McpFunctionsPanel(page);
    await editor.gotoEdit(MCP_TOOL_IDS.httpNoAuth);

    const fields = await functions.displayFields("get_record");
    await fields.displayName.fill("");
    await fields.displayDescription.fill("");
    await functions.save.click();

    await expect(functions.row("get_record").getByTestId("mcp-function-display-name")).toHaveCount(0);
    await expect(functions.row("get_record")).toContainText("Fetch a single record by its ID.");
    expect(lastFunctionsPut(mockApi)?.functions).toEqual([{ name: "get_record", displayName: null, displayDescription: null }]);
  });

  test("with permissions off only the display text is saved and the stored allowlist is sent unchanged", async ({ page, mockApi }) => {
    const editor = new McpEditorPage(page);
    const functions = new McpFunctionsPanel(page);
    await editor.gotoEdit(MCP_TOOL_IDS.httpNoAuth);
    await editor.permissionsCheckbox.uncheck();

    const fields = await functions.displayFields("create_note");
    await fields.displayName.fill("Add a note");
    await functions.save.click();

    await expect(functions.publishHint).toBeVisible();
    expect(lastFunctionsPut(mockApi)).toEqual({
      enabledFunctions: ["search_records", "legacy_export"],
      functions: [{ name: "create_note", displayName: "Add a note", displayDescription: null }],
    });
  });
});

test.describe("Publishing", () => {
  test("is held back while the functions have unsaved changes, and available once they are saved", async ({ page }) => {
    const editor = new McpEditorPage(page);
    const functions = new McpFunctionsPanel(page);
    await editor.gotoEdit(MCP_TOOL_IDS.httpNoAuth);
    await expect(editor.publishButton).toBeVisible();

    await functions.toggle("list_tags").click();
    await expect(editor.publishDisabled).toBeVisible();
    await expect(editor.publishButton).toHaveCount(0);
    await editor.publishDisabled.focus();
    await expect(page.getByRole("tooltip", { name: "Save your changes before publishing." })).toBeVisible();

    await functions.discard.click();
    await expect(editor.publishButton).toBeVisible();

    await functions.toggle("list_tags").click();
    await functions.save.click();
    await expect(editor.publishButton).toBeVisible();
    await expect(editor.publishDisabled).toHaveCount(0);
    await expect(editor.publishBadge).toHaveText("Unpublished changes");
  });

  test("a saved change can be published from the edit page", async ({ page }) => {
    const editor = new McpEditorPage(page);
    const functions = new McpFunctionsPanel(page);
    await editor.gotoEdit(MCP_TOOL_IDS.httpNoAuth);
    await functions.toggle("list_tags").click();
    await functions.save.click();
    await expect(editor.publishBadge).toHaveText("Unpublished changes");

    await editor.publishButton.click();
    const dialog = new ConfirmDialog(page, "Publish Tool");
    await dialog.expectText("Only saved changes are published.");
    await dialog.confirm("Publish");

    await new Toast(page).expectShown("Tool published");
    await expect(editor.publishBadge).toHaveText("Published");
    expect(store.tool(MCP_TOOL_IDS.httpNoAuth).enabledFunctions).toContain("list_tags");
  });
});

test.describe("Errors", () => {
  test.use({ allowedConsoleErrors: [FAILED_REQUEST_LOG] });

  test("a failed save is reported and keeps the unsaved choice", async ({ page }) => {
    const editor = new McpEditorPage(page);
    const functions = new McpFunctionsPanel(page);
    await editor.gotoEdit(MCP_TOOL_IDS.httpNoAuth);
    // The tool was deleted in another tab: the validator answers WKFLOMD0402 (ToolMustExist).
    store.tool(MCP_TOOL_IDS.httpNoAuth).isDeleted = true;

    await functions.toggle("list_tags").click();
    await functions.save.click();

    // Known bug: see US 8186 item 54 (raw response body instead of a friendly message).
    await expect(functions.root.getByRole("alert")).toHaveText(/Couldn't save functions: [\s\S]*"code":"WKFLOMD0402"/);
    await expect(functions.toggle("list_tags")).toBeChecked();
    await expect(functions.unsaved).toBeVisible();
    await expect(functions.save).toBeEnabled();
    await expect(editor.publishDisabled).toBeVisible();
  });

  test("changing a saved HTTP tool to MCP asks for functions the backend does not have yet", async ({ page, mockApi }) => {
    const editor = new McpEditorPage(page);
    const functions = new McpFunctionsPanel(page);
    await editor.gotoEdit(MCP_TOOL_IDS.http);

    await editor.selectToolType("MCP");

    // Known bug: see US 8186 item 55. The Functions panel appears as soon as the type is switched and asks the backend
    // for the functions of a tool that is still saved as HTTP (WKFLOMD0407), then prints the raw error.
    // Repro: edit an HTTP tool > Tool Type: MCP (before saving).
    // client/src/components/tools/config-editors/mcp-config-editor.tsx (`toolId ? <McpFunctionsPanel ...>`).
    await expect(functions.state).toContainText("Functions are unavailable right now:");
    await expect(functions.state).toContainText("WKFLOMD0407");
    expect(mockApi.requestsTo("GET", FUNCTIONS_PATH)).toHaveLength(1);
    expect(store.tool(MCP_TOOL_IDS.http).type).toBe("HTTP");
  });
});
