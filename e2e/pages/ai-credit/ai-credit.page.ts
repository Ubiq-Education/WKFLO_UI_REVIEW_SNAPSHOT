import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { ConfirmDialog } from "../components/confirm-dialog";

/** The AI Credit page (`/aimodels/:id/ai-credit`). */
export class AiCreditPage {
  readonly heading: Locator;
  readonly backButton: Locator;
  readonly deleteIconButton: Locator;
  readonly deleteDialog: ConfirmDialog;
  readonly createButton: Locator;
  readonly updateButton: Locator;

  constructor(readonly page: Page) {
    this.heading = page.getByRole("heading", { level: 1, name: "AI Credit Configuration" });
    this.backButton = page.getByRole("button", { name: /^(Back|Back to AI Models)$/ });
    this.deleteIconButton = page.getByRole("button", { name: "Delete AI Credit" });
    this.deleteDialog = new ConfirmDialog(page, "Delete AI Credit");
    this.createButton = page.getByRole("button", { name: "Create AI Credit" });
    this.updateButton = page.getByRole("button", { name: "Update AI Credit" });
  }

  async goto(modelId: number | string): Promise<void> {
    await this.page.goto(`/aimodels/${modelId}/ai-credit`);
  }

  field(label: string): Locator {
    return this.page.getByLabel(label, { exact: true });
  }

  get tokensIn(): Locator {
    return this.field("Tokens In");
  }
  get costIn(): Locator {
    return this.field("Cost In ($ per 1M tokens)");
  }
  get tokensOut(): Locator {
    return this.field("Tokens Out");
  }
  get costOut(): Locator {
    return this.field("Cost Out ($ per 1M tokens)");
  }
  get multiplierIn(): Locator {
    return this.field("Multiplier In");
  }
  get multiplierOut(): Locator {
    return this.field("Multiplier Out");
  }

  /** The value shown under a preview label ("Total Cost (preview)" or "Credits (preview)"). */
  preview(label: string): Locator {
    return this.page.getByText(label, { exact: true }).locator("xpath=following-sibling::p[1]");
  }

  async expectLoaded(modelName: string): Promise<void> {
    await expect(this.heading).toBeVisible();
    await expect(this.page.getByText(modelName, { exact: true })).toBeVisible();
  }
}
