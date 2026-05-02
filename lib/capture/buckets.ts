// Phase 5.6 — single source of truth for the Stream / Library split.
//
// Stream and Library are mutually exclusive views over the same `captures`
// table. The decision rules:
//
//   Library: media_kind in ('photo', 'clip')          (any kind, any state)
//        OR  kind = 'research'                         (any media_kind)
//   Stream:  everything else (kind in {problem, idea, observation}
//                              AND media_kind in {note, voice})
//
// The Library shelf is derived from (media_kind, kind):
//   Visual : media_kind='photo'
//   Audio  : media_kind='voice' AND kind='research' (voice notes captured as
//            research are reference material; voice ideas remain in Stream)
//   Text   : media_kind='clip' OR (media_kind='note' AND kind='research')
//   Process: research outputs (the `research` table) — orthogonal axis,
//            handled by the Library page's own Process tab; this helper
//            doesn't return 'process' for raw captures.

import type { CaptureKind } from './kinds';

export type CaptureMediaKind = 'note' | 'voice' | 'photo' | 'clip';
export type LibraryShelf = 'audio' | 'visual' | 'text' | 'process';

export type BucketSignal = {
  kind: CaptureKind;
  media_kind: CaptureMediaKind | null;
};

export function isLibraryCapture(c: BucketSignal): boolean {
  if (c.media_kind === 'photo' || c.media_kind === 'clip') return true;
  if (c.kind === 'research') return true;
  return false;
}

export function isStreamCapture(c: BucketSignal): boolean {
  return !isLibraryCapture(c);
}

/**
 * Which Library shelf a capture row belongs on. Returns null for captures
 * that are NOT in Library (caller should have filtered them out first via
 * `isLibraryCapture`).
 */
export function libraryShelfFor(c: BucketSignal): Exclude<LibraryShelf, 'process'> | null {
  if (c.media_kind === 'photo') return 'visual';
  if (c.media_kind === 'voice' && c.kind === 'research') return 'audio';
  if (c.media_kind === 'clip') return 'text';
  if (c.kind === 'research' && (c.media_kind === 'note' || c.media_kind === null)) {
    return 'text';
  }
  return null;
}

/**
 * Postgrest filter expression for the Library set. Use as
 * `query.or(LIBRARY_OR)` after applying the not-archived predicate.
 *
 *   media_kind in (photo, clip) OR kind = research
 */
export const LIBRARY_OR = 'media_kind.in.(photo,clip),kind.eq.research';

/**
 * Postgrest filter expression for the Stream set — the inverse of Library:
 *
 *   kind in (problem, idea, observation) AND media_kind in (note, voice)
 *
 * Apply on top of `.neq('state','archived')`.
 */
export const STREAM_KIND_IN: CaptureKind[] = ['problem', 'idea', 'observation'];
export const STREAM_MEDIA_IN: CaptureMediaKind[] = ['note', 'voice'];
