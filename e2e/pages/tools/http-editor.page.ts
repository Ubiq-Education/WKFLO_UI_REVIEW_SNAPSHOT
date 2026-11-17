import type { Locator, Page } from "@playwright/test";

/** The HTTP tool's config editor (inputs, structured request config, Test API tab). */
export class HttpEditorPage {
  readonly addInputButton: Locator;
  readonly methodSelect: Locator;
  readonly urlInput: Locator;
  readonly variablesButton: Locator;
  readonly addHeaderButton: Locator;
  readonly addParameterButton: Locator;
  readonly bodyInput: Locator;
  readonly structuredTab: Locator;
  readonly testTab: Locator;
  readonly runButton: Locator;

  constructor(readonly page: Page) {
    this.addInputButton = page.getByRole("button", { name: "Add Input" });
    this.methodSelect = page.getByRole("combobox", { name: "HTTP method" });
    this.urlInput = page.locator('input[data-field="url"]');
    this.variablesButton = page.getByRole("button", { name: "Show available variables" });
    this.addHeaderButton = page.getByRole("button", { name: "Add Header" });
    this.addParameterButton = page.getByRole("button", { name: "Add Parameter" });
    this.bodyInput = page.getByPlaceholder("Enter JSON or string body");
    this.structuredTab = page.getByRole("tab", { name: "Structured" });
    this.testTab = page.getByRole("tab", { name: "Test API" });
    this.runButton = page.getByRole("button", { name: "Run tool" });
  }

  async selectMethod(method: string): Promise<void> {
    await this.methodSelect.click();
    await this.page.getByRole("option", { name: method, exact: true }).click();
  }

  /** The row of one input in the Inputs list (identified by its `<h4>` name). */
  inputRow(name: string): Locator {
    return this.page
      .locator("div.border.rounded-md")
      .filter({ has: this.page.getByRole("heading", { level: 4, name, exact: true }) })
      .last();
  }

  headerNames(): Locator {
    return this.page.getByPlaceholder("Header name");
  }

  headerValues(): Locator {
    return this.page.getByPlaceholder("Header value");
  }

  parameterNames(): Locator {
    return this.page.getByPlaceholder("Parameter name");
  }

  parameterValues(): Locator {
    return this.page.getByPlaceholder("Parameter value or {{input}}");
  }

  /** The Test API tab's field for one input (placeholder `Enter <name>`). */
  testInput(name: string): Locator {
    return this.page.getByPlaceholder(`Enter ${name}`);
  }

  /** The "Available Variables" toast. */
  get variablesToast(): Locator {
    return this.page.locator('li[role="status"]').filter({ hasText: "Available Variables" });
  }
}
