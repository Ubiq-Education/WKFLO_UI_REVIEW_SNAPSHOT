import type { Locator, Page } from "@playwright/test";

/** The "Functions" card of an MCP tool's edit page. */
export class McpFunctionsPanel {
  readonly root: Locator;
  readonly refresh: Locator;
  readonly discoveredOn: Locator;
  readonly state: Locator;
  readonly search: Locator;
  readonly count: Locator;
  readonly enableAll: Locator;
  readonly disableAll: Locator;
  readonly save: Locator;
  readonly discard: Locator;
  readonly unsaved: Locator;
  readonly publishHint: Locator;
  readonly rows: Locator;
  readonly permissionsOffNote: Locator;

  constructor(private readonly page: Page) {
    this.root = page.getByTestId("mcp-functions-panel");
    this.refresh = this.root.getByRole("button", { name: "Refresh from server" });
    this.discoveredOn = this.root.getByTestId("mcp-functions-discovered-on");
    this.state = this.root.getByTestId("mcp-functions-state");
    this.search = this.root.getByRole("textbox", { name: "Search functions" });
    this.count = this.root.getByTestId("mcp-functions-count");
    this.enableAll = this.root.getByRole("button", { name: /^Enable all/ });
    this.disableAll = this.root.getByRole("button", { name: /^Disable all/ });
    this.save = this.root.getByRole("button", { name: "Save functions" });
    this.discard = this.root.getByRole("button", { name: "Discard" });
    this.unsaved = this.root.getByText("Unsaved changes");
    this.publishHint = this.root.getByTestId("mcp-functions-publish-hint");
    this.rows = this.root.getByTestId("mcp-function-row");
    this.permissionsOffNote = this.root.getByTestId("mcp-functions-permissions-off-note");
  }

  /** The row of a function, found by its original name (always shown, in monospace). */
  row(name: string): Locator {
    // Function names are raw server data (e.g. "records.get"), so escape them before building the pattern.
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return this.rows.filter({ has: this.page.locator(".font-mono", { hasText: new RegExp(`^${escapedName}$`) }) });
  }

  toggle(name: string): Locator {
    return this.root.getByRole("switch", { name: `Enable ${name}` });
  }

  displayToggle(name: string): Locator {
    return this.root.getByRole("button", { name: `Display name and description for ${name}` });
  }

  /** Opens a row's display fields (if closed) and returns them. */
  async displayFields(name: string): Promise<{ displayName: Locator; displayDescription: Locator }> {
    const toggle = this.displayToggle(name);
    if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
    const row = this.row(name);
    return { displayName: row.getByRole("textbox", { name: "Display name" }), displayDescription: row.getByRole("textbox", { name: "Display description" }) };
  }

  /** The original function names listed, in order. */
  names(): Locator {
    return this.rows.locator(".font-mono");
  }
}
