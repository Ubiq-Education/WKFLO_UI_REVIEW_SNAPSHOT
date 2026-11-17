export type FormattedJson = {
  /** Pretty-printed JSON (2-space indent), or the raw input when it isn't valid JSON. */
  text: string;
  isValidJson: boolean;
};

/**
 * Pretty-prints a JSON string for display. Falls back to the raw string unchanged when it
 * can't be parsed, so callers can always render something. String values that themselves
 * contain JSON are left as-is (not parsed recursively).
 */
export function formatJson(raw: string): FormattedJson {
  try {
    return { text: JSON.stringify(JSON.parse(raw), null, 2), isValidJson: true };
  } catch {
    return { text: raw, isValidJson: false };
  }
}
