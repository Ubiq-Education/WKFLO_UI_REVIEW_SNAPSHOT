import { expect, test } from "../../support/test";
import { SharePage } from "../../pages/share/share-page";
import {
  BROKEN_ICON_URL,
  failShareRequest,
  FAILED_RESOURCE_ERROR,
  installIconAssets,
  installSharePagesMocks,
  SHARE_PATHS,
  UPLOADED_ICON_URL,
  VALID_ICON_URL,
  waitForSave,
} from "../../support/mocks/share-pages";

// The seeded and typed settings point icons and the CSS URL at the fake CDN.
test.beforeEach(async ({ page }) => {
  await installIconAssets(page);
});

/** Saves the panel and returns the decoded PUT body. */
async function save(share: SharePage, mockApi: Parameters<typeof waitForSave>[0]) {
  const before = mockApi.requestsTo("PUT", SHARE_PATHS.save).length;
  await share.panel.saveButton.click();
  return waitForSave(mockApi, before);
}

test.describe("loading the stored settings", () => {
  test("fills every visual field of the panel from the saved chat setting", async ({ page, mockApi }) => {
    installSharePagesMocks(mockApi, {
      setting: {
        primaryColor: "#10b981",
        foregroundColor: "#111827",
        bubbleStyle: "Square",
        showDescription: false,
        chainOfThought: true,
        headerTitle: "Ask E2E",
        welcomeMessage: "Hello there",
        footerMessage: "Footer text",
        cssUrl: "https://assets.e2e.test/widget.css",
      },
    });
    const share = new SharePage(page, "chat-ui");
    await share.goto();
    const panel = share.panel;

    // The primary colour's hex field lives in a popover, its value is also printed next to the swatch.
    await expect(page.getByText("#10b981", { exact: true })).toBeVisible();
    await expect(panel.foregroundColorHex).toHaveValue("#111827");
    // The API's casing is normalised ("Square" -> "square").
    await expect(panel.bubbleStyle).toContainText("Square");
    await expect(panel.showDescription).not.toBeChecked();
    await expect(panel.chainOfThought).toBeChecked();
    await expect(panel.headerTitle).toHaveValue("Ask E2E");
    await expect(panel.welcomeMessage).toHaveValue("Hello there");
    await expect(panel.footerMessage).toHaveValue("Footer text");
    await expect(panel.cssUrl).toHaveValue("https://assets.e2e.test/widget.css");
    await expect(panel.apiEndpoint).toHaveValue("https://api.e2e.test");
    await expect(panel.authType).toContainText("None");
  });
});

test.describe("colours", () => {
  test("a preset swatch sets the primary colour and is saved", async ({ page, mockApi }) => {
    installSharePagesMocks(mockApi);
    const share = new SharePage(page, "chat-ui");
    await share.goto();

    await share.panel.pickPresetColor("Green");

    await expect(share.panel.primaryColorHex).toHaveValue("#10b981");
    await expect(page.getByText("#10b981", { exact: true })).toBeVisible();
    expect(await save(share, mockApi)).toMatchObject({ primaryColor: "#10b981" });
  });

  test("a custom hex value is accepted and a partial one is ignored", async ({ page, mockApi }) => {
    installSharePagesMocks(mockApi);
    const share = new SharePage(page, "chat-ui");
    await share.goto();
    await page.getByRole("button", { name: "Choose Color" }).click();

    await share.panel.primaryColorHex.fill("#12");
    // The field only takes complete #rrggbb values, so the partial one snaps back.
    await expect(share.panel.primaryColorHex).toHaveValue("#3b82f6");

    await share.panel.primaryColorHex.fill("#abcdef");
    await expect(share.panel.primaryColorHex).toHaveValue("#abcdef");
    await page.keyboard.press("Escape");
    expect(await save(share, mockApi)).toMatchObject({ primaryColor: "#abcdef" });
  });

  test("the colour picker input changes the primary colour", async ({ page, mockApi }) => {
    installSharePagesMocks(mockApi);
    const share = new SharePage(page, "chat-ui");
    await share.goto();
    await page.getByRole("button", { name: "Choose Color" }).click();

    await page.getByLabel("Primary color picker").fill("#123456");

    await expect(share.panel.primaryColorHex).toHaveValue("#123456");
  });

  test("the foreground colour has White and Near black shortcuts and a custom hex field", async ({ page, mockApi }) => {
    installSharePagesMocks(mockApi);
    const share = new SharePage(page, "chat-ui");
    await share.goto();
    await expect(share.panel.foregroundColorHex).toHaveValue("#ffffff");

    await page.getByRole("button", { name: "Near black" }).click();
    await expect(share.panel.foregroundColorHex).toHaveValue("#111827");
    expect(await save(share, mockApi)).toMatchObject({ foregroundColor: "#111827" });

    await page.getByRole("button", { name: "White" }).click();
    await expect(share.panel.foregroundColorHex).toHaveValue("#ffffff");

    await share.panel.foregroundColorHex.fill("#a1b2c3");
    await expect(share.panel.foregroundColorHex).toHaveValue("#a1b2c3");
    expect(await save(share, mockApi)).toMatchObject({ foregroundColor: "#a1b2c3" });
  });
});

test.describe("bubble style, launcher and toggles", () => {
  test("the message bubble style is saved", async ({ page, mockApi }) => {
    installSharePagesMocks(mockApi);
    const share = new SharePage(page, "chat-ui");
    await share.goto();
    await expect(share.panel.bubbleStyle).toContainText("Rounded");

    await share.panel.choose(share.panel.bubbleStyle, "Pill");

    await expect(share.panel.bubbleStyle).toContainText("Pill");
    expect(await save(share, mockApi)).toMatchObject({ bubbleStyle: "pill" });
  });

  test("the Chat UI page has no floating launcher settings", async ({ page, mockApi }) => {
    installSharePagesMocks(mockApi);
    const share = new SharePage(page, "chat-ui");
    await share.goto();

    await expect(page.getByRole("heading", { name: "Visual Styling" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Floating Launcher (closed state)" })).toHaveCount(0);
    await expect(share.panel.position).toHaveCount(0);
    await expect(share.panel.launcherShape).toHaveCount(0);
  });

  test("the widget page saves position and launcher shape, and the pill text field appears for the pill shape", async ({ page, mockApi }) => {
    installSharePagesMocks(mockApi);
    const share = new SharePage(page, "chat-widget");
    await share.goto();
    await expect(share.panel.position).toContainText("Bottom right");
    await expect(share.panel.launcherShape).toContainText("Circle icon");
    await expect(share.panel.pillText).toHaveCount(0);

    await share.panel.choose(share.panel.position, "Bottom left");
    await share.panel.choose(share.panel.launcherShape, "Pill with text");
    await share.panel.pillText.fill("Need a hand?");

    const body = await save(share, mockApi);
    expect(body).toMatchObject({ floatingPosition: "left", launcherStyle: "pill", launcherText: "Need a hand?", isWidget: true });

    await share.panel.choose(share.panel.launcherShape, "Circle icon");
    await expect(share.panel.pillText).toHaveCount(0);
  });

  test("the description and chain-of-thought switches are saved", async ({ page, mockApi }) => {
    installSharePagesMocks(mockApi);
    const share = new SharePage(page, "chat-ui");
    await share.goto();
    await expect(share.panel.showDescription).toBeChecked();
    await expect(share.panel.chainOfThought).not.toBeChecked();

    await share.panel.showDescription.click();
    await share.panel.chainOfThought.click();

    await expect(share.panel.showDescription).not.toBeChecked();
    await expect(share.panel.chainOfThought).toBeChecked();
    expect(await save(share, mockApi)).toMatchObject({ showDescription: false, chainOfThought: true });
  });
});

test.describe("branding fields", () => {
  test("header title, welcome message, footer and CSS URL are saved and reach the preview", async ({ page, mockApi }) => {
    installSharePagesMocks(mockApi);
    const share = new SharePage(page, "chat-ui");
    await share.goto();

    await share.panel.headerTitle.fill("Ask the E2E bot");
    await share.panel.welcomeMessage.fill("Welcome, tester");
    await share.panel.footerMessage.fill("Tests only");
    await share.panel.cssUrl.fill("https://assets.e2e.test/chat.css");

    // Field values are not text nodes, so these matches are the live preview.
    await expect(page.getByText("Ask the E2E bot", { exact: true })).toBeVisible();
    await expect(page.getByText("Welcome, tester", { exact: true })).toBeVisible();
    // The footer field's textarea also holds the text as its content, so there are two matches.
    await expect(page.getByText("Tests only", { exact: true }).first()).toBeVisible();
    expect(await save(share, mockApi)).toMatchObject({
      headerTitle: "Ask the E2E bot",
      welcomeMessage: "Welcome, tester",
      footerMessage: "Tests only",
      cssUrl: "https://assets.e2e.test/chat.css",
    });
  });
});

test.describe("icons", () => {
  test.use({ allowedConsoleErrors: [FAILED_RESOURCE_ERROR] });

  test("a working icon URL shows a preview and a broken one falls back to the placeholder", async ({ page, mockApi }) => {
    installSharePagesMocks(mockApi);
    await installIconAssets(page);
    const share = new SharePage(page, "chat-ui");
    await share.goto();
    await expect(share.panel.iconPreview("bubble")).toHaveCount(0);

    await share.panel.bubbleIconUrl.fill(VALID_ICON_URL);
    await expect(share.panel.iconPreview("bubble")).toBeVisible();

    const broken = page.waitForResponse(BROKEN_ICON_URL);
    await share.panel.bubbleIconUrl.fill(BROKEN_ICON_URL);
    await broken;
    await expect(share.panel.iconPreview("bubble")).toHaveCount(0);

    await share.panel.chatbotIconUrl.fill(VALID_ICON_URL);
    await expect(share.panel.iconPreview("chatbot")).toBeVisible();
  });

  test("uploading a valid PNG writes the returned URL into the field and sends the file as multipart", async ({ page, mockApi }) => {
    installSharePagesMocks(mockApi);
    await installIconAssets(page);
    const share = new SharePage(page, "chat-ui");
    await share.goto();

    await share.panel.upload("bubble", { name: "bubble.png", mimeType: "image/png", buffer: Buffer.from("fake-png-bytes") });

    await expect(share.panel.bubbleIconUrl).toHaveValue(UPLOADED_ICON_URL);
    await expect(share.panel.iconPreview("bubble")).toBeVisible();
    const uploads = mockApi.requestsTo("POST", SHARE_PATHS.image);
    expect(uploads).toHaveLength(1);
    expect(String(uploads[0].body)).toContain('filename="bubble.png"');
    // The upload only stores the file: nothing is saved until the panel's own Save.
    expect(mockApi.requestsTo("PUT", SHARE_PATHS.save)).toHaveLength(0);
    expect(await save(share, mockApi)).toMatchObject({ bubbleIconPath: UPLOADED_ICON_URL });
  });

  test("uploading for the chatbot icon fills the chatbot field only", async ({ page, mockApi }) => {
    installSharePagesMocks(mockApi);
    await installIconAssets(page);
    const share = new SharePage(page, "chat-ui");
    await share.goto();

    await share.panel.upload("chatbot", { name: "bot.webp", mimeType: "image/webp", buffer: Buffer.from("fake-webp-bytes") });

    await expect(share.panel.chatbotIconUrl).toHaveValue(UPLOADED_ICON_URL);
    await expect(share.panel.bubbleIconUrl).toHaveValue("");
  });

  test("rejects a file of an unsupported type without calling the API", async ({ page, mockApi }) => {
    installSharePagesMocks(mockApi);
    const share = new SharePage(page, "chat-ui");
    await share.goto();

    await share.panel.upload("bubble", { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });

    await expect(page.getByText("Only PNG, JPEG, or WEBP images are supported.")).toBeVisible();
    await expect(share.panel.bubbleIconUrl).toHaveValue("");
    expect(mockApi.requestsTo("POST", SHARE_PATHS.image)).toHaveLength(0);
  });

  test("rejects a file over 5 MB without calling the API", async ({ page, mockApi }) => {
    installSharePagesMocks(mockApi);
    const share = new SharePage(page, "chat-ui");
    await share.goto();

    await share.panel.upload("chatbot", { name: "huge.png", mimeType: "image/png", buffer: Buffer.alloc(5 * 1024 * 1024 + 1) });

    await expect(page.getByText("Image must be 5MB or smaller.")).toBeVisible();
    expect(mockApi.requestsTo("POST", SHARE_PATHS.image)).toHaveLength(0);
  });

  test("shows a generic message when the upload fails", async ({ page, mockApi }) => {
    installSharePagesMocks(mockApi);
    failShareRequest(mockApi, "image", "WKFLO0001", 500);
    const share = new SharePage(page, "chat-ui");
    await share.goto();

    await share.panel.upload("bubble", { name: "bubble.png", mimeType: "image/png", buffer: Buffer.from("fake-png-bytes") });

    // Known bug: see US 8186 item 45. The upload service reads only `message`/`title`, so the API's
    // error code is ignored and the generic text is shown.
    await expect(page.getByText("Failed to upload image", { exact: true })).toBeVisible();
    await expect(share.panel.bubbleIconUrl).toHaveValue("");
    await expect(share.panel.uploadButton("bubble")).toBeEnabled();
  });

  test("a later valid upload clears the earlier error", async ({ page, mockApi }) => {
    installSharePagesMocks(mockApi);
    await installIconAssets(page);
    const share = new SharePage(page, "chat-ui");
    await share.goto();
    await share.panel.upload("bubble", { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
    await expect(page.getByText("Only PNG, JPEG, or WEBP images are supported.")).toBeVisible();

    await share.panel.upload("bubble", { name: "bubble.png", mimeType: "image/png", buffer: Buffer.from("fake-png-bytes") });

    await expect(share.panel.bubbleIconUrl).toHaveValue(UPLOADED_ICON_URL);
    await expect(page.getByText("Only PNG, JPEG, or WEBP images are supported.")).toHaveCount(0);
  });
});

test.describe("quick replies", () => {
  test("adds, edits and removes quick replies and saves the list", async ({ page, mockApi }) => {
    installSharePagesMocks(mockApi);
    const share = new SharePage(page, "chat-ui");
    await share.goto();
    await expect(share.panel.quickReplyTitle(1)).toHaveCount(0);

    await share.panel.addQuickReply.click();
    await share.panel.quickReplyTitle(1).fill("Opening hours");
    await share.panel.quickReplyPrompt(1).fill("When are you open?");
    await share.panel.addQuickReply.click();
    await share.panel.quickReplyTitle(2).fill("Contact");
    await share.panel.quickReplyPrompt(2).fill("How can I contact you?");
    expect(await save(share, mockApi)).toMatchObject({
      predefinedPrompts: [
        { title: "Opening hours", prompt: "When are you open?" },
        { title: "Contact", prompt: "How can I contact you?" },
      ],
    });

    await page.getByRole("button", { name: "Remove quick reply" }).first().click();
    await expect(share.panel.quickReplyTitle(2)).toHaveCount(0);
    await expect(share.panel.quickReplyTitle(1)).toHaveValue("Contact");
    expect(await save(share, mockApi)).toMatchObject({ predefinedPrompts: [{ title: "Contact", prompt: "How can I contact you?" }] });
  });

  test("loads saved quick replies into the panel", async ({ page, mockApi }) => {
    installSharePagesMocks(mockApi, { setting: { predefinedPrompts: [{ title: "Saved", prompt: "Saved prompt" }] } });
    const share = new SharePage(page, "chat-ui");
    await share.goto();

    await expect(share.panel.quickReplyTitle(1)).toHaveValue("Saved");
    await expect(share.panel.quickReplyPrompt(1)).toHaveValue("Saved prompt");
  });

  test("hides the MAISY defaults button for an ordinary agent", async ({ page, mockApi }) => {
    installSharePagesMocks(mockApi);
    const share = new SharePage(page, "chat-ui");
    await share.goto();

    await expect(share.panel.addQuickReply).toBeVisible();
    await expect(share.panel.maisyDefaults).toHaveCount(0);
  });

  test("adds the MAISY defaults for a tagged agent, without duplicating them on a second click", async ({ page, mockApi }) => {
    installSharePagesMocks(mockApi);
    const agent = mockApi.seed.agents[0];
    agent.tags = [{ id: 9, name: "Maisy" }] as unknown as typeof agent.tags;
    const share = new SharePage(page, "chat-ui");
    await share.goto();
    await share.panel.addQuickReply.click();
    await share.panel.quickReplyTitle(1).fill("My own reply");

    await share.panel.maisyDefaults.click();
    await expect(share.panel.quickReplyTitle(5)).toBeVisible();
    await share.panel.maisyDefaults.click();

    // The own reply stays first, the four defaults are appended once.
    await expect(share.panel.quickReplyTitle(1)).toHaveValue("My own reply");
    await expect(share.panel.quickReplyTitle(5)).toBeVisible();
    await expect(share.panel.quickReplyTitle(6)).toHaveCount(0);
    const body = await save(share, mockApi);
    expect((body.predefinedPrompts as { title: string }[]).map((p) => p.title)).toEqual([
      "My own reply",
      "What can MAISY do?",
      "Improve SEO meta data",
      "Clone a page or a post",
      "Add images to a gallery",
    ]);
  });
});
