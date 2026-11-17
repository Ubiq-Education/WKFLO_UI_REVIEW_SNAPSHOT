import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

/** The agent view page (/agents/view/:id): heading and tab list. Tab content has its own page objects. */
export class AgentViewPage {
  constructor(readonly page: Page) {}

  async goto(agentId = 1): Promise<void> {
    await this.page.goto(`/agents/view/${agentId}`);
    await expect(this.page.getByRole("heading", { level: 1 })).toBeVisible();
  }

  tab(name: string): Locator {
    return this.page.getByRole("tab", { name, exact: true });
  }

  async openTab(name: string): Promise<void> {
    await this.tab(name).click();
    await expect(this.tab(name)).toHaveAttribute("data-state", "active");
  }
}
