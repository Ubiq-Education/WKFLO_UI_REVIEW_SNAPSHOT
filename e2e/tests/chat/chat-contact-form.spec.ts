import { expect, test } from "../../support/test";
import { reply } from "../../support/mock-api";
import { TestAgentChatPage } from "../../pages/chat/test-agent-chat.page";
import { CHAT_PATHS, installChatMocks } from "../../support/mocks/chat";

test.describe("Test Agent chat: contact form", () => {
  test("shows the card with the required fields only", async ({ page, mockApi, hub }) => {
    installChatMocks(mockApi);
    const chat = new TestAgentChatPage(page, hub);
    await chat.open();
    await chat.send("Can you call me back?");

    hub.contactForm(chat.sessionId, { firstNameRequired: true, lastNameRequired: false, emailRequired: true });

    await expect(page.getByLabel("First name")).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Last name")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Send", exact: true })).toBeVisible();
  });

  test("the required fields block an empty submit", async ({ page, mockApi, hub }) => {
    const chatMocks = installChatMocks(mockApi);
    const chat = new TestAgentChatPage(page, hub);
    await chat.open();
    await chat.send("Can you call me back?");
    hub.contactForm(chat.sessionId);

    await page.getByRole("button", { name: "Send", exact: true }).click();

    await expect.poll(() => page.getByLabel("First name").evaluate((el: HTMLInputElement) => el.validationMessage)).not.toBe("");
    expect(chatMocks.contactForms()).toHaveLength(0);

    await page.getByLabel("First name").fill("Alex");
    await page.getByLabel("Email").fill("not-an-email");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect.poll(() => page.getByLabel("Email").evaluate((el: HTMLInputElement) => el.validity.typeMismatch)).toBe(true);
    expect(chatMocks.contactForms()).toHaveLength(0);
  });

  test("submits the details, removes the card and replays the question once the form completes", async ({ page, mockApi, hub }) => {
    const chatMocks = installChatMocks(mockApi);
    const chat = new TestAgentChatPage(page, hub);
    await chat.open();
    await chat.send("Can you call me back?");
    await expect.poll(() => chatMocks.sends().length).toBe(1);
    hub.contactForm(chat.sessionId, { lastNameRequired: true });

    await page.getByLabel("First name").fill("Alex");
    await page.getByLabel("Last name").fill("Example");
    await page.getByLabel("Email").fill("alex.example@example.test");
    await page.getByRole("button", { name: "Send", exact: true }).click();

    await expect.poll(() => chatMocks.contactForms().length).toBe(1);
    expect(chatMocks.contactForms()[0].path).toBe("/ai/api/v1/tenant/agent/1/contact-form/submit");
    expect(chatMocks.contactForms()[0].body).toMatchObject({
      sessionId: chat.sessionId,
      firstName: "Alex",
      lastName: "Example",
      email: "alex.example@example.test",
      originalMessage: "Can you call me back?",
    });
    await expect(page.getByLabel("First name")).toHaveCount(0);
    // Known bug: see US 8186: the configured successMessageText is never shown; the card just goes away.
    await expect(page.getByText("Thanks, we will be in touch.")).toHaveCount(0);

    hub.emit("ContactFormCompleted", { chatId: chat.sessionId, originalMessage: "Can you call me back?" });
    await expect.poll(() => chatMocks.sends().length).toBe(2);
    expect(chatMocks.sends()[1].body).toMatchObject({ input: { text: "Can you call me back?" }, isContactFormReplay: true });
  });

  test("a non-mandatory form can be dismissed", async ({ page, mockApi, hub }) => {
    const chatMocks = installChatMocks(mockApi);
    const chat = new TestAgentChatPage(page, hub);
    await chat.open();
    hub.contactForm(chat.sessionId, { mandatory: false });

    await page.getByRole("button", { name: "Dismiss" }).click();

    await expect(page.getByLabel("First name")).toHaveCount(0);
    expect(chatMocks.contactForms()).toHaveLength(0);
    await expect(chat.input).toBeEnabled();
  });

  test("a mandatory form cannot be dismissed and hides the chat input", async ({ page, mockApi, hub }) => {
    installChatMocks(mockApi);
    const chat = new TestAgentChatPage(page, hub);
    await chat.open();

    hub.contactForm(chat.sessionId, { mandatory: true });

    await expect(page.getByLabel("First name")).toBeVisible();
    await expect(page.getByRole("button", { name: "Dismiss" })).toHaveCount(0);
    await expect(chat.input).toHaveCount(0);
  });

  test.describe("when the submit fails", () => {
    test.use({ allowedConsoleErrors: [/Failed to load resource|Contact form submit failed/] });

    test("shows the error and keeps the card", async ({ page, mockApi, hub }) => {
      installChatMocks(mockApi);
      mockApi.on("POST", CHAT_PATHS.contactForm, () => reply({}, 500));
      const chat = new TestAgentChatPage(page, hub);
      await chat.open();
      hub.contactForm(chat.sessionId);

      await page.getByLabel("First name").fill("Alex");
      await page.getByLabel("Email").fill("alex.example@example.test");
      await page.getByRole("button", { name: "Send", exact: true }).click();

      // Known bug: see US 8186 (#36): the raw status text is shown instead of a friendly message.
      await expect(page.getByText("Request failed with status 500")).toBeVisible();
      await expect(page.getByLabel("First name")).toHaveValue("Alex");
    });
  });
});
