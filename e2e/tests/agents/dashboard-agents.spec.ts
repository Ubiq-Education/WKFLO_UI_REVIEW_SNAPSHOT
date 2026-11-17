import { expect, test } from "../../support/test";
import { installAgentsMocks } from "../../support/mocks/agents";

test.describe("Dashboard entry points into agents", () => {
  test.beforeEach(({ mockApi }) => installAgentsMocks(mockApi));

  test("the Agents card shows the agent count and opens the agents list", async ({ page, mockApi }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
    // The card shows the total from the API (the seed has three agents with this area's mocks).
    const card = page.locator("div.rounded-lg").filter({ hasText: "Total AI assistants" });
    await expect(card.getByText(String(mockApi.seed.agents.length), { exact: true })).toBeVisible();

    await card.click();

    await expect(page).toHaveURL((url) => url.pathname === "/agents");
    await expect(page.getByRole("heading", { level: 1, name: "Agents" })).toBeVisible();
  });

  test("the Create Agent quick action opens the create form", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("heading", { name: "Create Agent" }).click();

    await expect(page).toHaveURL((url) => url.pathname === "/agents/create");
    await expect(page.getByRole("heading", { level: 1, name: "Create New Agent" })).toBeVisible();
  });
});
