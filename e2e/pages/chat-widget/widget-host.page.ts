import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

const HOST_TEMPLATE = fileURLToPath(
  new URL("../../fixtures/widget-host.html", import.meta.url),
);
const WIDGET_ENTRY = path.resolve(
  fileURLToPath(
    new URL("../../../chat-widget/src/widget.tsx", import.meta.url),
  ),
);
export const HOST_PATH = "/e2e-widget-host.html";

/**
 * The widget's embed attributes, keyed by the part after `data-` (so `primary-color` is
 * `data-primary-color`). A `null` value leaves the attribute out (also removes one of the defaults).
 */
export type WidgetAttributes = Record<string, string | null>;

const escapeAttribute = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/**
 * The embedding page and the widget it loads. The widget is the real `chat-widget/src/widget.tsx`,
 * served by the Vite dev server through `/@fs/`, and it initialises itself from the `data-*`
 * attributes of its own `<script>` tag, exactly as in a customer's page.
 *
 * Limits of this setup:
 * - The tests force isolation "css-prefix". The production default "auto" picks a closed shadow
 *   root, which Playwright cannot pierce, so that mode is not covered.
 * - The widget is served from source by the main app's Vite config, not as the UMD bundle that
 *   chat-widget/vite.widget.config.ts builds.
 * - It relies on chat-widget/ having no node_modules of its own (otherwise React is duplicated).
 */
export class WidgetHostPage {
  /** The floating button shown while the widget is minimised. It is a div with a title (no role). */
  readonly launcher: Locator;
  /** The widget's chat window. */
  readonly chat: Locator;
  readonly input: Locator;
  /** The predefined-prompt chips under the welcome message (shared/components/chat-messages.tsx). */
  readonly promptChips: Locator;
  readonly minimizeButton: Locator;
  readonly closeButton: Locator;

  constructor(
    readonly page: Page,
    readonly shareId: string,
    readonly agentName = "E2E Support Agent",
  ) {
    this.launcher = page.getByTitle(`Open ${agentName} chat`);
    this.chat = page.locator(".wkflo-chat-container");
    this.input = this.chat.getByRole("textbox");
    this.promptChips = this.chat.locator("button[class*='hover:shadow-sm']");
    // Icon-only buttons without an accessible name (shared/components/chat-header.tsx WidgetControls).
    this.minimizeButton = this.chat.locator(
      "button.wkflo-header-button:has(svg[class*='lucide-minimize'])",
    );
    this.closeButton = this.chat.locator(
      "button.wkflo-header-button:has(svg.lucide-x)",
    );
  }

  /** Serves the host page and navigates to it. `attributes` are added to the widget's script tag. */
  async open(attributes: WidgetAttributes = {}): Promise<void> {
    const all: WidgetAttributes = {
      "share-id": this.shareId,
      "api-endpoint": "https://api.e2e.test",
      "agent-name": this.agentName,
      "security-type": "none",
      isolation: "css-prefix",
      ...attributes,
    };
    const attrs = Object.entries(all)
      .filter((entry): entry is [string, string] => entry[1] !== null)
      .map(([key, value]) => `data-${key}="${escapeAttribute(value)}"`)
      .join(" ");
    const src = `/@fs/${WIDGET_ENTRY.split(path.sep).join("/").replace(/^\//, "")}`;
    const html = readFileSync(HOST_TEMPLATE, "utf8").replace(
      "<!--E2E_WIDGET_SCRIPT-->",
      `<script type="module" src="${src}" ${attrs}></script>`,
    );
    await this.page.route(`**${HOST_PATH}`, (route) =>
      route.fulfill({ contentType: "text/html", body: html }),
    );
    await this.page.goto(HOST_PATH);
  }

  async openChat(): Promise<void> {
    await this.launcher.click();
    await expect(this.chat).toBeVisible();
  }

  /** The chat is connected to the hub once its textarea is enabled. */
  async waitUntilConnected(): Promise<void> {
    await expect(this.input).toBeEnabled();
  }

  async send(text: string): Promise<void> {
    await this.input.fill(text);
    await this.input.press("Enter");
  }

  /** The element every widget instance is mounted into (css-prefix isolation puts the chat directly inside it). */
  get root(): Locator {
    return this.page.locator(".wkflo-widget-root");
  }
}
