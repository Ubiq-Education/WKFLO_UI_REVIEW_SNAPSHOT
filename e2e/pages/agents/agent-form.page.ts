import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

/** The agent form shared by `/agents/create` and `/agents/:id/edit`. */
export class AgentFormPage {
  readonly name: Locator;
  readonly description: Locator;
  readonly aiModel: Locator;
  readonly systemPrompt: Locator;
  /** Only rendered on the edit page. */
  readonly additionalInstructions: Locator;
  readonly stmSwitch: Locator;
  readonly ltmSwitch: Locator;
  readonly spinUpSwitch: Locator;
  readonly cancelButton: Locator;
  readonly toolMenuHint: Locator;

  constructor(readonly page: Page) {
    this.name = page.getByLabel("Agent Name");
    this.description = page.getByLabel("Description");
    this.aiModel = page.getByRole("combobox", { name: "AI Model" });
    this.systemPrompt = page.getByLabel("System Prompt");
    this.additionalInstructions = page.getByLabel("Additional Instructions");
    this.stmSwitch = page.getByRole("switch", { name: "Short Term Memory (STM)" });
    this.ltmSwitch = page.getByRole("switch", { name: "Long Term Memory (LTM)" });
    this.spinUpSwitch = page.getByRole("switch", { name: "Spin Up Agents" });
    this.cancelButton = page.getByRole("button", { name: "Cancel" });
    this.toolMenuHint = page.getByText("Select a tool to insert");
  }

  submitButton(label: string): Locator {
    return this.page.getByRole("button", { name: label });
  }

  async chooseModel(modelName: string): Promise<void> {
    await this.aiModel.click();
    await this.page.getByRole("option", { name: modelName }).click();
  }

  /** Types the text into the system prompt one key at a time, so the "/" tool menu reacts like it does for a user. */
  async typeInSystemPrompt(text: string): Promise<void> {
    await this.systemPrompt.click();
    await this.systemPrompt.pressSequentially(text);
  }

  toolMenuItem(toolName: string): Locator {
    return this.page.getByText(toolName, { exact: true }).locator("xpath=ancestor::div[contains(@class,'cursor-pointer')][1]");
  }

  async fill(values: { name: string; description: string; systemPrompt: string; model?: string }): Promise<void> {
    await this.name.fill(values.name);
    await this.description.fill(values.description);
    if (values.model) await this.chooseModel(values.model);
    await this.systemPrompt.fill(values.systemPrompt);
  }

  /** The validation message shown under a field (the form renders them as `<p>` after the field). */
  message(text: string): Locator {
    return this.page.getByText(text, { exact: true });
  }

  async expectValues(values: { name?: string; description?: string; systemPrompt?: string }): Promise<void> {
    if (values.name !== undefined) await expect(this.name).toHaveValue(values.name);
    if (values.description !== undefined) await expect(this.description).toHaveValue(values.description);
    if (values.systemPrompt !== undefined) await expect(this.systemPrompt).toHaveValue(values.systemPrompt);
  }
}
