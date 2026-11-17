import { expect, test } from "../../support/test";
import { reply } from "../../support/mock-api";
import { TestAgentChatPage } from "../../pages/chat/test-agent-chat.page";
import { CHAT_PATHS, emitRuntimeError, installChatMocks } from "../../support/mocks/chat";

/**
 * The chat never shows raw codes or backend text, only the friendly texts of
 * shared/utils/chat-send-errors.ts. The expected texts below are literal on purpose: a changed
 * message should fail here and be reviewed.
 */

const TOO_LARGE_ATTACHMENTS = "Your attachments are too large to send together. Please remove some files, or send them in separate messages.";
const SESSION_EXPIRED = "Your session has expired. Please sign in again and resend your message.";
const AGENT_UNAVAILABLE = "This assistant is no longer available. Please refresh the page and try again.";
const INVALID_MESSAGE = "Your message couldn't be sent because some of its content isn't valid. Please check it and try again.";
const MISCONFIGURED = "This assistant isn't set up correctly. Please contact Support.";
const GENERIC = "Your message couldn't be sent. Please try again.";

test.describe("Test Agent chat: a send that is rejected", () => {
  // The browser itself logs every non-2xx response as a console error.
  test.use({ allowedConsoleErrors: [/Failed to load resource: the server responded with a status of \d+/] });

  const rejections: Array<{ name: string; status: number; body: unknown; text: string }> = [
    { name: "an unknown error code falls back to the generic text (500)", status: 500, body: { errors: [{ code: "WKFLOAI9999" }] }, text: GENERIC },
    { name: "a 401 asks the user to sign in again", status: 401, body: {}, text: SESSION_EXPIRED },
    { name: "a 404 says the assistant is gone", status: 404, body: {}, text: AGENT_UNAVAILABLE },
    { name: "a 413 says the attachments are too large", status: 413, body: {}, text: TOO_LARGE_ATTACHMENTS },
    { name: "a 429 asks the user to slow down", status: 429, body: {}, text: "You're sending messages too quickly. Please wait a moment and try again." },
    { name: "a plain-text 500 body falls back to the generic text", status: 500, body: "Internal Server Error", text: GENERIC },
    { name: "WKFLOAI0014 (attachments too large)", status: 400, body: { errors: [{ code: "WKFLOAI0014" }] }, text: TOO_LARGE_ATTACHMENTS },
    { name: "WKFLOAI0015 (image too large)", status: 400, body: { errors: [{ code: "WKFLOAI0015" }] }, text: "One of your images is larger than 5.0 MB. Please use a smaller image and try again." },
    { name: "WKFLOAI0016 (unsupported image format)", status: 400, body: { errors: [{ code: "WKFLOAI0016" }] }, text: "One of your images is in a format that can't be used (such as HEIC, BMP or TIFF). Please convert it to JPG or PNG and try again." },
    { name: "WKFLOAI0011 (invalid email)", status: 400, body: { errors: [{ code: "WKFLOAI0011" }] }, text: "The email address isn't valid. Please check it and try again." },
    { name: "WKFLOAI0001 (invalid input)", status: 400, body: { errors: [{ code: "WKFLOAI0001" }] }, text: INVALID_MESSAGE },
    { name: "WKFLOAI0302 (agent must exist)", status: 400, body: { errors: [{ code: "WKFLOAI0302" }] }, text: AGENT_UNAVAILABLE },
    { name: "WKFLOAI0305 (agent not runnable)", status: 400, body: { errors: [{ code: "WKFLOAI0305" }] }, text: "This assistant can't chat right now. Please try again later." },
    { name: "WKFLOAI0502 (AI model must exist) points at Support", status: 400, body: { errors: [{ code: "WKFLOAI0502" }] }, text: MISCONFIGURED },
    { name: "WKFLOAI0201 (invalid domain) points at Support", status: 400, body: { errors: [{ code: "WKFLOAI0201" }] }, text: "This chat isn't available on this website. Please contact Support." },
    { name: "WKFLOAI0801 (MCP OAuth not configured) points at Support", status: 400, body: { errors: [{ code: "WKFLOAI0801" }] }, text: "An app this assistant uses isn't set up yet. Please contact Support." },
    { name: "WKFLOAI1001 (chat session not owned)", status: 403, body: { code: "WKFLOAI1001" }, text: "This conversation belongs to another session. Please start a new chat and try again." },
    { name: "WKFLO0002 (common unauthorized)", status: 400, body: { errors: [{ code: "WKFLO0002" }] }, text: SESSION_EXPIRED },
    { name: "the first known code in the list wins over the status", status: 429, body: { errors: [{ code: "WKFLOAI9999" }, { code: "WKFLOAI0011" }] }, text: "The email address isn't valid. Please check it and try again." },
  ];

  for (const rejection of rejections) {
    test(`shows friendly text when ${rejection.name}`, async ({ page, mockApi, hub }) => {
      installChatMocks(mockApi);
      mockApi.on("POST", CHAT_PATHS.send, () => reply(rejection.body, rejection.status));
      const chat = new TestAgentChatPage(page, hub);
      await chat.open();

      await chat.send("Hello there");

      await expect(chat.message(rejection.text)).toBeVisible();
      // The raw code or backend text is never shown.
      await expect(page.getByText(/WKFLO/)).toHaveCount(0);
      // The chat stays usable.
      await expect(chat.input).toBeEnabled();
    });
  }
});

test.describe("Test Agent chat: a turn that fails while answering", () => {
  const runtimeCodes: Array<{ code: string; text: string }> = [
    { code: "WKFLOAI1101", text: "Something went wrong while answering. Please try again." },
    { code: "WKFLOAI1102", text: "The assistant took too long to reply. Please try again." },
    { code: "WKFLOAI1103", text: "The assistant is busy right now. Please wait a moment and try again." },
    { code: "WKFLOAI1104", text: "The assistant has reached its usage limit. Please contact Support." },
    { code: "WKFLOAI1105", text: "The assistant couldn't connect to its AI service. Please contact Support." },
    { code: "WKFLOAI1106", text: "The assistant couldn't answer this message because of its content policy. Please rephrase it and try again." },
    { code: "WKFLOAI1107", text: "This conversation has become too long. Please start a new chat and try again." },
    { code: "WKFLOAI1108", text: "The assistant's AI service isn't available right now. Please try again later." },
    { code: "WKFLOAI1109", text: "This assistant isn't set up correctly. Please contact Support." },
    { code: "WKFLOAI1110", text: "The assistant didn't return an answer. Please try again." },
    { code: "WKFLOAI1111", text: "This assistant isn't available right now. Please refresh the page and try again." },
    { code: "WKFLOAI1112", text: "A tool this assistant uses isn't available right now." },
    { code: "WKFLOAI1113", text: "A tool this assistant uses isn't available right now." },
    { code: "WKFLOAI1114", text: "Your attachment couldn't be processed. Please try again or use a different file." },
    { code: "WKFLOAI1115", text: "Something went wrong on our side. Please try again in a moment." },
    { code: "WKFLOAI1116", text: "The assistants couldn't complete your request. Please try again." },
    { code: "WKFLOAI1117", text: "The spoken reply couldn't be played. You can still read the answer in the chat." },
    { code: "WKFLOAI9999", text: "Something went wrong while answering. Please try again." },
  ];

  for (const { code, text } of runtimeCodes) {
    test(`maps ${code} to its friendly text`, async ({ page, mockApi, hub }) => {
      installChatMocks(mockApi);
      const chat = new TestAgentChatPage(page, hub);
      await chat.open();
      await chat.send("Hello there");

      emitRuntimeError(hub, chat.sessionId, code);

      // An exact match inside the bubble (which also shows the time), so a similar text such as the
      // send-side "tool unavailable" one can't pass for this one.
      await expect(chat.errorBubble.getByText(text, { exact: true })).toBeVisible();
      await expect(chat.errorBubble).toHaveAttribute("data-severity", "error");
      await expect(page.getByText(code)).toHaveCount(0);
      // A terminal error ends the turn: the chat is idle and can be used again.
      await expect(chat.stopButton).toBeHidden();
      await expect(chat.input).toBeEnabled();
    });
  }

  test("a known detail code next to WKFLOAI1111 shows the detail's own text", async ({ page, mockApi, hub }) => {
    installChatMocks(mockApi);
    const chat = new TestAgentChatPage(page, hub);
    await chat.open();
    await chat.send("Hello there");

    emitRuntimeError(hub, chat.sessionId, "WKFLOAI1111", { detailCode: "WKFLOAI0305" });

    await expect(chat.errorBubble).toHaveText(/This assistant can't chat right now\. Please try again later\./);
  });

  test("an unknown detail code keeps the WKFLOAI1111 text", async ({ page, mockApi, hub }) => {
    installChatMocks(mockApi);
    const chat = new TestAgentChatPage(page, hub);
    await chat.open();
    await chat.send("Hello there");

    emitRuntimeError(hub, chat.sessionId, "WKFLOAI1111", { detailCode: "WKFLOAI9999" });

    await expect(chat.errorBubble).toHaveText(/This assistant isn't available right now\. Please refresh the page and try again\./);
  });

  test("a warning (tool unavailable) is shown as a status and the turn goes on", async ({ page, mockApi, hub }) => {
    installChatMocks(mockApi);
    const chat = new TestAgentChatPage(page, hub);
    await chat.open();
    await chat.send("Hello there");

    emitRuntimeError(hub, chat.sessionId, "WKFLOAI1112", { severity: "warning", isTerminal: false });

    await expect(chat.errorBubble).toHaveAttribute("data-severity", "warning");
    await expect(chat.errorBubble).toHaveText(/A tool this assistant uses isn't available right now\./);
    // The agent is still working on the turn, so Stop is offered, then the answer arrives.
    await expect(chat.stopButton).toBeVisible();
    hub.streamReply(chat.sessionId, ["Here is what I found."]);
    await expect(chat.message("Here is what I found.")).toBeVisible();
    await expect(chat.sendButton).toBeVisible();
  });
});
