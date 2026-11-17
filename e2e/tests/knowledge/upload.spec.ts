import { expect, test } from "../../support/test";
import { replyRaw } from "../../support/mock-api";
import { TENANT_A } from "../../support/fixtures";
import { KnowledgePage } from "../../pages/knowledge/knowledge.page";
import { DocumentUploaderPage, type UploadFile } from "../../pages/knowledge/document-uploader.page";
import { Toast } from "../../pages/components/toast";
import { errorReply, installKnowledgeMocks } from "../../support/mocks/knowledge";

// The browser logs every non-2xx response as a console error; the error-path tests mock these statuses on purpose.
const FAILED_REQUEST_LOG = /Failed to load resource: the server responded with a status of (413|500)/;

const PDF: UploadFile = { name: "e2e-upload.pdf", mimeType: "application/pdf", buffer: Buffer.from("E2E fake upload text") };
const PNG: UploadFile = { name: "e2e-image.png", mimeType: "image/png", buffer: Buffer.from("not a document") };

async function openUploader(page: import("@playwright/test").Page) {
  const knowledge = new KnowledgePage(page);
  const uploader = new DocumentUploaderPage(page);
  await knowledge.goto();
  await uploader.open();
  return { knowledge, uploader };
}

test.describe("Knowledge: document uploader", () => {
  test("shows the drop zone and keeps Upload disabled until a file is chosen", async ({ page, mockApi }) => {
    installKnowledgeMocks(mockApi);
    const { uploader } = await openUploader(page);

    await expect(page.getByText("Drag & drop your file here")).toBeVisible();
    await expect(page.getByText("Supported formats: PDF, Word (.doc, .docx), or Excel (.xls, .xlsx) files")).toBeVisible();
    await expect(uploader.uploadButton).toBeDisabled();
    expect(mockApi.requestsTo("POST", "/md/api/v1/tenant/knowledge/uploader")).toHaveLength(0);
  });

  test.describe("file input", () => {
    test("choosing a file shows its name and size, and Remove puts the drop zone back", async ({ page, mockApi }) => {
      installKnowledgeMocks(mockApi);
      const { uploader } = await openUploader(page);

      await uploader.chooseFile(PDF);

      await expect(uploader.dropZone).toContainText("e2e-upload.pdf");
      // 20 bytes
      await expect(uploader.dropZone).toContainText("0.02 KB");
      await expect(uploader.uploadButton).toBeEnabled();

      await uploader.removeFileButton.click();
      await expect(page.getByText("Drag & drop your file here")).toBeVisible();
      await expect(uploader.uploadButton).toBeDisabled();
      expect(mockApi.requestsTo("POST", "/md/api/v1/tenant/knowledge/uploader")).toHaveLength(0);
    });

    test("uploading sends the file and the tags as multipart form data, then the library lists the document", async ({ page, mockApi }) => {
      const store = installKnowledgeMocks(mockApi);
      const toast = new Toast(page);
      const { knowledge, uploader } = await openUploader(page);

      await uploader.chooseFile(PDF);
      await uploader.addTag("alpha");
      await uploader.addTag("beta");
      await uploader.upload();

      await toast.expectShown("File uploaded successfully");
      await expect(uploader.uploadButton).toHaveText("Uploaded");

      expect(store.uploads).toHaveLength(1);
      const [upload] = store.uploads;
      expect(upload.contentType).toMatch(/^multipart\/form-data; boundary=/);
      expect(upload.authorization).toMatch(/^Bearer .+/);
      expect(upload.tenantGuid).toBe(TENANT_A.guid);
      expect(upload.parts.map((part) => part.name)).toEqual(["file", "tags"]);
      const filePart = upload.parts[0];
      expect(filePart).toMatchObject({ filename: "e2e-upload.pdf", contentType: "application/pdf", value: "E2E fake upload text" });
      // The UI sends the tags as one JSON string field, which the endpoint deserialises into a list.
      expect(upload.parts[1].value).toBe('["alpha","beta"]');

      await knowledge.libraryTab.click();
      await expect(knowledge.cardHeading("e2e-upload.pdf")).toBeVisible();
      await expect(knowledge.tagRemoveButton("e2e-upload.pdf", "alpha")).toBeVisible();
      await expect(knowledge.tagRemoveButton("e2e-upload.pdf", "beta")).toBeVisible();
    });

    test("without tags the form field holds an empty JSON list", async ({ page, mockApi }) => {
      const store = installKnowledgeMocks(mockApi);
      const { uploader } = await openUploader(page);

      await uploader.chooseFile(PDF);
      await uploader.upload();

      await expect(uploader.uploadButton).toHaveText("Uploaded");
      expect(store.uploads[0].parts.find((part) => part.name === "tags")?.value).toBe("[]");
    });

    test("a removed tag is not sent, and blank tags are ignored", async ({ page, mockApi }) => {
      const store = installKnowledgeMocks(mockApi);
      const { uploader } = await openUploader(page);

      await uploader.chooseFile(PDF);
      await uploader.addTag("alpha");
      await uploader.addTag("   ");
      await uploader.addTag("beta");
      await uploader.tagRemoveButton("alpha").click();
      await expect(uploader.tagRemoveButton("alpha")).toHaveCount(0);
      await uploader.upload();

      await expect(uploader.uploadButton).toHaveText("Uploaded");
      expect(store.uploads[0].parts.find((part) => part.name === "tags")?.value).toBe('["beta"]');
    });

    test("choosing another file after an upload re-arms the button", async ({ page, mockApi }) => {
      installKnowledgeMocks(mockApi);
      const { uploader } = await openUploader(page);

      await uploader.chooseFile(PDF);
      await uploader.upload();
      await expect(uploader.uploadButton).toHaveText("Uploaded");

      await uploader.chooseFile({ name: "e2e-second.pdf", mimeType: "application/pdf", buffer: Buffer.from("second") });
      await expect(uploader.uploadButton).toHaveText("Upload Document");
    });

    test("the progress bar reads 100% after an upload and resets two seconds later", async ({ page, mockApi }) => {
      installKnowledgeMocks(mockApi);
      await page.clock.install();
      const { uploader } = await openUploader(page);

      await uploader.chooseFile(PDF);
      await uploader.upload();

      await expect(uploader.uploadButton).toHaveText("Uploaded");
      await expect(uploader.dropZone.getByText("100%")).toBeVisible();
      await page.clock.runFor(2100);
      await expect(uploader.dropZone.getByText("100%")).toHaveCount(0);
    });
  });

  test.describe("drop zone", () => {
    test("dragging a file over highlights the zone, dropping selects it and it uploads", async ({ page, mockApi }) => {
      const store = installKnowledgeMocks(mockApi);
      const toast = new Toast(page);
      const { uploader } = await openUploader(page);

      await uploader.dropZone.dispatchEvent("dragover");
      await expect(page.getByText("Drop your file here")).toBeVisible();
      await uploader.dropZone.dispatchEvent("dragleave");
      await expect(page.getByText("Drag & drop your file here")).toBeVisible();

      await uploader.dropFile(PDF);
      await expect(uploader.dropZone).toContainText("e2e-upload.pdf");
      await uploader.upload();

      await toast.expectShown("File uploaded successfully");
      expect(store.uploads[0].parts[0]).toMatchObject({ name: "file", filename: "e2e-upload.pdf" });
    });

    test("clicking the zone opens the file chooser", async ({ page, mockApi }) => {
      installKnowledgeMocks(mockApi);
      const { uploader } = await openUploader(page);

      const chooserPromise = page.waitForEvent("filechooser");
      await uploader.dropZone.click();
      const chooser = await chooserPromise;

      await chooser.setFiles(PDF);
      await expect(uploader.dropZone).toContainText("e2e-upload.pdf");
    });

    test("the drop zone is a plain div: no button role and not reachable by keyboard", async ({ page, mockApi }) => {
      installKnowledgeMocks(mockApi);
      const { uploader } = await openUploader(page);

      // Known bug: see US 8186 item 69. The zone only works with a mouse: it has an aria-label (the test hook) but no role,
      // so assistive technology does not announce it, and it has no tabindex, so the keyboard cannot reach it.
      await expect(uploader.dropZone).toBeVisible();
      await expect(uploader.dropZone).not.toHaveAttribute("role", /.+/);
      await expect(uploader.dropZone).not.toHaveAttribute("tabindex", /.*/);
      await expect(page.getByRole("button", { name: "Document drop zone" })).toHaveCount(0);
      await uploader.dropZone.focus();
      await expect(uploader.dropZone).not.toBeFocused();
    });

    test("dropping a file of an unsupported type is rejected", async ({ page, mockApi }) => {
      installKnowledgeMocks(mockApi);
      const toast = new Toast(page);
      const { uploader } = await openUploader(page);

      await uploader.dropFile(PNG);

      await toast.expectShown("Invalid file type");
      await expect(page.getByText("Drag & drop your file here")).toBeVisible();
      await expect(uploader.uploadButton).toBeDisabled();
    });
  });

  test.describe("validation", () => {
    test("a file with an unsupported extension is rejected with a toast and not selected", async ({ page, mockApi }) => {
      installKnowledgeMocks(mockApi);
      const toast = new Toast(page);
      const { uploader } = await openUploader(page);

      await uploader.chooseFile(PNG);

      await toast.expectShown("Invalid file type");
      await toast.expectShown("Only PDF, Word (.doc, .docx), and Excel (.xls, .xlsx) files are supported");
      await expect(uploader.dropZone).not.toContainText("e2e-image.png");
      await expect(uploader.uploadButton).toBeDisabled();
      expect(mockApi.requestsTo("POST", "/md/api/v1/tenant/knowledge/uploader")).toHaveLength(0);
    });

    test("a supported extension with a mismatching MIME type is rejected too", async ({ page, mockApi }) => {
      installKnowledgeMocks(mockApi);
      const toast = new Toast(page);
      const { uploader } = await openUploader(page);

      await uploader.chooseFile({ name: "e2e-renamed.pdf", mimeType: "image/png", buffer: Buffer.from("x") });

      await toast.expectShown("Invalid file type");
      await expect(uploader.uploadButton).toBeDisabled();
    });

    test("an invalid file replaces a previously chosen valid one", async ({ page, mockApi }) => {
      installKnowledgeMocks(mockApi);
      const { uploader } = await openUploader(page);

      await uploader.chooseFile(PDF);
      await expect(uploader.uploadButton).toBeEnabled();
      await uploader.chooseFile(PNG);

      await expect(page.getByText("Drag & drop your file here")).toBeVisible();
      await expect(uploader.uploadButton).toBeDisabled();
    });

    test("a .txt file is accepted although the copy lists only PDF, Word and Excel", async ({ page, mockApi }) => {
      installKnowledgeMocks(mockApi);
      const { uploader } = await openUploader(page);

      await uploader.chooseFile({ name: "e2e-notes.txt", mimeType: "text/plain", buffer: Buffer.from("notes") });

      // Known bug: see US 8186 item 62. The code allows .txt, the hint text and the input's accept list do not.
      await expect(uploader.dropZone).toContainText("e2e-notes.txt");
      await expect(uploader.uploadButton).toBeEnabled();
      await expect(uploader.fileInput).toHaveAttribute("accept", ".pdf,.doc,.docx,.xls,.xlsx");
    });
  });

  test.describe("server errors", () => {
    test.use({ allowedConsoleErrors: [FAILED_REQUEST_LOG] });

    test("an API error shows the generic failure toast and keeps the file for a retry", async ({ page, mockApi }) => {
      installKnowledgeMocks(mockApi);
      // HttpGlobalExceptionFilter: an unhandled exception answers 500 with WKFLO0001.
      mockApi.on("POST", "/md/api/v1/tenant/knowledge/uploader", () => errorReply(500, ["", "WKFLO0001"]));
      const toast = new Toast(page);
      const { uploader } = await openUploader(page);

      await uploader.chooseFile(PDF);
      await uploader.upload();

      await toast.expectShown("Upload failed");
      // The error body has no `message` field, so the UI falls back to its own text.
      await toast.expectShown("Failed to upload file");
      await expect(uploader.dropZone).toContainText("e2e-upload.pdf");
      await expect(uploader.uploadButton).toHaveText("Upload Document");
      await expect(uploader.uploadButton).toBeEnabled();
    });

    test("an oversized upload (413, empty body) leaks the JSON parser's message", async ({ page, mockApi }) => {
      installKnowledgeMocks(mockApi);
      // The MD API itself turns an oversized form read into 500 WKFLO0001; a bodiless 413 more plausibly comes from the
      // BFF or Kestrel request limit in front of it (unverified).
      mockApi.on("POST", "/md/api/v1/tenant/knowledge/uploader", () => replyRaw("", { status: 413 }));
      const toast = new Toast(page);
      const { uploader } = await openUploader(page);

      await uploader.chooseFile(PDF);
      await uploader.upload();

      await toast.expectShown("Upload failed");
      // Known bug: see US 8186 item 63. response.json() throws on the empty body and its message is shown to the user.
      await toast.expectShown(/Unexpected end of JSON input/);
      await expect(uploader.uploadButton).toBeEnabled();
    });
  });

  test("an empty file reports success although the API indexed nothing", async ({ page, mockApi }) => {
    const store = installKnowledgeMocks(mockApi);
    const toast = new Toast(page);
    const { knowledge, uploader } = await openUploader(page);

    await uploader.chooseFile({ name: "e2e-empty.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(0) });
    await uploader.upload();

    // Known bug: see US 8186 item 64. The endpoint skips 0-byte files and still answers 200 with an empty list.
    await toast.expectShown("File uploaded successfully");
    expect(store.uploads).toHaveLength(1);
    expect(store.documents.map((doc) => doc.fileName)).not.toContain("e2e-empty.pdf");
    await knowledge.libraryTab.click();
    await expect(knowledge.cardHeading("e2e-handbook.pdf")).toBeVisible();
    await expect(knowledge.cardHeading("e2e-empty.pdf")).toHaveCount(0);
  });

  test.describe("standard user", () => {
    test.use({ isSuperPowerUser: false });

    test("can upload a document", async ({ page, mockApi }) => {
      const store = installKnowledgeMocks(mockApi);
      const { uploader } = await openUploader(page);

      await uploader.chooseFile(PDF);
      await uploader.upload();

      await expect(uploader.uploadButton).toHaveText("Uploaded");
      expect(store.documents.map((doc) => doc.fileName)).toContain("e2e-upload.pdf");
    });
  });
});
