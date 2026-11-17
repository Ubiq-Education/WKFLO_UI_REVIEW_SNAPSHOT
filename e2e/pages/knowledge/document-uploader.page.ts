import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

export interface UploadFile {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

/** The "Document Uploader" tab of the Knowledge page. */
export class DocumentUploaderPage {
  readonly dropZone: Locator;
  readonly fileInput: Locator;
  readonly tagInput: Locator;
  readonly removeFileButton: Locator;
  readonly uploadButton: Locator;

  constructor(readonly page: Page) {
    this.dropZone = page.getByLabel("Document drop zone");
    this.fileInput = page.getByLabel("Choose document file");
    this.tagInput = page.getByPlaceholder("Add a tag and press Enter");
    this.removeFileButton = page.getByRole("button", { name: "Remove selected file" });
    this.uploadButton = page.getByRole("button", { name: /^(Upload Document|Uploading\.\.\.|Uploaded)$/ });
  }

  async open(): Promise<void> {
    await this.page.getByRole("tab", { name: "Document Uploader" }).click();
    await expect(this.dropZone).toBeVisible();
  }

  async chooseFile(file: UploadFile): Promise<void> {
    await this.fileInput.setInputFiles(file);
  }

  /** Dispatches dragover and drop events carrying the file, as a real drag from the desktop would. */
  async dropFile(file: UploadFile): Promise<void> {
    const dataTransfer = await this.page.evaluateHandle(
      ({ name, mimeType, content }) => {
        const transfer = new DataTransfer();
        // The bytes travel as base64 so binary files (PDF, Word, Excel) arrive unchanged.
        const bytes = Uint8Array.from(atob(content), (character) => character.charCodeAt(0));
        transfer.items.add(new File([bytes], name, { type: mimeType }));
        return transfer;
      },
      { name: file.name, mimeType: file.mimeType, content: file.buffer.toString("base64") },
    );
    await this.dropZone.dispatchEvent("dragover", { dataTransfer });
    await this.dropZone.dispatchEvent("drop", { dataTransfer });
  }

  async addTag(tag: string): Promise<void> {
    await this.tagInput.fill(tag);
    await this.tagInput.press("Enter");
  }

  tagRemoveButton(tag: string): Locator {
    return this.page.getByRole("button", { name: `Remove tag ${tag}` });
  }

  /** Clicks Upload and waits for the upload request to be answered. */
  async upload(): Promise<void> {
    const response = this.page.waitForResponse((r) => r.url().endsWith("/md/api/v1/tenant/knowledge/uploader"));
    await this.uploadButton.click();
    await response;
  }
}
