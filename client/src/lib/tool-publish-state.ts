import type { Tool } from "@shared/schema";

/**
 * WI 7726: what a tool's badge should say.
 * - "unpublished": never published.
 * - "published": published, and not changed since.
 * - "changed": published, but its draft was updated after the last publish.
 */
export type ToolPublishState = "unpublished" | "published" | "changed";

export type ToolPublishFields = Pick<Tool, "isPublished" | "lastUpdatedOn" | "lastPublishedOn">;

function toTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : time;
}

/**
 * `lastUpdatedOn` is the draft tool's own update time; `lastPublishedOn` is the time of its
 * published copy. Both are stamped by the server (UTC). Publishing only stamps the published
 * copy - never the draft - so a strict "updated after published" check needs no tolerance. The
 * backend uses the same check to require a republish before sharing.
 */
export function getToolPublishState(tool: ToolPublishFields): ToolPublishState {
  if (!tool.isPublished) return "unpublished";
  const updated = toTime(tool.lastUpdatedOn);
  const published = toTime(tool.lastPublishedOn);
  // Never edited since it was created (null) or no publish date to compare with: nothing to flag.
  if (updated === null || published === null) return "published";
  return updated > published ? "changed" : "published";
}

/**
 * WI 7726: the tool as it is right after a change to its draft that didn't refetch it (e.g. a
 * Functions panel save), so its badge can show "Unpublished changes". The time is never earlier
 * than the last publish: the change happened after it, even if this device's clock is behind.
 */
export function withDraftUpdatedNow<T extends ToolPublishFields>(tool: T, now: number = Date.now()): T {
  const published = toTime(tool.lastPublishedOn);
  const updated = Math.max(now, published === null ? now : published + 1);
  return { ...tool, lastUpdatedOn: new Date(updated).toISOString() };
}
