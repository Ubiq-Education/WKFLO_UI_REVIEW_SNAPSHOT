import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

/** The "Chat Settings" card (client/src/components/agents/advanced-chat-settings-panel.tsx) on both share pages. */
export class ChatSettingsPanel {
  readonly saveButton: Locator;
  readonly primaryColorHex: Locator;
  readonly foregroundColorHex: Locator;
  readonly bubbleStyle: Locator;
  readonly position: Locator;
  readonly launcherShape: Locator;
  readonly pillText: Locator;
  readonly showDescription: Locator;
  readonly chainOfThought: Locator;
  readonly bubbleIconUrl: Locator;
  readonly chatbotIconUrl: Locator;
  readonly cssUrl: Locator;
  readonly headerTitle: Locator;
  readonly welcomeMessage: Locator;
  readonly footerMessage: Locator;
  readonly apiEndpoint: Locator;
  readonly authType: Locator;
  readonly addQuickReply: Locator;
  readonly maisyDefaults: Locator;

  constructor(private readonly page: Page) {
    this.saveButton = page.getByRole("button", { name: "Save Chat Settings" });
    this.primaryColorHex = page.getByRole("textbox", { name: "Primary color hex" });
    this.foregroundColorHex = page.getByRole("textbox", { name: "Foreground color hex" });
    this.bubbleStyle = page.getByRole("combobox", { name: "Message Bubble Style" });
    this.position = page.getByRole("combobox", { name: "Position" });
    this.launcherShape = page.getByRole("combobox", { name: "Launcher Shape" });
    this.pillText = page.getByRole("textbox", { name: "Pill Text" });
    this.showDescription = page.getByRole("switch", { name: "Show Agent Description" });
    this.chainOfThought = page.getByRole("switch", { name: "Chain of Thought" });
    this.bubbleIconUrl = page.getByRole("textbox", { name: "Bubble Icon URL" });
    this.chatbotIconUrl = page.getByRole("textbox", { name: "Chatbot Icon URL" });
    this.cssUrl = page.getByRole("textbox", { name: "Custom CSS URL" });
    this.headerTitle = page.getByRole("textbox", { name: "Header Title" });
    this.welcomeMessage = page.getByRole("textbox", { name: "Welcome Message" });
    this.footerMessage = page.getByRole("textbox", { name: "Footer Message" });
    this.apiEndpoint = page.getByRole("textbox", { name: "API Endpoint" });
    this.authType = page.getByRole("combobox", { name: "Authentication Type" });
    this.addQuickReply = page.getByRole("button", { name: "Add quick reply" });
    this.maisyDefaults = page.getByRole("button", { name: "Add MAISY defaults" });
  }

  /** Picks an option of one of the panel's selects. */
  async choose(select: Locator, option: string): Promise<void> {
    await select.click();
    await this.page.getByRole("option", { name: option }).click();
  }

  /** Opens the colour popover and picks a preset swatch by its colour name ("Green"). */
  async pickPresetColor(name: string): Promise<void> {
    await this.page.getByRole("button", { name: "Choose Color" }).click();
    await this.page.getByRole("button", { name: name, exact: true }).click();
    await this.page.keyboard.press("Escape");
  }

  quickReplyTitle(n: number): Locator {
    return this.page.getByRole("textbox", { name: `Quick reply ${n} title` });
  }

  quickReplyPrompt(n: number): Locator {
    return this.page.getByRole("textbox", { name: `Quick reply ${n} prompt` });
  }

  /** The two "Upload image" buttons: the bubble icon's first, the chatbot icon's second. */
  uploadButton(which: "bubble" | "chatbot"): Locator {
    return this.page.getByRole("button", { name: "Upload image" }).nth(which === "bubble" ? 0 : 1);
  }

  /** Clicks an upload button and hands the file chooser the given file. */
  async upload(which: "bubble" | "chatbot", file: { name: string; mimeType: string; buffer: Buffer }): Promise<void> {
    const chooser = this.page.waitForEvent("filechooser");
    await this.uploadButton(which).click();
    await (await chooser).setFiles(file);
  }

  iconPreview(which: "bubble" | "chatbot"): Locator {
    return this.page.getByRole("img", { name: which === "bubble" ? "Bubble icon preview" : "Chatbot icon preview" });
  }

  async expectSaveIdle(): Promise<void> {
    await expect(this.saveButton).toBeEnabled();
  }
}
