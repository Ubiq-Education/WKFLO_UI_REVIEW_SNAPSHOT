/**
 * Helpers for the tool tokens "Add to Prompt" writes into an agent's system prompt.
 *
 * Token format: `{{tool:<toolId>:<toolName>}}`. At run time the backend
 * (SemanticKernelExtensions.ParsePrompt, wkflo_services) swaps every match of
 * `\{\{tool:<toolId>:.*?\}\}` for the tool's plugin name, so the name part is free text and only
 * the id identifies the tool. These helpers use the same pattern.
 */

export function buildToolToken(toolId: number, toolName: string): string {
  return `{{tool:${toolId}:${toolName}}}`;
}

/** The sentence "Add to Prompt" appends: `Use {{tool:<id>:<name>}} to reply <description>.` */
export function buildToolPromptSentence(toolId: number, toolName: string, toolDescription: string): string {
  return `Use ${buildToolToken(toolId, toolName)} to reply ${toolDescription}.`;
}

// Same as the backend pattern: non-greedy, stays on one line (`.` doesn't match newlines).
function toolTokenRegex(toolId: number, flags = "g"): RegExp {
  return new RegExp(`\\{\\{tool:${Math.trunc(toolId)}:.*?\\}\\}`, flags);
}

export function hasToolToken(prompt: string | null | undefined, toolId: number): boolean {
  return !!prompt && toolTokenRegex(toolId, "").test(prompt);
}

/**
 * Removes every token for `toolId` (whatever its name part) and tidies up after it:
 * - a line that is exactly the sentence "Add to Prompt" wrote (`Use <token> to reply ….`), or
 *   that holds nothing but the token(s), is dropped together with one blank line next to it,
 *   so removing what "Add to Prompt" appended gives back the original prompt;
 * - a token inside other text is cut out and the double space it leaves is collapsed.
 * Lines without a token are left exactly as they were.
 */
export function removeToolTokens(prompt: string, toolId: number): string {
  if (!hasToolToken(prompt, toolId)) return prompt;

  const generatedSentence = new RegExp(`^\\s*Use \\{\\{tool:${Math.trunc(toolId)}:.*?\\}\\} to reply .*$`);
  const lines = prompt.split("\n");
  const result: string[] = [];

  const dropAdjacentBlank = (nextIndex: number) => {
    // Prefer the blank line before (what "Add to Prompt" inserted); otherwise skip the one after.
    if (result.length > 0 && result[result.length - 1].trim() === "") {
      result.pop();
      return nextIndex;
    }
    if (nextIndex < lines.length && lines[nextIndex].trim() === "" && result.length > 0) {
      return nextIndex + 1;
    }
    return nextIndex;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!toolTokenRegex(toolId, "").test(line)) {
      result.push(line);
      continue;
    }

    const stripped = line.replace(toolTokenRegex(toolId), "");
    if (generatedSentence.test(line.replace(/\r$/, "")) || stripped.trim() === "") {
      i = dropAdjacentBlank(i + 1) - 1;
      continue;
    }

    const hadCarriageReturn = stripped.endsWith("\r");
    const tidied = stripped
      .replace(/\r$/, "")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\s+([.,;:!?])/g, "$1")
      .trimEnd();
    result.push(hadCarriageReturn ? `${tidied}\r` : tidied);
  }

  // Don't leave trailing blank lines behind when the removed line was the last thing (but keep
  // any the prompt already ended with).
  if (lines[lines.length - 1].trim() !== "") {
    while (result.length > 0 && result[result.length - 1].trim() === "") {
      result.pop();
    }
  }

  return result.join("\n");
}
