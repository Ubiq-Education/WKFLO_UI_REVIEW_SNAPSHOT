import type { Page } from "@playwright/test";
import { expect, test } from "../support/test";
import { replyRaw } from "../support/mock-api";
import { AgentViewPage } from "../pages/agent-view/agent-view.page";
import { PermissionsDialog } from "../pages/agent-view/permissions-dialog";
import { ToolsTab } from "../pages/agent-view/tools-tab";
import { installAgentViewTabsMocks, permissionsError, TOOL_HTTP_ID, TOOL_MCP_ID } from "../support/mocks/agent-view-tabs";

const HTTP_TOOL = "E2E Lookup Tool";
const MCP_TOOL = "E2E Directory Tool";
const PERMISSIONS_PATH = "/md/api/v1/tenant/agent/:id/tools/permissions";

/** Looks a tool up by id, so a tool added to the shared seed can't shift these tests onto another one. */
const toolById = <T extends { id: number }>(state: { tools: T[] }, id: number): T => {
  const found = state.tools.find((tool) => tool.id === id);
  if (!found) throw new Error(`No tool with id ${id} in the mock state`);
  return found;
};

/** Opens the permissions dialog of a connected tool from the Tools tab. */
async function openDialog(page: Page, toolName: string) {
  const view = new AgentViewPage(page);
  await view.goto();
  await view.openTab("Tools");
  await new ToolsTab(page).permissionsButton(toolName).click();
  const dialog = new PermissionsDialog(page, toolName);
  await expect(dialog.root).toBeVisible();
  return dialog;
}

test.describe("tool permissions dialog: single permission (non-MCP tool)", () => {
  test("shows one All functions row with the saved permission", async ({ page, mockApi }) => {
    const state = installAgentViewTabsMocks(mockApi, { connectedToolIds: [TOOL_HTTP_ID] });
    toolById(state, TOOL_HTTP_ID).permissionsEnabled = true;
    toolById(state, TOOL_HTTP_ID).permission = "Ask";

    const dialog = await openDialog(page, HTTP_TOOL);

    await expect(dialog.control("All functions")).toBeVisible();
    await dialog.expectChosen("All functions", "Ask for permission");
    await expect(dialog.bulkButton("Always allow")).toHaveCount(0);
    await expect(dialog.saveButton).toBeDisabled();
  });

  test("a tool with no permission set defaults to Always block", async ({ page, mockApi }) => {
    const state = installAgentViewTabsMocks(mockApi, { connectedToolIds: [TOOL_HTTP_ID] });
    toolById(state, TOOL_HTTP_ID).permissionsEnabled = true;

    const dialog = await openDialog(page, HTTP_TOOL);

    await dialog.expectChosen("All functions", "Always block");
  });

  test("saving sends the single permission and confirms it", async ({ page, mockApi }) => {
    const state = installAgentViewTabsMocks(mockApi, { connectedToolIds: [TOOL_HTTP_ID] });
    toolById(state, TOOL_HTTP_ID).permissionsEnabled = true;
    toolById(state, TOOL_HTTP_ID).permission = "Ask";
    const dialog = await openDialog(page, HTTP_TOOL);

    await dialog.choose("All functions", "Always allow");
    await expect(dialog.saveButton).toBeEnabled();
    await dialog.saveButton.click();

    await expect(dialog.savedMessage).toHaveText("Permissions saved. Publish the agent to apply these permissions in chat.");
    await expect(dialog.closeButton).toBeVisible();
    await expect(dialog.saveButton).toBeDisabled();
    expect(mockApi.requestsTo("PUT", PERMISSIONS_PATH)[0].body).toEqual({ tools: [{ toolId: TOOL_HTTP_ID, permission: "Allow" }] });
    expect(toolById(state, TOOL_HTTP_ID).permission).toBe("Allow");

    await dialog.closeButton.click();
    await expect(dialog.root).toBeHidden();
  });

  test("Cancel discards a change", async ({ page, mockApi }) => {
    const state = installAgentViewTabsMocks(mockApi, { connectedToolIds: [TOOL_HTTP_ID] });
    toolById(state, TOOL_HTTP_ID).permissionsEnabled = true;
    toolById(state, TOOL_HTTP_ID).permission = "Ask";
    const dialog = await openDialog(page, HTTP_TOOL);
    await dialog.choose("All functions", "Always block");
    await dialog.expectChosen("All functions", "Always block");

    await dialog.cancelButton.click();
    await expect(dialog.root).toBeHidden();
    await new ToolsTab(page).permissionsButton(HTTP_TOOL).click();

    await dialog.expectChosen("All functions", "Ask for permission");
    expect(mockApi.requestsTo("PUT", PERMISSIONS_PATH)).toHaveLength(0);
  });

  test("an inactive tool shows a notice but can still be edited", async ({ page, mockApi }) => {
    const state = installAgentViewTabsMocks(mockApi, { connectedToolIds: [TOOL_HTTP_ID] });
    toolById(state, TOOL_HTTP_ID).permissionsEnabled = true;
    toolById(state, TOOL_HTTP_ID).isActive = false;

    const dialog = await openDialog(page, HTTP_TOOL);

    await expect(dialog.root.getByText("This tool is switched off")).toBeVisible();
    await dialog.choose("All functions", "Always allow");
    await expect(dialog.saveButton).toBeEnabled();
  });
});

test.describe("tool permissions dialog: per-function permissions (MCP tool)", () => {
  test("lists each enabled function with its friendly name or raw name", async ({ page, mockApi }) => {
    installAgentViewTabsMocks(mockApi, { connectedToolIds: [TOOL_MCP_ID] });

    const dialog = await openDialog(page, MCP_TOOL);

    await expect(dialog.root.getByText("Shows every entry.")).toBeVisible();
    await dialog.expectChosen("List entries", "Always allow");
    // No friendly name: the raw function name is the row label.
    await dialog.expectChosen("delete_entry", "Always block");
    await expect(dialog.root.getByRole("group", { name: "Permission for All functions" })).toHaveCount(0);
  });

  test("per-function toggles save the full function list and never a single permission", async ({ page, mockApi }) => {
    const state = installAgentViewTabsMocks(mockApi, { connectedToolIds: [TOOL_MCP_ID] });
    const dialog = await openDialog(page, MCP_TOOL);

    await dialog.choose("delete_entry", "Ask for permission");
    await dialog.saveButton.click();

    await expect(dialog.savedMessage).toBeVisible();
    expect(mockApi.requestsTo("PUT", PERMISSIONS_PATH)[0].body).toEqual({
      tools: [
        {
          toolId: TOOL_MCP_ID,
          functions: [
            { name: "list_entries", permission: "Allow" },
            { name: "delete_entry", permission: "Ask" },
          ],
        },
      ],
    });
    expect(toolById(state, TOOL_MCP_ID).functions?.map((f) => f.permission)).toEqual(["Allow", "Ask"]);
  });

  test("the bulk buttons set every function at once", async ({ page, mockApi }) => {
    installAgentViewTabsMocks(mockApi, { connectedToolIds: [TOOL_MCP_ID] });
    const dialog = await openDialog(page, MCP_TOOL);
    // Mixed to start: neither bulk button reads as active.
    await expect(dialog.bulkButton("Always allow")).toHaveAttribute("aria-pressed", "false");

    await dialog.bulkButton("Ask for permission").click();

    await expect(dialog.bulkButton("Ask for permission")).toHaveAttribute("aria-pressed", "true");
    await dialog.expectChosen("List entries", "Ask for permission");
    await dialog.expectChosen("delete_entry", "Ask for permission");

    await dialog.bulkButton("Always allow").click();
    await dialog.expectChosen("delete_entry", "Always allow");
    await dialog.saveButton.click();

    await expect(dialog.savedMessage).toBeVisible();
    expect(mockApi.requestsTo("PUT", PERMISSIONS_PATH)[0].body).toEqual({
      tools: [
        {
          toolId: TOOL_MCP_ID,
          functions: [
            { name: "list_entries", permission: "Allow" },
            { name: "delete_entry", permission: "Allow" },
          ],
        },
      ],
    });
  });

  test("a function that has no saved permission shows as Always block", async ({ page, mockApi }) => {
    const state = installAgentViewTabsMocks(mockApi, { connectedToolIds: [TOOL_MCP_ID] });
    toolById(state, TOOL_MCP_ID).functions![0].permission = null;

    const dialog = await openDialog(page, MCP_TOOL);

    await dialog.expectChosen("List entries", "Always block");
  });

  test("an MCP tool without enabled functions explains what to do", async ({ page, mockApi }) => {
    const state = installAgentViewTabsMocks(mockApi, { connectedToolIds: [TOOL_MCP_ID] });
    toolById(state, TOOL_MCP_ID).functions = [];

    const dialog = await openDialog(page, MCP_TOOL);

    await expect(dialog.root.getByText("No functions are enabled on this tool yet.")).toBeVisible();
    await expect(dialog.bulkButton("Always allow")).toHaveCount(0);
  });
});

test.describe("tool permissions dialog: save errors", () => {
  test.use({ allowedConsoleErrors: [/Failed to load resource/] });

  const cases: Array<{ codes: string[]; text: string }> = [
    { codes: ["WKFLOMD0001"], text: "The request listed the same tool more than once. Reload the page and try again." },
    { codes: ["WKFLOMD0002"], text: "Some permission details were missing. Reload the page and try again." },
    { codes: ["WKFLOMD0101"], text: "Your workspace couldn't be identified. Reload the page and try again." },
    { codes: ["WKFLOMD0102"], text: "Your workspace couldn't be identified. Reload the page and try again." },
    { codes: ["WKFLOMD0302"], text: "This agent no longer exists." },
    { codes: ["WKFLOMD0303"], text: "This agent no longer exists." },
    { codes: ["WKFLOMD0409"], text: "This tool is no longer connected to the agent. Reload the page to see its current tools." },
    {
      codes: ["WKFLOMD0410"],
      text: 'Permissions are not managed for this tool. Turn on "Manage permissions for this tool" on the tool first.',
    },
    { codes: ["WKFLOMD0411"], text: "One of the chosen permissions isn't valid. Choose Always allow, Ask for permission or Always block." },
    { codes: ["WKFLOMD0412"], text: "This tool takes a single permission for all of its functions." },
    { codes: ["WKFLOMD0413"], text: "This MCP tool takes a permission per function." },
    { codes: ["WKFLOMD0414"], text: "One of these functions is no longer enabled on the tool. Reload the page to see its current functions." },
    // Two codes: both messages, joined.
    {
      codes: ["WKFLOMD0412", "WKFLOMD0411"],
      text: "This tool takes a single permission for all of its functions. One of the chosen permissions isn't valid. Choose Always allow, Ask for permission or Always block.",
    },
    // An unknown code falls back to the generic text, and the raw code is never shown.
    { codes: ["WKFLOMD9999"], text: "Couldn't save the permissions. Please try again." },
  ];

  for (const { codes, text } of cases) {
    test(`maps ${codes.join(" + ")} to friendly text`, async ({ page, mockApi }) => {
      const state = installAgentViewTabsMocks(mockApi, { connectedToolIds: [TOOL_HTTP_ID] });
      toolById(state, TOOL_HTTP_ID).permissionsEnabled = true;
      mockApi.on("PUT", PERMISSIONS_PATH, () => permissionsError(...codes));
      const dialog = await openDialog(page, HTTP_TOOL);

      await dialog.choose("All functions", "Always allow");
      await dialog.saveButton.click();

      await expect(dialog.error).toHaveText(text);
      await expect(dialog.root).not.toContainText("WKFLOMD");
      // The dialog stays open on the change, so the user can retry.
      await expect(dialog.saveButton).toBeEnabled();
      await expect(dialog.savedMessage).toHaveCount(0);
    });
  }

  test("a 404 without an error body means the agent is gone", async ({ page, mockApi }) => {
    const state = installAgentViewTabsMocks(mockApi, { connectedToolIds: [TOOL_HTTP_ID] });
    toolById(state, TOOL_HTTP_ID).permissionsEnabled = true;
    mockApi.on("PUT", PERMISSIONS_PATH, () => replyRaw("Not found", { status: 404, contentType: "text/plain" }));
    const dialog = await openDialog(page, HTTP_TOOL);

    await dialog.choose("All functions", "Always allow");
    await dialog.saveButton.click();

    await expect(dialog.error).toHaveText("This agent no longer exists.");
  });

  test("a server error without a known code gives the generic text", async ({ page, mockApi }) => {
    const state = installAgentViewTabsMocks(mockApi, { connectedToolIds: [TOOL_HTTP_ID] });
    toolById(state, TOOL_HTTP_ID).permissionsEnabled = true;
    mockApi.on("PUT", PERMISSIONS_PATH, () => replyRaw("Boom", { status: 500, contentType: "text/plain" }));
    const dialog = await openDialog(page, HTTP_TOOL);

    await dialog.choose("All functions", "Always allow");
    await dialog.saveButton.click();

    await expect(dialog.error).toHaveText("Couldn't save the permissions. Please try again.");
  });

  test("the error is cleared when the dialog is opened again", async ({ page, mockApi }) => {
    const state = installAgentViewTabsMocks(mockApi, { connectedToolIds: [TOOL_HTTP_ID] });
    toolById(state, TOOL_HTTP_ID).permissionsEnabled = true;
    mockApi.on("PUT", PERMISSIONS_PATH, () => permissionsError("WKFLOMD0412"));
    const dialog = await openDialog(page, HTTP_TOOL);
    await dialog.choose("All functions", "Always allow");
    await dialog.saveButton.click();
    await expect(dialog.error).toBeVisible();

    await dialog.cancelButton.click();
    await expect(dialog.root).toBeHidden();
    await new ToolsTab(page).permissionsButton(HTTP_TOOL).click();

    await expect(dialog.root).toBeVisible();
    await expect(dialog.error).toHaveCount(0);
  });
});
