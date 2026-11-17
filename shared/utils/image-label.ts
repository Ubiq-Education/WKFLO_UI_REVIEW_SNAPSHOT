// Task 8215: an image in the chat (one the agent returns, or one the user uploads) comes with the
// image in `fileUrl` and no text of its own. The backend keeps a FileName/FileType label next to
// it for the model, but no longer sends it to the chat; older backends (and a rollout window)
// still do. Either way there is nothing to show beside the image, so the bubble skips its text
// row and the Info icon that goes with it.
//   returned: "FileName: '...'\nFileType: '...'"
//   uploaded: "\n FileName: '...'\n FileType: '...'" (tested after trimming)
export const IMAGE_LABEL_PATTERN = /^FileName: '[^\n]*'\n ?FileType: '[^\n]*'$/;

interface ImageMessageLike {
  fileUrl?: string | null;
  content?: string | null;
  metadata?: Record<string, unknown> | null;
}

export function isImageLabel(text?: string | null): boolean {
  return IMAGE_LABEL_PATTERN.test(text?.trim() ?? '');
}

export function isImageOnly(message: ImageMessageLike): boolean {
  if (!message.fileUrl) return false;
  // A metadata url renders inside the text row, so the row is still needed.
  if (message.metadata && 'url' in message.metadata) return false;
  const text = message.content?.trim() ?? '';
  return text === '' || isImageLabel(text);
}
