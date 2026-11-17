import { expect, test } from "../../support/test";
import { TestAgentChatPage } from "../../pages/chat/test-agent-chat.page";
import { Toast } from "../../pages/components/toast";
import { installChatMocks } from "../../support/mocks/chat";

// A 1x1 transparent PNG.
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

const textFile = (name: string, content = "Some notes.") => ({ name, mimeType: "text/plain", buffer: Buffer.from(content) });

test.describe("Test Agent chat: attachments", () => {
  test("attaches a document, shows it as a chip and sends it with the message", async ({ page, mockApi, hub }) => {
    const chatMocks = installChatMocks(mockApi);
    const chat = new TestAgentChatPage(page, hub);
    const toast = new Toast(page);
    await chat.open();

    await chat.attachInput.setInputFiles(textFile("notes.txt"));

    await toast.expectShown("Added 1 file(s).");
    await expect(chat.removeFileButton("notes.txt")).toBeVisible();
    await chat.send("Please read the notes");

    await expect.poll(() => chatMocks.sends().length).toBe(1);
    const body = chatMocks.sends()[0].body as { input: { text: string; files: Array<{ fileName: string; fileData: string; fileSize: number }> } };
    expect(body.input.text).toBe("Please read the notes");
    expect(body.input.files).toHaveLength(1);
    expect(body.input.files[0]).toMatchObject({ fileName: "notes.txt", fileSize: 11 });
    expect(body.input.files[0].fileData).toMatch(/^data:text\/plain;base64,/);
    // The chip is gone and the file shows in the conversation.
    await expect(chat.removeFileButton("notes.txt")).toHaveCount(0);
    await expect(page.getByText("notes.txt")).toBeVisible();
  });

  test("a file alone can be sent without text", async ({ page, mockApi, hub }) => {
    const chatMocks = installChatMocks(mockApi);
    const chat = new TestAgentChatPage(page, hub);
    await chat.open();
    await chat.attachInput.setInputFiles(textFile("only-file.txt"));
    await expect(chat.sendButton).toBeEnabled();

    await chat.sendButton.click();

    await expect.poll(() => chatMocks.sends().length).toBe(1);
    expect(chatMocks.sends()[0].body).toMatchObject({ input: { files: [{ fileName: "only-file.txt" }] } });
  });

  test("attaches an image and previews it", async ({ page, mockApi, hub }) => {
    installChatMocks(mockApi);
    const chat = new TestAgentChatPage(page, hub);
    await chat.open();

    await chat.attachInput.setInputFiles({ name: "picture.png", mimeType: "image/png", buffer: TINY_PNG });

    await expect(chat.removeFileButton("picture.png")).toBeVisible();
    await expect(page.getByRole("img", { name: "picture.png" })).toBeVisible();
  });

  test("a chip can be removed before sending", async ({ page, mockApi, hub }) => {
    const chatMocks = installChatMocks(mockApi);
    const chat = new TestAgentChatPage(page, hub);
    await chat.open();
    await chat.attachInput.setInputFiles(textFile("remove-me.txt"));

    await chat.removeFileButton("remove-me.txt").click();

    await expect(chat.removeFileButton("remove-me.txt")).toHaveCount(0);
    await expect(chat.sendButton).toBeDisabled();
    expect(chatMocks.sends()).toHaveLength(0);
  });

  test("the plus menu opens the file picker", async ({ page, mockApi, hub }) => {
    installChatMocks(mockApi);
    const chat = new TestAgentChatPage(page, hub);
    await chat.open();

    await chat.moreOptionsButton.click();
    const chooser = page.waitForEvent("filechooser");
    await page.getByText("Add photos & documents").click();
    await (await chooser).setFiles(textFile("from-picker.txt"));

    await expect(chat.removeFileButton("from-picker.txt")).toBeVisible();
  });

  test("document types the picker does not list are still accepted by the handler", async ({ page, mockApi, hub }) => {
    installChatMocks(mockApi);
    const chat = new TestAgentChatPage(page, hub);
    await chat.open();

    // Known bug: see US 8186. The file input's `accept` omits .csv/.xls/.xlsx, which the handler
    // and its error text accept, so the picker hides them.
    await expect(chat.attachInput).toHaveAttribute("accept", "image/*,.pdf,.doc,.docx,.txt,.rtf,.odt");
    await chat.attachInput.setInputFiles({ name: "table.csv", mimeType: "text/csv", buffer: Buffer.from("a,b\n1,2\n") });

    await expect(chat.removeFileButton("table.csv")).toBeVisible();
  });

  test("rejects a file type that is not allowed", async ({ page, mockApi, hub }) => {
    installChatMocks(mockApi);
    const chat = new TestAgentChatPage(page, hub);
    const toast = new Toast(page);
    await chat.open();

    await chat.attachInput.setInputFiles({ name: "setup.exe", mimeType: "application/octet-stream", buffer: Buffer.from("MZ") });

    await toast.expectShown("Invalid File Type");
    await toast.expectShown(/Please select image files \(jpg, png, gif\) or documents/);
    await expect(chat.removeFileButton("setup.exe")).toHaveCount(0);
  });

  test("rejects an image over 5.0 MB", async ({ page, mockApi, hub }) => {
    installChatMocks(mockApi);
    const chat = new TestAgentChatPage(page, hub);
    const toast = new Toast(page);
    await chat.open();

    await chat.attachInput.setInputFiles({ name: "huge.png", mimeType: "image/png", buffer: Buffer.alloc(5_000_001) });

    await toast.expectShown("Image Too Large");
    await toast.expectShown("huge.png exceeds the 5.0 MB limit.");
    await expect(chat.removeFileButton("huge.png")).toHaveCount(0);
  });

  test("keeps the valid files when some are rejected", async ({ page, mockApi, hub }) => {
    installChatMocks(mockApi);
    const chat = new TestAgentChatPage(page, hub);
    const toast = new Toast(page);
    await chat.open();

    await chat.attachInput.setInputFiles([textFile("good.txt"), { name: "bad.exe", mimeType: "application/octet-stream", buffer: Buffer.from("MZ") }]);

    await expect(chat.removeFileButton("good.txt")).toBeVisible();
    await toast.expectShown("Invalid File Type");
    await expect(chat.removeFileButton("bad.exe")).toHaveCount(0);
  });

  test("keeps at most five files per message", async ({ page, mockApi, hub }) => {
    installChatMocks(mockApi);
    const chat = new TestAgentChatPage(page, hub);
    const toast = new Toast(page);
    await chat.open();

    await chat.attachInput.setInputFiles(["a", "b", "c", "d", "e", "f"].map((letter) => textFile(`file-${letter}.txt`)));

    // Known bug: see US 8186: the sixth file is dropped silently and the toast counts it as added.
    await toast.expectShown("Added 6 file(s).");
    await expect(page.getByRole("button", { name: /^Remove file-/ })).toHaveCount(5);
    await expect(chat.removeFileButton("file-f.txt")).toHaveCount(0);
  });
});
