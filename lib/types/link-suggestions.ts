// Link-suggestion domain types (Phase 5.3).
//
// Locally-typed shape until `pnpm db:types` is re-run after applying the
// 20260430192221 migration.

import type { LinkSourceKind } from './links';

/** Source kinds that *trigger* suggestions. Projects don't (they're derived
 *  from captures); only capture/thread/journal_entry kick off suggest_links. */
export const LINK_SUGGESTION_SOURCE_KINDS = [
  'capture',
  'thread',
  'journal_entry',
] as const;
export type LinkSuggestionSourceKind =
  (typeof LINK_SUGGESTION_SOURCE_KINDS)[number];

export type LinkSuggestionStatus = 'pending' | 'accepted' | 'dismissed';

export type LinkSuggestion = {
  id: string;
  owner_id: string;
  source_kind: LinkSuggestionSourceKind;
  source_id: string;
  target_kind: LinkSourceKind;
  target_id: string;
  reason: string;
  status: LinkSuggestionStatus;
  source_snapshot_hash: string;
  suggested_at: string;
  resolved_at: string | null;
};

/** Row shape used by the SuggestionsPanel.
 *
 * `direction` is relative to the page's anchor item:
 *   - 'out' = anchor is the source, the chip points to the target
 *   - 'in'  = anchor is the target, the chip points back to the source
 *
 * Either way `other_*` describes the OTHER endpoint — the thing we want
 * the user to click through to. Acceptance writes a `links` row with the
 * suggestion's stored source/target ordering preserved (so directionality
 * is consistent regardless of which side the user accepted from).
 */
export type HydratedSuggestion = LinkSuggestion & {
  direction: 'in' | 'out';
  other_kind: import('./links').LinkSourceKind;
  other_id: string;
  other_title: string;
  other_href: string;
};
