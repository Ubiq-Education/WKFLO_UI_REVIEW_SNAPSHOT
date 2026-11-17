import { expect, test } from "../../support/test";
import { ManageAgentsPage } from "../../pages/marketplace/manage-agents.page";
import { TagsPanel } from "../../pages/components/tags-panel";
import { Toast } from "../../pages/components/toast";
import {
  ICON_HOST,
  PIXEL_PNG,
  installMarketplaceMocks,
  mockIconHost,
  unexpectedReply,
  type MarketplaceMocks,
} from "../../support/mocks/marketplace";

const EXPECTED_FAILURES = /Failed to load resource: the server responded with a status of (400|500)/;

const AGENT_PATH = "/md/api/v1/marketplace/agent/:id";
const ICON_PATH = "/md/api/v1/marketplace/agent/:id/icon";

/** A real 1x1 PNG: the endpoint decodes the content, so the mock only accepts real image bytes. */
const png = (name: string) => ({ name, mimeType: "image/png", buffer: PIXEL_PNG });

let market: MarketplaceMocks;

test.beforeEach(({ mockApi }) => {
  market = installMarketplaceMocks(mockApi);
});

test.describe("list", () => {
  test("shows every catalog agent with its details", async ({ page }) => {
    const manage = new ManageAgentsPage(page);
    await manage.goto();

    const row = manage.row("E2E Template Agent");
    await expect(row.getByRole("cell").nth(0)).toHaveText("1");
    await expect(row).toContainText("A template agent that answers questions.");
    await expect(row).toContainText("Chat");
    await expect(row.getByRole("cell").nth(4)).toHaveText("3");
    await expect(row).toContainText("No tags");
    await expect(manage.row("E2E Research Template").getByRole("cell").nth(4)).toHaveText("7");
  });

  test("an agent without an icon shows its initials", async ({ page }) => {
    const manage = new ManageAgentsPage(page);
    await manage.goto();

    await expect(manage.row("E2E Template Agent")).toContainText("ET");
    await expect(manage.row("E2E Research Template")).toContainText("ER");
  });

  test("search narrows the list by name, ignoring case", async ({ page }) => {
    const manage = new ManageAgentsPage(page);
    await manage.goto();
    await expect(manage.row("E2E Template Agent")).toBeVisible();

    await manage.searchBox.fill("RESEARCH");

    await expect(manage.row("E2E Research Template")).toBeVisible();
    await expect(manage.row("E2E Template Agent")).toHaveCount(0);
  });

  test("a search with no match shows the empty state", async ({ page }) => {
    const manage = new ManageAgentsPage(page);
    await manage.goto();

    await manage.searchBox.fill("no such agent");

    await expect(manage.emptyState).toBeVisible();
  });

  test("an empty catalog shows the empty state", async ({ page }) => {
    market.store.agents.forEach((agent) => (agent.isDeleted = true));
    const manage = new ManageAgentsPage(page);
    await manage.goto();

    await expect(manage.emptyState).toBeVisible();
    await expect(manage.page.getByText("Agents appear here once a tenant shares one to the Marketplace.")).toBeVisible();
  });

  test.describe("when loading fails", () => {
    test.use({ allowedConsoleErrors: [EXPECTED_FAILURES] });

    test("shows the raw error and Retry loads the list", async ({ page, mockApi }) => {
      mockApi.on("GET", "/md/api/v1/marketplace/agents", () => unexpectedReply());
      const manage = new ManageAgentsPage(page);
      await manage.goto();
      await expect(manage.loadError).toBeVisible();
      await expect(page.getByText(/^500: .*"code":"WKFLO0001"/)).toBeVisible();

      installMarketplaceMocks(mockApi, { store: market.store });
      await manage.retryButton.click();

      await expect(manage.row("E2E Template Agent")).toBeVisible();
      await expect(manage.loadError).toHaveCount(0);
    });
  });
});

test.describe("edit dialog", () => {
  test("opens with the agent's current values", async ({ page }) => {
    const manage = new ManageAgentsPage(page);
    await manage.goto();

    await manage.openEdit("E2E Research Template");

    await expect(manage.nameInput).toHaveValue("E2E Research Template");
    await expect(manage.descriptionInput).toHaveValue("A template agent that summarises documents.");
    await expect(manage.modelSelect).toHaveText("E2E Model");
    await expect(manage.memorySwitch).toBeChecked();
    await expect(manage.editDialog).toContainText("catalog id 2");
  });

  test("Cancel closes it without saving", async ({ page, mockApi }) => {
    const manage = new ManageAgentsPage(page);
    await manage.goto();
    await manage.openEdit("E2E Template Agent");
    await manage.nameInput.fill("E2E Renamed Agent");

    await manage.cancelButton.click();

    await expect(manage.editDialog).toBeHidden();
    expect(mockApi.requestsTo("PUT", AGENT_PATH)).toHaveLength(0);
    await expect(manage.row("E2E Template Agent")).toBeVisible();
  });

  test("saving sends every field, toasts, closes and updates the row", async ({ page, mockApi }) => {
    const manage = new ManageAgentsPage(page);
    const toast = new Toast(page);
    await manage.goto();
    await manage.openEdit("E2E Template Agent");

    await manage.nameInput.fill("E2E Renamed Agent");
    await manage.descriptionInput.fill("A longer description for the renamed agent.");
    await manage.memorySwitch.click();
    await manage.saveButton.click();

    await toast.expectShown("Agent updated");
    await toast.expectShown("Marketplace agent has been updated successfully.");
    await expect(manage.editDialog).toBeHidden();
    const [put] = mockApi.requestsTo("PUT", "/md/api/v1/marketplace/agent/1");
    expect(put.body).toEqual({
      id: 1,
      name: "E2E Renamed Agent",
      description: "A longer description for the renamed agent.",
      // The dialog does not edit the prompt; it carries the stored one through.
      systemPrompt: "You are a template.",
      aiModelId: 1,
      iconUrl: null,
      enableSTM: true,
    });
    await expect(manage.row("E2E Renamed Agent")).toContainText("A longer description for the renamed agent.");
    await expect(manage.row("E2E Template Agent")).toHaveCount(0);
  });

  test.describe("validation", () => {
    test("a name under 3 characters and a description under 10 are rejected without a request", async ({ page, mockApi }) => {
      const manage = new ManageAgentsPage(page);
      await manage.goto();
      await manage.openEdit("E2E Template Agent");

      await manage.nameInput.fill("ab");
      await manage.descriptionInput.fill("too short");
      await manage.saveButton.click();

      await expect(manage.editDialog.getByText("Name must be at least 3 characters")).toBeVisible();
      await expect(manage.editDialog.getByText("Description must be at least 10 characters")).toBeVisible();
      await expect(manage.editDialog).toBeVisible();
      expect(mockApi.requestsTo("PUT", AGENT_PATH)).toHaveLength(0);
    });

    test("the messages clear once the values are valid", async ({ page }) => {
      const manage = new ManageAgentsPage(page);
      await manage.goto();
      await manage.openEdit("E2E Template Agent");
      await manage.nameInput.fill("ab");
      await manage.saveButton.click();
      await expect(manage.editDialog.getByText("Name must be at least 3 characters")).toBeVisible();

      await manage.nameInput.fill("abc");

      await expect(manage.editDialog.getByText("Name must be at least 3 characters")).toHaveCount(0);
    });
  });

  test.describe("server rejections", () => {
    test.use({ allowedConsoleErrors: [EXPECTED_FAILURES] });

    test("a name over 300 characters is a raw 400 and the dialog stays open", async ({ page }) => {
      const manage = new ManageAgentsPage(page);
      const toast = new Toast(page);
      await manage.goto();
      await manage.openEdit("E2E Template Agent");

      await manage.nameInput.fill("N".repeat(301));
      await manage.saveButton.click();

      await toast.expectShown(/Failed to update agent: 400: .*"code":"WKFLOMD0004".*"property":"Name"/);
      await expect(manage.editDialog).toBeVisible();
      await expect(manage.saveButton).toBeEnabled();
    });

    test("an agent deleted meanwhile is a raw 400", async ({ page }) => {
      const manage = new ManageAgentsPage(page);
      const toast = new Toast(page);
      await manage.goto();
      await manage.openEdit("E2E Template Agent");
      market.store.agents[0].isDeleted = true;

      await manage.saveButton.click();

      await toast.expectShown(/Failed to update agent: 400: .*"code":"WKFLOMD0302"/);
    });
  });
});

test.describe("icon", () => {
  test("a PNG is uploaded as the multipart field 'file' and previewed", async ({ page, mockApi }) => {
    await mockIconHost(page);
    const manage = new ManageAgentsPage(page);
    await manage.goto();
    await manage.openEdit("E2E Template Agent");

    await manage.iconInput.setInputFiles(png("team-icon.png"));

    await expect(manage.editDialog.getByRole("img", { name: "E2E Template Agent icon" })).toHaveAttribute(
      "src",
      new RegExp(`^${ICON_HOST}/marketplace-agent/1/e2e-icon-\\d+\\.png$`),
    );
    const uploads = mockApi.requestsTo("POST", ICON_PATH);
    expect(uploads).toHaveLength(1);
    expect(String(uploads[0].body)).toContain('name="file"; filename="team-icon.png"');
    // The upload alone saves nothing on the agent.
    expect(mockApi.requestsTo("PUT", AGENT_PATH)).toHaveLength(0);
  });

  test("Save sends the uploaded icon URL and the list shows it", async ({ page, mockApi }) => {
    await mockIconHost(page);
    const manage = new ManageAgentsPage(page);
    const toast = new Toast(page);
    await manage.goto();
    await manage.openEdit("E2E Template Agent");
    await manage.iconInput.setInputFiles(png("team-icon.png"));
    const preview = manage.editDialog.getByRole("img", { name: "E2E Template Agent icon" });
    await expect(preview).toBeVisible();
    const iconUrl = (await preview.getAttribute("src")) ?? "";

    await manage.saveButton.click();

    await toast.expectShown("Agent updated");
    const [put] = mockApi.requestsTo("PUT", "/md/api/v1/marketplace/agent/1");
    expect((put.body as { iconUrl: string }).iconUrl).toBe(iconUrl);
    await expect(manage.row("E2E Template Agent").getByRole("img", { name: "E2E Template Agent icon" })).toHaveAttribute("src", iconUrl);
  });

  test("a file that is not PNG, JPEG or WEBP is refused without a request", async ({ page, mockApi }) => {
    const manage = new ManageAgentsPage(page);
    await manage.goto();
    await manage.openEdit("E2E Template Agent");

    await manage.iconInput.setInputFiles({ name: "animation.gif", mimeType: "image/gif", buffer: Buffer.from("gif") });

    await expect(manage.uploadError).toHaveText("Only PNG, JPEG, or WEBP images are supported.");
    expect(mockApi.requestsTo("POST", ICON_PATH)).toHaveLength(0);
  });

  test("a file over 5MB is refused without a request", async ({ page, mockApi }) => {
    const manage = new ManageAgentsPage(page);
    await manage.goto();
    await manage.openEdit("E2E Template Agent");

    await manage.iconInput.setInputFiles({ name: "big.png", mimeType: "image/png", buffer: Buffer.alloc(5 * 1024 * 1024 + 1) });

    await expect(manage.uploadError).toHaveText("Image must be 5MB or smaller.");
    expect(mockApi.requestsTo("POST", ICON_PATH)).toHaveLength(0);
  });

  test.describe("when the server cannot decode the image", () => {
    test.use({ allowedConsoleErrors: [EXPECTED_FAILURES] });

    test("shows a generic message because the error body has no message", async ({ page, mockApi }) => {
      const manage = new ManageAgentsPage(page);
      await manage.goto();
      await manage.openEdit("E2E Template Agent");

      await manage.iconInput.setInputFiles({ name: "team-icon.png", mimeType: "image/png", buffer: Buffer.from("this is not an image") });

      // Known bug: see US 8186 item 78 (marketplace-agent-icon-upload-service.ts:42 reads message / title only,
      // but the backend answers { resultType, errors: [{ code: "WKFLOMD1101" }] }, so every server-side reason is hidden)
      await expect(manage.uploadError).toHaveText("Failed to upload image");
      expect(mockApi.requestsTo("POST", ICON_PATH)).toHaveLength(1);
      await expect(manage.editDialog.getByRole("img", { name: "E2E Template Agent icon" })).toHaveCount(0);
    });
  });
});

test.describe("tags", () => {
  test("the dialog names the agent and its catalog id", async ({ page }) => {
    const manage = new ManageAgentsPage(page);
    await manage.goto();

    await manage.openTags("E2E Research Template");

    await expect(manage.tagsDialog).toContainText("Manage Tags — E2E Research Template");
    await expect(manage.tagsDialog).toContainText("catalog id 2");
    await expect(manage.tagsDialog).toContainText("Marketplace agent #2");
    await expect(manage.tagsDialog.getByText("No tags assigned yet.")).toBeVisible();
  });

  test("assigning a tag posts it for the catalog id, and the list shows it after the dialog closes", async ({ page, mockApi }) => {
    const manage = new ManageAgentsPage(page);
    const tags = new TagsPanel(page);
    await manage.goto();
    await manage.openTags("E2E Template Agent");

    await tags.assign("E2E Tag");

    await tags.expectAssigned("E2E Tag");
    const [post] = mockApi.requestsTo("POST", "/md/api/v1/tenant/tag/1/entity");
    expect(post.body).toEqual({ id: 1, entityType: "Agent", entityId: 1 });
    await manage.tagsDialog.getByRole("button", { name: "Close" }).click();
    await expect(manage.tagsDialog).toBeHidden();
    await expect(manage.row("E2E Template Agent")).toContainText("E2E Tag");
    await expect(manage.row("E2E Template Agent")).not.toContainText("No tags");
    await expect(manage.row("E2E Research Template")).toContainText("No tags");
  });

  test("removing a tag deletes the assignment, and the list drops it", async ({ page, mockApi }) => {
    mockApi.entityTags.set("Agent:1", [1]);
    const manage = new ManageAgentsPage(page);
    const tags = new TagsPanel(page);
    await manage.goto();
    await expect(manage.row("E2E Template Agent")).toContainText("E2E Tag");
    await manage.openTags("E2E Template Agent");

    await tags.remove("E2E Tag");

    await tags.expectNoTags();
    expect(mockApi.requestsTo("DELETE", "/md/api/v1/tenant/tag/1/entity/Agent/1")).toHaveLength(1);
    await manage.tagsDialog.getByRole("button", { name: "Close" }).click();
    await expect(manage.row("E2E Template Agent")).toContainText("No tags");
  });
});
