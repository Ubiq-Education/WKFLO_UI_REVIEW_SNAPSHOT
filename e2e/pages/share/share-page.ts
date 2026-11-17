import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { Toast } from "../components/toast";
import { ChatSettingsPanel } from "./chat-settings-panel";

export type ShareKind = "chat-ui" | "chat-widget";

/** `/agents/:id/share/chat-ui` and `/agents/:id/share/chat-widget`: the sharing toggle, embed snippet and settings panel. */
export class SharePage {
  readonly toast: Toast;
  readonly panel: ChatSettingsPanel;
  readonly heading: Locator;
  readonly shareToggle: Locator;
  readonly backButton: Locator;

  constructor(
    private readonly page: Page,
    readonly kind: ShareKind,
  ) {
    this.toast = new Toast(page);
    this.panel = new ChatSettingsPanel(page);
    this.heading = page.getByRole("heading", { level: 1, name: kind === "chat-ui" ? "Share Agent - Chat UI" : "Share Agent - Chat Widget" });
    this.shareToggle = page.getByRole("switch", { name: "Make agent shareable" });
    this.backButton = page.getByRole("button", { name: "Back to Agent" });
  }

  /** The snippet textarea: the iframe code on the Chat UI page, the script tag on the widget page. */
  get snippet(): Locator {
    return this.page.getByRole("textbox", { name: this.kind === "chat-ui" ? "iframe embed code" : "Widget script code" });
  }

  get copySnippetButton(): Locator {
    return this.page.getByRole("button", { name: this.kind === "chat-ui" ? "Copy embed code" : "Copy widget script" });
  }

  /** Chat UI page only. */
  get directLink(): Locator {
    return this.page.getByRole("textbox", { name: "Direct link" });
  }

  get copyLinkButton(): Locator {
    return this.page.getByRole("button", { name: "Copy shareable link" });
  }

  async goto(agentId = 1): Promise<void> {
    await this.page.goto(`/agents/${agentId}/share/${this.kind}`);
    await expect(this.heading).toBeVisible();
    // The panel renders before the chat-setting query fills its fields. The API Endpoint is empty in
    // defaultChatSettings and set in every stored setting, so a value means the setting has loaded.
    await expect(this.panel.saveButton).toBeVisible();
    await expect(this.panel.apiEndpoint).toHaveValue(/\S/);
  }

  /** The text currently in the system clipboard, read inside the page (needs `clipboardPermission`). Windows clipboards turn LF into CRLF, so line breaks are normalised. */
  async readClipboard(): Promise<string> {
    const text = await this.page.evaluate(() => navigator.clipboard.readText());
    return text.split("\r\n").join("\n");
  }
}
