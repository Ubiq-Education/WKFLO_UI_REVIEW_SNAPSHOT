/**
 * WI 7726: optional, admin-chosen display text for MCP tool functions. The original `name` stays
 * the function's identity everywhere (allowlists, permissions, prompt tokens, React keys); these
 * values only change what people see.
 */
export interface ToolDisplaySource {
  name: string;
  description?: string | null;
  displayName?: string | null;
  displayDescription?: string | null;
}

/** Same limits the backend validates (PLAN.md). */
export const TOOL_DISPLAY_NAME_MAX_LENGTH = 100;
export const TOOL_DISPLAY_DESCRIPTION_MAX_LENGTH = 500;

/** Trims a display value; anything that isn't a non-blank string becomes null ("not set"). */
export function normalizeDisplayText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** The friendly name when one is set, the original name otherwise. */
export function toolDisplayName(source: ToolDisplaySource): string {
  return normalizeDisplayText(source.displayName) ?? source.name;
}

/** The friendly description when one is set, the original description (or null) otherwise. */
export function toolDisplayDescription(source: ToolDisplaySource): string | null {
  return normalizeDisplayText(source.displayDescription) ?? (source.description || null);
}
