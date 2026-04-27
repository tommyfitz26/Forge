// Pure helpers for extracting structured output from Anthropic Messages API
// content blocks. Lives in its own file (no `server-only`, no env imports) so
// it's testable without standing up env vars.

export type ContentBlock =
  | { type: 'text'; text?: string }
  | { type: 'tool_use'; name?: string; input?: unknown }
  | { type: string; [k: string]: unknown };

export function extractText(content: ContentBlock[]): string {
  return content
    .filter((b): b is { type: 'text'; text?: string } => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('')
    .trim();
}

/**
 * Walk content blocks in reverse and return the input of the last `tool_use`
 * block matching the given tool name. The model may emit several tool_use
 * blocks during a research run (web_search probes); we want the *final*
 * terminal-tool call.
 */
export function extractTerminalToolInput(
  content: ContentBlock[],
  terminalToolName: string,
): unknown | undefined {
  for (let i = content.length - 1; i >= 0; i -= 1) {
    const block = content[i];
    if (
      block &&
      block.type === 'tool_use' &&
      (block as { name?: string }).name === terminalToolName
    ) {
      return (block as { input?: unknown }).input;
    }
  }
  return undefined;
}
