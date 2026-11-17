import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

/** The Spin-Up Agents tab: one labelled group per other agent in the tenant. */
export class SpinUpTab {
  constructor(private readonly page: Page) {}

  row(agentName: string): Locator {
    return this.page.getByRole("group", { name: agentName, exact: true });
  }

  toggle(agentName: string): Locator {
    return this.row(agentName).getByRole("button", { name: /^(Connect|Connected)$/ });
  }

  async expectConnected(agentName: string): Promise<void> {
    await expect(this.toggle(agentName)).toHaveText("Connected");
  }

  async expectDisconnected(agentName: string): Promise<void> {
    await expect(this.toggle(agentName)).toHaveText("Connect");
  }
}
