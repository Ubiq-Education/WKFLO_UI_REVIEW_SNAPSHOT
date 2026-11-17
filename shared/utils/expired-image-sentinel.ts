// Task 7030: when a previously uploaded chat image has since been deleted or its share link has
// expired, the backend does NOT return a failing/404-ing `fileUrl`. Instead it returns a
// perfectly successful message (content and/or a `contentItems` entry named "Text Content",
// both with status "success"/200) whose text is a plain sentinel, e.g.:
//   "[Image no longer available — the uploaded image has expired]"
// Without this recognized, the UI just renders that bracketed sentence as literal chat text
// instead of showing the image-expired.svg placeholder the ticket asks for.
//
// Matched loosely (case-insensitive, tolerant of the exact dash character/wording after
// "expired"/"deleted") since this string is backend-defined and not a shared constant/schema
// field we control from here — only anchored on the distinctive bracketed phrase so it doesn't
// false-positive on ordinary assistant prose that happens to mention an image being unavailable.
export const EXPIRED_IMAGE_SENTINEL_PATTERN = /\[\s*image no longer available[^\]]*(?:expired|deleted)[^\]]*\]/i;

export function isExpiredImageSentinel(text?: string | null): boolean {
  return !!text && EXPIRED_IMAGE_SENTINEL_PATTERN.test(text);
}

// Finds the first contentItems entry (if any) whose `data` is the expired-image sentinel —
// covers history/tool-style messages where the sentinel lives in a contentItems entry rather
// than (or in addition to) the message's top-level `content`.
export function findExpiredImageContentItem<T extends { data?: string }>(
  contentItems?: T[] | null
): T | undefined {
  return contentItems?.find((item) => isExpiredImageSentinel(item.data));
}
