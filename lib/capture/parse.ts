import type { CaptureKind } from './kinds';

// SPEC §4.2 rule 1: if content starts with "problem:" / "idea:" / "observation:"
// / "research:" (case-insensitive, separator can be : - or —), strip the prefix
// and use the matched kind. The classifier LLM is NEVER called when a prefix
// matches — this is a deliberate cheap-path for the most common voice flow.
const PREFIX_REGEX = /^\s*(problem|idea|observation|research)\s*[:\-—]\s*/i;

export type ParsedPrefix =
  | { matched: true; kind: CaptureKind; stripped: string }
  | { matched: false };

export function parsePrefix(content: string): ParsedPrefix {
  const match = content.match(PREFIX_REGEX);
  if (!match) return { matched: false };
  const kind = match[1]!.toLowerCase() as CaptureKind;
  const stripped = content.slice(match[0].length);
  return { matched: true, kind, stripped };
}

// SPEC §4.2 rule 5: heuristic title fallback. Take the first 60 chars of the
// cleaned content, cut at the nearest word boundary, strip trailing punctuation.
// Used for the prefix path and as the error-path fallback when the classifier
// fails. No LLM call. Good enough; user can rename.
export function heuristicTitle(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) return 'Untitled capture';

  if (trimmed.length <= 60) {
    return stripTrailingPunct(trimmed);
  }

  // Cut at the last space before the 60-char mark.
  const cut = trimmed.slice(0, 60);
  const lastSpace = cut.lastIndexOf(' ');
  const boundary = lastSpace > 20 ? cut.slice(0, lastSpace) : cut;
  return stripTrailingPunct(boundary);
}

function stripTrailingPunct(s: string): string {
  return s.replace(/[\s.,;:!?—–\-]+$/u, '');
}
