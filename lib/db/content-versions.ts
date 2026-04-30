// content_versions write helper (Phase 4.3.5).
//
// Each save of a thread or journal_entry inserts a row capturing the full
// body at save time. UI for browsing versions ships in Phase 5; for now,
// rows accumulate quietly so when the version-history view lands the data is
// already there.
//
// Untyped escape hatch — drop after `pnpm db:types`.

import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function untypedSupabase(): Promise<any> {
  return createClient();
}

export type ContentVersionSourceKind = 'thread' | 'journal_entry';

/**
 * Snapshot the full body for a thread or journal_entry. Best-effort: the
 * caller's primary write must have already succeeded, so a failure here is
 * logged but not fatal.
 */
export async function snapshotContentVersion(args: {
  ownerId: string;
  sourceKind: ContentVersionSourceKind;
  sourceId: string;
  body: string;
}): Promise<void> {
  const supabase = await untypedSupabase();
  const { error } = await supabase.from('content_versions').insert({
    owner_id: args.ownerId,
    source_kind: args.sourceKind,
    source_id: args.sourceId,
    body_snapshot: args.body,
  });
  if (error) {
    logger.warn('content_versions.snapshot.failed', {
      sourceKind: args.sourceKind,
      sourceId: args.sourceId,
      err: error.message,
    });
  }
}

/**
 * Serialize a thread's sections array into a stable text snapshot. Used by
 * the thread save path; one row per save captures the full thread state, so
 * "version history" later can diff between rows.
 */
export function serializeThreadSections(
  sections: Array<{ key: string; title: string; body: string }>,
): string {
  return JSON.stringify(sections);
}
