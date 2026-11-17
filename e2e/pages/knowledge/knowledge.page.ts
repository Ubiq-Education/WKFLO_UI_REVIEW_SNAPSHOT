import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { ConfirmDialog } from "../components/confirm-dialog";

/** The Knowledge page (`/knowledge`): its tab list and the Document Library tab. */
export class KnowledgePage {
  readonly heading: Locator;
  readonly libraryTab: Locator;
  readonly searchTab: Locator;
  readonly uploaderTab: Locator;
  readonly emptyMessage: Locator;
  readonly loadError: Locator;
  readonly deleteDialog: ConfirmDialog;

  constructor(readonly page: Page) {
    this.heading = page.getByRole("heading", { level: 1, name: "Knowledge Management" });
    this.libraryTab = page.getByRole("tab", { name: "Document Library" });
    this.searchTab = page.getByRole("tab", { name: "Knowledge Search" });
    this.uploaderTab = page.getByRole("tab", { name: "Document Uploader" });
    this.emptyMessage = page.getByText("No documents in your knowledge base yet.");
    this.loadError = page.getByText("Failed to load documents. Please try again.");
    this.deleteDialog = new ConfirmDialog(page, "Are you sure?");
  }

  async goto(): Promise<void> {
    await this.page.goto("/knowledge");
    await expect(this.heading).toBeVisible();
  }

  /** A document card: the grid child that holds the document's heading. It has no role or name. */
  card(fileName: string): Locator {
    return this.page
      .locator("div.grid > div")
      .filter({ has: this.page.getByRole("heading", { level: 3, name: fileName, exact: true }) });
  }

  cardHeading(fileName: string): Locator {
    return this.page.getByRole("heading", { level: 3, name: fileName, exact: true });
  }

  downloadButton(fileName: string): Locator {
    return this.card(fileName).getByRole("button", { name: "Download file" });
  }

  deleteButton(fileName: string): Locator {
    return this.card(fileName).getByRole("button", { name: `Delete ${fileName}` });
  }

  tagInput(fileName: string): Locator {
    return this.card(fileName).getByPlaceholder("Add tag and press Enter");
  }

  tagRemoveButton(fileName: string, tag: string): Locator {
    return this.card(fileName).getByRole("button", { name: `Remove tag ${tag}` });
  }

  async addTag(fileName: string, tag: string): Promise<void> {
    await this.tagInput(fileName).fill(tag);
    await this.tagInput(fileName).press("Enter");
  }
}
