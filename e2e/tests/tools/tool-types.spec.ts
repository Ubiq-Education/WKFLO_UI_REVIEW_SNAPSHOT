import { expect, test } from "../../support/test";
import { ToolFormPage, EDITOR_HEADINGS, TOOL_TYPE_OPTIONS } from "../../pages/tools/tool-form.page";
import { Toast } from "../../pages/components/toast";
import {
  CHAT_CLASSIFICATION_CONFIG,
  CONTACT_FORM_CONFIG,
  IMAGE_GENERATION_CONFIG,
  installToolsMocks,
  KNOWLEDGE_CONFIG,
  lastBody,
  NEW_TOOL_ID,
  PRIORITY_QA_CONFIG,
  TOOL_IDS,
  type ToolsStore,
} from "../../support/mocks/tools";

const TOOL_PATH = "/md/api/v1/tenant/tool/:id";

/** The config the last PUT to the tool endpoint carried, parsed. */
function savedConfig(mockApi: Parameters<typeof lastBody>[0]): Record<string, unknown> {
  return JSON.parse(lastBody<{ config: string }>(mockApi, "PUT", TOOL_PATH)!.config);
}

test.describe("Tool types", () => {
  let store: ToolsStore;
  test.beforeEach(({ mockApi }) => {
    store = installToolsMocks(mockApi);
  });

  test.describe("loading a saved tool", () => {
    test("an HTTP tool shows its inputs and request config", async ({ page }) => {
      const form = new ToolFormPage(page);
      await form.gotoEdit(TOOL_IDS.http);

      await expect(form.editorHeading(EDITOR_HEADINGS.HTTP)).toBeVisible();
      await expect(page.getByRole("heading", { level: 4, name: "Query", exact: true })).toBeVisible();
      await expect(page.getByRole("combobox", { name: "HTTP method" })).toHaveText("POST");
      await expect(page.locator('input[data-field="url"]')).toHaveValue("https://example.test/api/records");
    });

    test("a Document Library tool shows its tags", async ({ page }) => {
      const form = new ToolFormPage(page);
      await form.gotoEdit(TOOL_IDS.knowledge);

      await expect(form.editorHeading(EDITOR_HEADINGS.Knowledge)).toBeVisible();
      for (const tag of KNOWLEDGE_CONFIG.tags) await expect(page.locator("span.bg-muted").filter({ hasText: tag })).toBeVisible();
    });

    test("an AMAIS Integration tool shows its two switches", async ({ page }) => {
      const form = new ToolFormPage(page);
      await form.gotoEdit(TOOL_IDS.integrationAmais);

      await expect(form.editorHeading(EDITOR_HEADINGS.Integration_Amais)).toBeVisible();
      const switches = page.getByRole("switch");
      // Voice is on and skills are off in the fixture. The two switches have no accessible name, so they are found by position.
      await expect(switches.nth(0)).toBeChecked();
      await expect(switches.nth(1)).not.toBeChecked();
      await expect(page.getByText("Enabled", { exact: true })).toHaveCount(1);
      await expect(page.getByText("Disabled", { exact: true })).toHaveCount(1);
    });

    test("a Priority Q&A tool shows its pairs", async ({ page }) => {
      const form = new ToolFormPage(page);
      await form.gotoEdit(TOOL_IDS.priorityQa);

      await expect(form.editorHeading(EDITOR_HEADINGS.Priority_QA)).toBeVisible();
      const questions = page.getByPlaceholder("e.g., What are your office hours?");
      await expect(questions).toHaveCount(2);
      await expect(questions.nth(0)).toHaveValue(PRIORITY_QA_CONFIG.items[0].question);
      await expect(questions.nth(1)).toHaveValue(PRIORITY_QA_CONFIG.items[1].question);
      await expect(page.getByPlaceholder("https://example.com")).toHaveValue("https://example.test/hours");
    });

    test("a Chat Classification tool shows its topics", async ({ page }) => {
      const form = new ToolFormPage(page);
      await form.gotoEdit(TOOL_IDS.chatClassification);

      await expect(form.editorHeading(EDITOR_HEADINGS.Chat_Classification)).toBeVisible();
      const names = page.getByPlaceholder("e.g., Billing");
      await expect(names).toHaveCount(3);
      await expect(names.nth(2)).toHaveValue("Feedback");
      // The second topic is switched off.
      await expect(page.getByRole("checkbox", { name: "Active" })).toHaveCount(3);
      await expect(page.getByRole("checkbox", { name: "Active" }).nth(1)).not.toBeChecked();
    });

    test("a Contact Form tool shows its settings", async ({ page }) => {
      const form = new ToolFormPage(page);
      await form.gotoEdit(TOOL_IDS.contactForm);

      await expect(form.editorHeading(EDITOR_HEADINGS.Contact_Form)).toBeVisible();
      await expect(page.getByPlaceholder(/^Show the contact form when/)).toHaveValue(CONTACT_FORM_CONFIG.whenToUse);
      await expect(page.getByPlaceholder("Submit", { exact: true })).toHaveValue("Send request");
      await expect(page.getByPlaceholder("Thank you! We will get back to you shortly.")).toHaveValue(CONTACT_FORM_CONFIG.successMessageText);
    });

    test("an Image to Image tool shows its provider settings", async ({ page }) => {
      const form = new ToolFormPage(page);
      await form.gotoEdit(TOOL_IDS.imageGeneration);

      await expect(form.editorHeading(EDITOR_HEADINGS.Image_Generation)).toBeVisible();
      await expect(page.getByRole("combobox").filter({ hasText: "Azure OpenAI" })).toBeVisible();
      await expect(page.getByPlaceholder("e.g., https://my-resource.openai.azure.com")).toHaveValue(IMAGE_GENERATION_CONFIG.endpoint);
      await expect(page.getByPlaceholder("e.g., gpt-image-2").first()).toHaveValue(IMAGE_GENERATION_CONFIG.deploymentName);
      // The key is a password field.
      await expect(page.getByPlaceholder("Enter API key")).toHaveAttribute("type", "password");
    });

    // One test per fixture tool: each is a full page load, and seven of them in a single test ran
    // past the 30 s test timeout under parallel load. Separate tests also name the failing type.
    const typeLabels: Array<[string, number, string]> = [
      ["HTTP", TOOL_IDS.http, TOOL_TYPE_OPTIONS.HTTP],
      ["Priority Q&A", TOOL_IDS.priorityQa, TOOL_TYPE_OPTIONS.Priority_QA],
      ["Contact Form", TOOL_IDS.contactForm, TOOL_TYPE_OPTIONS.Contact_Form],
      ["Chat Classification", TOOL_IDS.chatClassification, TOOL_TYPE_OPTIONS.Chat_Classification],
      ["Document Library", TOOL_IDS.knowledge, TOOL_TYPE_OPTIONS.Knowledge],
      ["AMAIS Integration", TOOL_IDS.integrationAmais, TOOL_TYPE_OPTIONS.Integration_Amais],
      ["Image to Image", TOOL_IDS.imageGeneration, TOOL_TYPE_OPTIONS.Image_Generation],
    ];
    for (const [name, id, label] of typeLabels) {
      test(`the Tool Type select shows the type's name for the ${name} fixture tool`, async ({ page }) => {
        const form = new ToolFormPage(page);
        await form.gotoEdit(id);
        await expect(form.typeSelect).toHaveText(label);
      });
    }
  });

  test.describe("switching the type", () => {
    test("each type shows its own editor and hides the previous one", async ({ page }) => {
      const form = new ToolFormPage(page);
      await form.gotoCreate();
      await expect(form.editorHeading(EDITOR_HEADINGS.HTTP)).toBeVisible();

      const types = Object.keys(TOOL_TYPE_OPTIONS) as Array<keyof typeof TOOL_TYPE_OPTIONS>;
      for (const type of types.filter((item) => item !== "HTTP")) {
        await form.selectType(TOOL_TYPE_OPTIONS[type]);

        await expect(form.typeSelect).toHaveText(TOOL_TYPE_OPTIONS[type]);
        await expect(form.editorHeading(EDITOR_HEADINGS[type])).toBeVisible();
        for (const other of types.filter((item) => item !== type)) {
          await expect(form.editorHeading(EDITOR_HEADINGS[other])).toHaveCount(0);
        }
      }

      await form.selectType(TOOL_TYPE_OPTIONS.HTTP);
      await expect(form.editorHeading(EDITOR_HEADINGS.HTTP)).toBeVisible();
    });

    test("the type select offers every non-MCP type", async ({ page }) => {
      const form = new ToolFormPage(page);
      await form.gotoCreate();

      await form.typeSelect.click();

      for (const label of Object.values(TOOL_TYPE_OPTIONS)) {
        await expect(page.getByRole("option", { name: label, exact: true })).toBeVisible();
      }
      await expect(page.getByRole("option", { name: "MCP", exact: true })).toBeVisible();
      await expect(page.getByRole("option")).toHaveCount(Object.keys(TOOL_TYPE_OPTIONS).length + 1);
    });

    test("creating a tool after switching posts the new type with that editor's default config", async ({ page, mockApi }) => {
      const form = new ToolFormPage(page);
      const toast = new Toast(page);
      await form.gotoCreate();

      await form.selectType(TOOL_TYPE_OPTIONS.Contact_Form);
      await form.nameInput.fill("E2E New Contact Form");
      await form.descriptionInput.fill("Created as a contact form.");
      await page.getByPlaceholder(/^Show the contact form when/).fill("When the visitor wants a call back.");
      await form.saveButton.click();

      await toast.expectShown("Tool created");
      const body = lastBody<{ type: string; config: string }>(mockApi, "POST", "/md/api/v1/tenant/tool")!;
      expect(body.type).toBe("Contact_Form");
      // Only the contact form's own fields survive the switch: the HTTP config's keys are gone.
      expect(JSON.parse(body.config)).toEqual({
        mandatory: false,
        firstNameRequired: false,
        lastNameRequired: false,
        emailRequired: false,
        whenToUse: "When the visitor wants a call back.",
        submitButtonText: "Submit",
        successMessageEnabled: false,
        successMessageText: "",
      });
      await form.expectPath(`/tools/${NEW_TOOL_ID}/edit`);
      await expect(form.editorHeading(EDITOR_HEADINGS.Contact_Form)).toBeVisible();
    });

    test("switching a saved tool to another type replaces its config on save", async ({ page, mockApi }) => {
      const form = new ToolFormPage(page);
      const toast = new Toast(page);
      await form.gotoEdit(TOOL_IDS.priorityQa);

      await form.selectType(TOOL_TYPE_OPTIONS.Knowledge);
      await expect(form.editorHeading(EDITOR_HEADINGS.Knowledge)).toBeVisible();
      await form.saveButton.click();

      await toast.expectShown("Tool updated");
      expect(lastBody(mockApi, "PUT", TOOL_PATH)).toMatchObject({ type: "Knowledge" });
      expect(savedConfig(mockApi)).toEqual({ tags: [] });
      expect(store.tools[1].type).toBe("Knowledge");
      // The Priority Q&A questions are gone after the reload from the store.
      await page.reload();
      await expect(form.editorHeading(EDITOR_HEADINGS.Knowledge)).toBeVisible();
      await expect(page.getByPlaceholder("e.g., What are your office hours?")).toHaveCount(0);
    });

    test("switching away from a type and back resets its editor to the defaults", async ({ page }) => {
      const form = new ToolFormPage(page);
      await form.gotoEdit(TOOL_IDS.contactForm);
      const whenToUse = page.getByPlaceholder(/^Show the contact form when/);
      await whenToUse.fill("A changed instruction.");

      await form.selectType(TOOL_TYPE_OPTIONS.Knowledge);
      await form.selectType(TOOL_TYPE_OPTIONS.Contact_Form);

      // Each editor rewrites the config to its own shape when it mounts, so the other type's values are dropped at once
      // (not only on save) and do not come back. Backlog candidate: confirm before discarding, or keep per-type drafts.
      await expect(whenToUse).toHaveValue("");
      await expect(page.getByPlaceholder("Submit", { exact: true })).toHaveValue("Submit");
    });
  });

  test.describe("Priority Q&A editor", () => {
    test("adds, edits and removes items and links, and saves the result", async ({ page, mockApi }) => {
      const form = new ToolFormPage(page);
      const toast = new Toast(page);
      await form.gotoEdit(TOOL_IDS.priorityQa);
      const questions = page.getByPlaceholder("e.g., What are your office hours?");

      await page.getByRole("button", { name: "Add Item" }).click();
      await expect(questions).toHaveCount(3);
      await questions.nth(2).fill("Is parking available?");
      await page.getByPlaceholder("e.g., Monday to Friday, 9am to 5pm.").nth(2).fill("Yes, behind the building.");
      await page.getByRole("button", { name: "Add Link" }).nth(2).click();
      await page.getByPlaceholder("https://example.com").nth(1).fill("https://example.test/parking");
      // Remove the second item (the trash button is the first button in its card, without a name).
      await page.locator("div.border.rounded-md").filter({ hasText: "Item 2" }).getByRole("button").first().click();
      await expect(questions).toHaveCount(2);
      await form.saveButton.click();

      await toast.expectShown("Tool updated");
      expect(savedConfig(mockApi)).toEqual({
        items: [
          PRIORITY_QA_CONFIG.items[0],
          { question: "Is parking available?", answer: "Yes, behind the building.", links: ["https://example.test/parking"] },
        ],
      });
    });

    test("an empty list shows a hint", async ({ page }) => {
      const form = new ToolFormPage(page);
      await form.gotoEdit(TOOL_IDS.priorityQa);

      await page.locator("div.border.rounded-md").filter({ hasText: "Item 1" }).getByRole("button").first().click();
      await page.locator("div.border.rounded-md").filter({ hasText: "Item 1" }).getByRole("button").first().click();

      await expect(page.getByText('No Q&A items yet. Click "Add Item" to get started.')).toBeVisible();
    });
  });

  test.describe("Chat Classification editor", () => {
    test("adds a topic, switches one off and on, removes one, and saves the result", async ({ page, mockApi }) => {
      const form = new ToolFormPage(page);
      const toast = new Toast(page);
      await form.gotoEdit(TOOL_IDS.chatClassification);
      const names = page.getByPlaceholder("e.g., Billing");

      await page.getByRole("button", { name: "Add Topic" }).click();
      await expect(names).toHaveCount(4);
      await names.nth(3).fill("Enrolment");
      await page.getByPlaceholder(/^e\.g\., Messages related to invoices/).nth(3).fill("Questions about joining.");
      await page.getByRole("checkbox", { name: "Active" }).nth(1).check();
      await page.getByRole("checkbox", { name: "Active" }).nth(0).uncheck();
      // Remove the third topic.
      await page.locator("div.border.rounded-md").filter({ hasText: "Topic 3" }).getByRole("button").click();
      await expect(names).toHaveCount(3);
      await form.saveButton.click();

      await toast.expectShown("Tool updated");
      const topics = (savedConfig(mockApi) as { topics: Array<Record<string, unknown>> }).topics;
      expect(topics).toEqual([
        { ...CHAT_CLASSIFICATION_CONFIG.topics[0], isActive: false },
        { ...CHAT_CLASSIFICATION_CONFIG.topics[1], isActive: true },
        { id: expect.any(String), name: "Enrolment", description: "Questions about joining.", isActive: true },
      ]);
    });
  });

  test.describe("Document Library editor", () => {
    test("adds a tag with Enter, removes another, and saves the result", async ({ page, mockApi }) => {
      const form = new ToolFormPage(page);
      const toast = new Toast(page);
      await form.gotoEdit(TOOL_IDS.knowledge);
      const tagInput = page.getByPlaceholder("Add a tag and press Enter");

      await tagInput.fill("policies");
      await tagInput.press("Enter");
      await expect(tagInput).toHaveValue("");
      await expect(page.locator("span.bg-muted").filter({ hasText: "policies" })).toBeVisible();
      // Whitespace only is ignored.
      await tagInput.fill("   ");
      await tagInput.press("Enter");
      await page.locator("span.bg-muted").filter({ hasText: "handbook" }).getByRole("button").click();
      await form.saveButton.click();

      await toast.expectShown("Tool updated");
      expect(savedConfig(mockApi)).toEqual({ tags: ["faq", "policies"] });
    });
  });

  test.describe("Contact Form editor", () => {
    test("changing the texts and the success message switch is saved", async ({ page, mockApi }) => {
      const form = new ToolFormPage(page);
      const toast = new Toast(page);
      await form.gotoEdit(TOOL_IDS.contactForm);
      const successText = page.getByPlaceholder("Thank you! We will get back to you shortly.");
      await expect(successText).toBeVisible();

      await page.getByPlaceholder("Submit", { exact: true }).fill("Contact us");
      // Switches have no accessible name: mandatory, first name, last name, email, success message, in that order.
      await page.getByRole("switch").nth(0).click();
      await expect(page.getByText("Block chat until the form is submitted")).toBeVisible();
      await page.getByRole("switch").nth(4).click();
      await expect(successText).toHaveCount(0);
      await form.saveButton.click();

      await toast.expectShown("Tool updated");
      expect(savedConfig(mockApi)).toMatchObject({
        mandatory: true,
        submitButtonText: "Contact us",
        successMessageEnabled: false,
        firstNameRequired: true,
        emailRequired: true,
      });
    });
  });

  test.describe("Image to Image editor", () => {
    test("switching the provider to Google swaps the fields and clears the model", async ({ page, mockApi }) => {
      const form = new ToolFormPage(page);
      const toast = new Toast(page);
      await form.gotoEdit(TOOL_IDS.imageGeneration);
      await expect(page.getByPlaceholder("e.g., https://my-resource.openai.azure.com")).toBeVisible();

      await page.getByRole("combobox").filter({ hasText: "Azure OpenAI" }).click();
      await page.getByRole("option", { name: "Google", exact: true }).click();

      await expect(page.getByPlaceholder("e.g., https://my-resource.openai.azure.com")).toHaveCount(0);
      await expect(page.getByPlaceholder("e.g., imagen-3.0-edit-v1")).toHaveValue("");
      await page.getByPlaceholder("e.g., imagen-3.0-edit-v1").fill("e2e-image-model");
      await page.getByRole("combobox").filter({ hasText: "Auto (match input image)" }).click();
      await page.getByRole("option", { name: "16:9", exact: true }).click();
      await form.saveButton.click();

      await toast.expectShown("Tool updated");
      expect(savedConfig(mockApi)).toMatchObject({ provider: "google", model: "e2e-image-model", aspectRatio: "16:9", quality: "high" });
    });
  });

  test.describe("AMAIS Integration editor", () => {
    test("toggling the switches is saved", async ({ page, mockApi }) => {
      const form = new ToolFormPage(page);
      const toast = new Toast(page);
      await form.gotoEdit(TOOL_IDS.integrationAmais);

      await page.getByRole("switch").nth(1).click();
      await page.getByRole("switch").nth(0).click();
      await expect(page.getByText("Enabled", { exact: true })).toHaveCount(1);
      await form.saveButton.click();

      await toast.expectShown("Tool updated");
      expect(savedConfig(mockApi)).toEqual({ isVoiceEnabled: false, areSkillsEnabled: true });
    });
  });
});
