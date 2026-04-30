// Links domain types (Phase 5.2).
//
// Locally-typed shape until `pnpm db:types` is re-run after applying the
// 20260430185802 migration.

export const LINK_SOURCE_KINDS = [
  'capture',
  'project',
  'thread',
  'journal_entry',
] as const;
export type LinkSourceKind = (typeof LINK_SOURCE_KINDS)[number];

export const LINK_KINDS = ['manual', 'ai_suggested', 'inferred'] as const;
export type LinkKind = (typeof LINK_KINDS)[number];

export type Link = {
  id: string;
  owner_id: string;
  source_kind: LinkSourceKind;
  source_id: string;
  target_kind: LinkSourceKind;
  target_id: string;
  kind: LinkKind;
  reason: string | null;
  created_at: string;
  accepted_at: string | null;
};

/**
 * Hydrated connection row used by the Connections panel on detail pages.
 * Direction is relative to the current detail page's item:
 *   - 'out' = current item is the source, the other endpoint is the target
 *   - 'in'  = current item is the target, the other endpoint is the source
 */
export type Connection = {
  id: string;
  /** Direction relative to the page's anchor item. */
  direction: 'in' | 'out';
  /** The "other" endpoint — what we render in the row. */
  other_kind: LinkSourceKind;
  other_id: string;
  other_title: string;
  /** Detail-page href for the other endpoint. */
  other_href: string;
  /** Optional reasoning text (LLM justification or user note). */
  reason: string | null;
  link_kind: LinkKind;
  created_at: string;
};

/**
 * Canonicalize a link pair: returns the (source, target) tuple in a
 * deterministic order so dedupe-on-write works regardless of who's the
 * source vs. target. Order is (kind, id) lexicographic.
 *
 * NOT used by every code path — manual links record the user's chosen
 * direction. But for "is there already ANY link between X and Y?" checks
 * we compare both orderings.
 */
export function pairKey(
  aKind: LinkSourceKind,
  aId: string,
  bKind: LinkSourceKind,
  bId: string,
): string {
  const a = `${aKind}:${aId}`;
  const b = `${bKind}:${bId}`;
  return a <= b ? `${a}|${b}` : `${b}|${a}`;
}
