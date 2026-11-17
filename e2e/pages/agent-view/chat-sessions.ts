import type { Locator, Page } from "@playwright/test";
import { ConfirmDialog } from "../components/confirm-dialog";

/** The chat sessions list at the left of the Test Agent tab (shown when the agent has short-term memory on). */
export class ChatSessions {
  readonly newChatButton: Locator;
  readonly emptyMessage: Locator;
  readonly deleteDialog: ConfirmDialog;

  constructor(private readonly page: Page) {
    this.newChatButton = page.getByRole("button", { name: "+ New Chat" });
    this.emptyMessage = page.getByText("No chat sessions found.");
    this.deleteDialog = new ConfirmDialog(page, "Delete Chat Session?");
  }

  row(name: string): Locator {
    return this.page.getByRole("group", { name, exact: true });
  }

  select(name: string): Locator {
    return this.row(name).getByRole("button").first();
  }

  deleteButton(name: string): Locator {
    return this.row(name).getByRole("button", { name: "Delete chat" });
  }
}
