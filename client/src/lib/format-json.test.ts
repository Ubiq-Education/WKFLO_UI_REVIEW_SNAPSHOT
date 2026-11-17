import { describe, expect, it } from "vitest";
import { formatJson } from "./format-json";

describe("formatJson", () => {
  it("pretty-prints valid JSON with a 2-space indent", () => {
    const result = formatJson('{"Name":{"old":"A","new":"B"}}');

    expect(result.isValidJson).toBe(true);
    expect(result.text).toBe('{\n  "Name": {\n    "old": "A",\n    "new": "B"\n  }\n}');
  });

  it("returns the raw string unchanged when it is not valid JSON", () => {
    const raw = "{not json";

    expect(formatJson(raw)).toEqual({ text: raw, isValidJson: false });
  });

  it("does not recursively parse string values that contain JSON", () => {
    const result = formatJson(JSON.stringify({ Config: { old: null, new: '{"a":1}' } }));

    expect(result.isValidJson).toBe(true);
    expect(result.text).toContain('"new": "{\\"a\\":1}"');
  });

  it("handles JSON primitives", () => {
    expect(formatJson("42")).toEqual({ text: "42", isValidJson: true });
    expect(formatJson("null")).toEqual({ text: "null", isValidJson: true });
  });

  it("treats an empty string as invalid JSON", () => {
    expect(formatJson("")).toEqual({ text: "", isValidJson: false });
  });
});
