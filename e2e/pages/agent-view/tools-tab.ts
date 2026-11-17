import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

/** The Tools tab: one labelled group per tenant tool with Connect / Add to Prompt / Permissions buttons. */
export class ToolsTab {
  constructor(private readonly page: Page) {}

  row(toolName: string): Locator {
    return this.page.getByRole("group", { name: toolName, exact: true });
  }

  connectButton(toolName: string): Locator {
    return this.row(toolName).getByRole("button", { name: /^(Connect|Connected)$/ });
  }

  addToPromptButton(toolName: string): Locator {
    return this.row(toolName).getByRole("button", { name: "Add to Prompt" });
  }

  removeFromPromptButton(toolName: string): Locator {
    return this.row(toolName).getByRole("button", { name: `Remove ${toolName} from prompt` });
  }

  permissionsButton(toolName: string): Locator {
    return this.row(toolName).getByRole("button", { name: "Permissions" });
  }

  async expectConnected(toolName: string): Promise<void> {
    await expect(this.connectButton(toolName)).toHaveText("Connected");
  }

  async expectDisconnected(toolName: string): Promise<void> {
    await expect(this.connectButton(toolName)).toHaveText("Connect");
  }
}
