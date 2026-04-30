// Per-kind section templates for thread canvases.
//
// These mirror the develop-prompt templates in SPEC.md §4.6 — the prompt asks
// Claude these questions; the thread is where the user records the answers.
//
// Locked by UI-REDESIGN-SPEC.md §15 (Section 19, open question #4 resolved).

import type { CaptureKind } from '@/lib/capture/kinds';

export type ThreadSection = {
  /** Stable identifier — never changes, even if the title/body do. */
  key: string;
  /** Human-readable section heading. */
  title: string;
  /** Free-form text content. Empty when the thread is first seeded. */
  body: string;
};

/**
 * Returns a fresh sections array for a new thread of the given kind.
 * Always returns a NEW array of NEW objects — safe to insert directly.
 */
export function sectionsForKind(kind: CaptureKind): ThreadSection[] {
  const template = TEMPLATES[kind];
  return template.map((s) => ({ key: s.key, title: s.title, body: '' }));
}

/**
 * Whether a kind has a section with the given key. Used by the
 * updateThreadSection action to validate input.
 */
export function isValidSectionKey(kind: CaptureKind, key: string): boolean {
  return TEMPLATES[kind].some((s) => s.key === key);
}

const TEMPLATES: Record<CaptureKind, Array<{ key: string; title: string }>> = {
  idea: [
    { key: 'customer', title: 'Customer' },
    { key: 'why_now', title: 'Why now' },
    { key: 'wedge', title: 'Wedge' },
    { key: 'counter', title: 'Strongest counter' },
    { key: 'must_be_true', title: 'What must be true' },
  ],
  problem: [
    { key: 'who_experiences', title: 'Who experiences it' },
    { key: 'how_often', title: 'How often' },
    { key: 'real_cost', title: 'Real cost' },
    { key: 'prior_attempts', title: 'Prior attempts' },
  ],
  observation: [
    { key: 'why_captured', title: 'Why I captured this' },
    { key: 'connections', title: 'Connections' },
    { key: 'hidden_kind', title: 'Hidden problem or idea' },
  ],
  research: [
    { key: 'the_question', title: 'The question' },
    { key: 'decision_implications', title: 'Decision implications' },
    { key: 'depth', title: 'Depth (scan or investigation)' },
  ],
};
