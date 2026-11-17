import { expect, test } from "../../support/test";
import { McpEditorPage } from "../../pages/mcp/mcp-editor.page";
import { McpOAuthPanel } from "../../pages/mcp/mcp-oauth-panel.page";
import { Toast } from "../../pages/components/toast";
import { FAKE_CLIENT_SECRET, installMcpToolsMocks, lastSavedConfig, MCP_TOOL_IDS, type McpToolsStore } from "../../support/mocks/mcp-tools";

// The browser logs every non-2xx response as a console error; the error-path test mocks 400 on purpose.
const FAILED_REQUEST_LOG = /Failed to load resource: the server responded with a status of 400/;

const SECRET_SAVED = "Secret saved. Leave blank to keep it.";
const SECRET_OPTIONAL = "Optional for public / PKCE-only clients.";

let store: McpToolsStore;
test.beforeEach(({ mockApi }) => {
  store = installMcpToolsMocks(mockApi);
});

test.describe("OAuth client credentials", () => {
  test("a tool with saved credentials shows the client id and scopes, and never the secret", async ({ page }) => {
    const editor = new McpEditorPage(page);
    await editor.gotoEdit(MCP_TOOL_IDS.oauthShared);

    await expect(editor.clientId).toHaveValue("e2e-client-id");
    await expect(editor.scopes).toHaveValue("records:read");
    await expect(editor.clientSecret).toHaveValue("");
    await expect(editor.clientSecret).toHaveAttribute("placeholder", "••••••••");
    await expect(page.getByText(SECRET_SAVED)).toBeVisible();
    await expect(page.getByRole("button", { name: "Clear saved client secret" })).toBeVisible();
    await expect(page.getByText(FAKE_CLIENT_SECRET)).toHaveCount(0);
  });

  test("a tool without a secret says it is optional and offers nothing to clear", async ({ page }) => {
    const editor = new McpEditorPage(page);
    await editor.gotoEdit(MCP_TOOL_IDS.oauthPerUser);

    await expect(editor.clientId).toHaveValue("");
    await expect(editor.clientSecret).toHaveAttribute("placeholder", "Client secret");
    await expect(page.getByText(SECRET_OPTIONAL)).toBeVisible();
    await expect(page.getByRole("button", { name: "Clear saved client secret" })).toHaveCount(0);
  });

  test("the secret is masked until it is revealed", async ({ page }) => {
    const editor = new McpEditorPage(page);
    await editor.gotoEdit(MCP_TOOL_IDS.oauthPerUser);
    await editor.clientSecret.fill("e2e-typed-secret");
    await expect(editor.clientSecret).toHaveAttribute("type", "password");

    await page.getByRole("button", { name: "Show client secret" }).click();
    await expect(editor.clientSecret).toHaveAttribute("type", "text");
    await expect(page.getByRole("button", { name: "Hide client secret" })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Hide client secret" }).click();
    await expect(editor.clientSecret).toHaveAttribute("type", "password");
  });

  test("clearing the saved secret can be undone before saving", async ({ page }) => {
    const editor = new McpEditorPage(page);
    await editor.gotoEdit(MCP_TOOL_IDS.oauthShared);

    await page.getByRole("button", { name: "Clear saved client secret" }).click();
    await expect(page.getByText("Will be removed when you save.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Clear saved client secret" })).toHaveCount(0);

    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByText(SECRET_SAVED)).toBeVisible();
    await expect(page.getByRole("button", { name: "Undo" })).toHaveCount(0);
  });

  test("saving a cleared secret sends the clear flag, removes the secret and tells that connections were reset", async ({ page, mockApi }) => {
    const editor = new McpEditorPage(page);
    store.setOAuth(MCP_TOOL_IDS.oauthShared, { status: "Connected" });
    await editor.gotoEdit(MCP_TOOL_IDS.oauthShared);

    await page.getByRole("button", { name: "Clear saved client secret" }).click();
    await editor.saveButton.click();

    await new Toast(page).expectShown("Tool updated");
    const config = lastSavedConfig(mockApi);
    expect(config.clearClientSecret).toBe(true);
    expect(config).not.toHaveProperty("clientSecret");
    expect(config).not.toHaveProperty("hasClientSecret");
    await expect(page.getByText(SECRET_OPTIONAL)).toBeVisible();
    await expect(new McpOAuthPanel(page).resetNotice).toContainText("existing connections to this tool were reset");
    expect(JSON.parse(store.tool(MCP_TOOL_IDS.oauthShared).config).clientSecret ?? "").toBe("");
  });

  test("a new secret replaces the saved one, is sent once and is not kept in the form", async ({ page, mockApi }) => {
    const editor = new McpEditorPage(page);
    await editor.gotoEdit(MCP_TOOL_IDS.oauthShared);

    await editor.clientSecret.fill("e2e-replacement-secret");
    await expect(page.getByText("Replaces the saved secret when you save.")).toBeVisible();
    await editor.saveButton.click();

    await new Toast(page).expectShown("Tool updated");
    const first = lastSavedConfig(mockApi);
    expect(first.clientSecret).toBe("e2e-replacement-secret");
    expect(first).not.toHaveProperty("hasClientSecret");
    // The field is empty again and the secret counts as saved.
    await expect(editor.clientSecret).toHaveValue("");
    await expect(page.getByText(SECRET_SAVED)).toBeVisible();

    // A later save does not post the secret again.
    await editor.scopes.fill("records:read records:write");
    await editor.saveButton.click();
    await expect.poll(() => mockApi.requestsTo("PUT", "/md/api/v1/tenant/tool/:id").length).toBe(2);
    expect(lastSavedConfig(mockApi)).not.toHaveProperty("clientSecret");
  });

  test("a secret typed for a tool without a client id is flagged inline", async ({ page }) => {
    const editor = new McpEditorPage(page);
    await editor.gotoEdit(MCP_TOOL_IDS.oauthPerUser);

    await editor.clientSecret.fill("e2e-typed-secret");
    await expect(page.getByText("Enter a Client ID to use a client secret.")).toBeVisible();
    await expect(page.getByText("Stored encrypted when you save.")).toBeVisible();
    await editor.clientId.fill("e2e-client-id");
    await expect(page.getByText("Enter a Client ID to use a client secret.")).toHaveCount(0);
  });

  test.describe("when the backend rejects the secret", () => {
    test.use({ allowedConsoleErrors: [FAILED_REQUEST_LOG] });

    test("a secret without a client id is not saved", async ({ page, mockApi }) => {
      const editor = new McpEditorPage(page);
      await editor.gotoEdit(MCP_TOOL_IDS.oauthPerUser);
      await editor.clientSecret.fill("e2e-typed-secret");

      // The inline hint does not block Save: the backend answers WKFLOMD1204 (client secret requires a client id).
      await editor.saveButton.click();

      await new Toast(page).expectShown(/Failed to update tool: 400: [\s\S]*WKFLOMD1204/);
      await expect(editor.clientSecret).toHaveValue("e2e-typed-secret");
      expect(lastSavedConfig(mockApi).clientSecret).toBe("e2e-typed-secret");
      expect(JSON.parse(store.tool(MCP_TOOL_IDS.oauthPerUser).config).clientSecret ?? "").toBe("");
    });
  });

  test("changing the endpoint warns that the saved secret is dropped, and saving drops it", async ({ page, mockApi }) => {
    const editor = new McpEditorPage(page);
    await editor.gotoEdit(MCP_TOOL_IDS.oauthShared);
    const warning = page.getByTestId("mcp-oauth-secret-will-drop");
    await expect(warning).toHaveCount(0);

    await editor.endpoint.fill("https://other-mcp.example.test/mcp");
    await expect(warning).toContainText("removes the saved secret when you save");
    // Reverting the edit takes the warning away.
    await editor.endpoint.fill("https://oauth-mcp.example.test/mcp");
    await expect(warning).toHaveCount(0);

    await editor.endpoint.fill("https://other-mcp.example.test/mcp");
    await editor.saveButton.click();

    await new Toast(page).expectShown("Tool updated");
    expect(lastSavedConfig(mockApi)).not.toHaveProperty("clientSecret");
    await expect(page.getByText(SECRET_OPTIONAL)).toBeVisible();
    await expect(new McpOAuthPanel(page).resetNotice).toBeVisible();
  });

  test("changing the client id also warns about the saved secret", async ({ page }) => {
    const editor = new McpEditorPage(page);
    await editor.gotoEdit(MCP_TOOL_IDS.oauthShared);

    await editor.clientId.fill("e2e-other-client-id");

    await expect(page.getByTestId("mcp-oauth-secret-will-drop")).toBeVisible();
  });

  test("scopes are split on spaces and commas, deduplicated, and an empty box sends none", async ({ page, mockApi }) => {
    const editor = new McpEditorPage(page);
    await editor.gotoEdit(MCP_TOOL_IDS.oauthPerUser);

    await editor.scopes.fill("records:read, records:write  records:read");
    await editor.saveButton.click();
    await new Toast(page).expectShown("Tool updated");
    expect(lastSavedConfig(mockApi).scopes).toEqual(["records:read", "records:write"]);

    await editor.scopes.fill("");
    await editor.saveButton.click();
    await expect.poll(() => mockApi.requestsTo("PUT", "/md/api/v1/tenant/tool/:id").length).toBe(2);
    expect(lastSavedConfig(mockApi).scopes).toEqual([]);
  });

  test("the client id is trimmed when saved", async ({ page, mockApi }) => {
    const editor = new McpEditorPage(page);
    await editor.gotoEdit(MCP_TOOL_IDS.oauthPerUser);

    await editor.clientId.fill("  e2e-spaced-id  ");
    await editor.saveButton.click();

    await new Toast(page).expectShown("Tool updated");
    expect(lastSavedConfig(mockApi).clientId).toBe("e2e-spaced-id");
  });
});
