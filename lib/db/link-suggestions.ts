// Link-suggestion query helpers (Phase 5.3).
//
// Untyped escape hatch — drop after `pnpm db:types`.

import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import type {
  HydratedSuggestion,
  LinkSuggestion,
  LinkSuggestionSourceKind,
} from '@/lib/types/link-suggestions';
import type { LinkSourceKind } from '@/lib/types/links';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function untypedSupabase(): Promise<any> {
  return createClient();
}

/**
 * Pending suggestions for a given anchor, queried in BOTH directions:
 *   - source = anchor (the just-saved item that triggered the suggestion)
 *   - target = anchor (someone else's save proposed connecting to this item)
 *
 * Both are equally accept-worthy from the user's POV. The journal-entry
 * case especially relies on the inbound branch — /journal has no per-entry
 * detail page, so a suggestion seeded by a journal save would be invisible
 * if we only queried the source-anchor direction.
 */
export async function listPendingFor(
  anchorKind: LinkSourceKind,
  anchorId: string,
): Promise<HydratedSuggestion[]> {
  const supabase = await untypedSupabase();

  // The anchor matches as source only if the kind is a valid source kind.
  // Projects can be targets but never sources. We query both branches and
  // de-dupe by id (a single suggestion can't match both at once because of
  // the no-self CHECK).
  const sourceKinds: LinkSuggestionSourceKind[] = ['capture', 'thread', 'journal_entry'];
  const anchorIsValidSource = (sourceKinds as string[]).includes(anchorKind);

  const queries: Promise<{
    data: LinkSuggestion[] | null;
    error: { message: string } | null;
  }>[] = [
    // Inbound: anchor is the target.
    supabase
      .from('link_suggestions')
      .select('*')
      .eq('target_kind', anchorKind)
      .eq('target_id', anchorId)
      .eq('status', 'pending')
      .order('suggested_at', { ascending: false })
      .limit(5),
  ];
  if (anchorIsValidSource) {
    queries.unshift(
      supabase
        .from('link_suggestions')
        .select('*')
        .eq('source_kind', anchorKind)
        .eq('source_id', anchorId)
        .eq('status', 'pending')
        .order('suggested_at', { ascending: false })
        .limit(5),
    );
  }

  const results = await Promise.all(queries);

  type AnchorIs = 'source' | 'target';
  const collected: Array<{ row: LinkSuggestion; anchorIs: AnchorIs }> = [];

  // Result order matches the order we pushed queries above.
  if (anchorIsValidSource) {
    const outRes = results[0];
    if (outRes?.error) {
      logger.error('link_suggestions.listSource.failed', {
        anchorKind, anchorId, err: outRes.error.message,
      });
    }
    for (const r of (outRes?.data ?? []) as LinkSuggestion[]) {
      collected.push({ row: r, anchorIs: 'source' });
    }
  }
  const inRes = results[anchorIsValidSource ? 1 : 0];
  if (inRes?.error) {
    logger.error('link_suggestions.listTarget.failed', {
      anchorKind, anchorId, err: inRes.error.message,
    });
  }
  for (const r of (inRes?.data ?? []) as LinkSuggestion[]) {
    collected.push({ row: r, anchorIs: 'target' });
  }

  if (collected.length === 0) return [];

  // Hydrate the OTHER endpoint of each suggestion. "Other" depends on which
  // side the anchor matched.
  const buckets: Record<LinkSourceKind, string[]> = {
    capture: [],
    project: [],
    thread: [],
    journal_entry: [],
  };
  for (const { row, anchorIs } of collected) {
    if (anchorIs === 'source') {
      buckets[row.target_kind].push(row.target_id);
    } else {
      buckets[row.source_kind].push(row.source_id);
    }
  }

  const [capRows, projRows, thrRows, jourRows] = await Promise.all([
    buckets.capture.length
      ? supabase.from('captures').select('id, title').in('id', buckets.capture)
      : { data: [] },
    buckets.project.length
      ? supabase.from('projects').select('id, title').in('id', buckets.project)
      : { data: [] },
    buckets.thread.length
      ? supabase
          .from('threads')
          .select('id, capture_id')
          .in('id', buckets.thread)
      : { data: [] },
    buckets.journal_entry.length
      ? supabase
          .from('journal_entries')
          .select('id, written_at, body')
          .in('id', buckets.journal_entry)
      : { data: [] },
  ]);

  // Threads need their seed-capture title.
  const thrRowsData = (thrRows as { data: Array<{ id: string; capture_id: string }> }).data ?? [];
  const threadCapIds = thrRowsData.map((t) => t.capture_id);
  const { data: thrCapRows } = threadCapIds.length
    ? await supabase.from('captures').select('id, title').in('id', threadCapIds)
    : { data: [] as Array<{ id: string; title: string }> };
  const threadCapTitle = new Map(
    ((thrCapRows ?? []) as Array<{ id: string; title: string }>).map((c) => [c.id, c.title]),
  );

  const captureMap = new Map(
    ((capRows as { data: Array<{ id: string; title: string }> }).data ?? []).map((c) => [
      c.id,
      c.title,
    ]),
  );
  const projectMap = new Map(
    ((projRows as { data: Array<{ id: string; title: string }> }).data ?? []).map((p) => [
      p.id,
      p.title,
    ]),
  );
  const threadMap = new Map(
    thrRowsData.map((t) => [
      t.id,
      threadCapTitle.get(t.capture_id) ?? '(untitled thread)',
    ]),
  );
  const journalMap = new Map(
    ((jourRows as { data: Array<{ id: string; written_at: string; body: string }> })
      .data ?? []).map((j) => [
      j.id,
      formatJournalLabel(j.written_at, j.body),
    ]),
  );

  function titleOf(k: LinkSourceKind, id: string): string {
    switch (k) {
      case 'capture':
        return captureMap.get(id) ?? '(deleted capture)';
      case 'project':
        return projectMap.get(id) ?? '(deleted project)';
      case 'thread':
        return threadMap.get(id) ?? '(deleted thread)';
      case 'journal_entry':
        return journalMap.get(id) ?? '(deleted entry)';
    }
  }

  function hrefOf(k: LinkSourceKind, id: string): string {
    switch (k) {
      case 'capture':
        return `/capture/${id}`;
      case 'project':
        return `/projects/${id}`;
      case 'thread':
        return `/threads/${id}`;
      case 'journal_entry':
        return `/journal#${id}`;
    }
  }

  return collected.map(({ row, anchorIs }) => {
    const otherKind = anchorIs === 'source' ? row.target_kind : row.source_kind;
    const otherId = anchorIs === 'source' ? row.target_id : row.source_id;
    return {
      ...row,
      direction: anchorIs === 'source' ? 'out' : 'in',
      other_kind: otherKind,
      other_id: otherId,
      other_title: titleOf(otherKind, otherId),
      other_href: hrefOf(otherKind, otherId),
    };
  });
}

/**
 * Has a suggestion run produced a row with this snapshot hash in the past
 * 24 hours? Used to short-circuit redundant LLM calls when a thread / journal
 * is re-saved without meaningful content change.
 */
export async function hasRecentSuggestion(
  sourceKind: LinkSuggestionSourceKind,
  sourceId: string,
  snapshotHash: string,
): Promise<boolean> {
  const supabase = await untypedSupabase();
  const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data, error } = await supabase
    .from('link_suggestions')
    .select('id')
    .eq('source_kind', sourceKind)
    .eq('source_id', sourceId)
    .eq('source_snapshot_hash', snapshotHash)
    .gte('suggested_at', cutoff)
    .limit(1);
  if (error) {
    logger.warn('link_suggestions.hashCheck.failed', { err: error.message });
    return false; // fail open — better to suggest than to silently skip
  }
  return (data?.length ?? 0) > 0;
}

function formatJournalLabel(writtenAt: string, body: string): string {
  const d = new Date(`${writtenAt}T12:00:00Z`);
  const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const oneLine = body.replace(/\s+/g, ' ').trim();
  const preview = oneLine.length > 50 ? oneLine.slice(0, 50) + '…' : oneLine;
  return `${date} — ${preview}`;
}
