// Pin query helpers (Phase 4.3.4).
//
// Pins are polymorphic — they reference one of four source kinds (capture,
// project, thread, journal_entry). Source rows aren't FK-constrained because
// SQL doesn't support polymorphic FKs cleanly; orphans are filtered out at
// read time when listing.

import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import type { Pin, PinSourceKind } from '@/lib/types/pins';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function untypedSupabase(): Promise<any> {
  return createClient();
}

export async function listPins(): Promise<Pin[]> {
  const supabase = await untypedSupabase();
  const { data, error } = await supabase
    .from('pins')
    .select('*')
    .order('pinned_at', { ascending: false });
  if (error) {
    logger.error('pins.list.failed', { err: error.message });
    return [];
  }
  return (data ?? []) as Pin[];
}

export async function isPinned(
  sourceKind: PinSourceKind,
  sourceId: string,
): Promise<boolean> {
  const supabase = await untypedSupabase();
  const { data, error } = await supabase
    .from('pins')
    .select('source_id')
    .eq('source_kind', sourceKind)
    .eq('source_id', sourceId)
    .maybeSingle();
  if (error) {
    logger.error('pins.isPinned.failed', { sourceKind, sourceId, err: error.message });
    return false;
  }
  return Boolean(data);
}

/**
 * Returns a Set of "kind:id" strings for fast pinned-state lookup when
 * rendering a list. Caller uses `pinned.has('${kind}:${id}')`.
 */
export async function pinnedSetForOwner(): Promise<Set<string>> {
  const pins = await listPins();
  return new Set(pins.map((p) => `${p.source_kind}:${p.source_id}`));
}

export async function pinCounts(): Promise<{
  total: number;
  byKind: Record<PinSourceKind, number>;
}> {
  const pins = await listPins();
  const byKind: Record<PinSourceKind, number> = {
    capture: 0,
    project: 0,
    thread: 0,
    journal_entry: 0,
  };
  for (const p of pins) {
    if (p.source_kind in byKind) byKind[p.source_kind] += 1;
  }
  return { total: pins.length, byKind };
}

/**
 * Resolve the listed pins to the underlying rows for /top-of-mind.
 * Returns a flat list of cards in pinned-at desc order, with each card
 * carrying enough info to render (title, kind/seed, link href).
 */
export type PinnedCard = {
  source_kind: PinSourceKind;
  source_id: string;
  pinned_at: string;
  title: string;
  href: string;
  /** For captures: the kind. For projects: kind_seed. For threads: kind. */
  kind?: string | undefined;
  /** Short preview body (one line). */
  preview?: string | undefined;
};

export async function listPinnedCards(): Promise<PinnedCard[]> {
  const supabase = await untypedSupabase();
  const pins = await listPins();
  if (pins.length === 0) return [];

  // Bucket source_ids by kind so we do at most 4 queries.
  const buckets: Record<PinSourceKind, string[]> = {
    capture: [],
    project: [],
    thread: [],
    journal_entry: [],
  };
  for (const p of pins) {
    buckets[p.source_kind].push(p.source_id);
  }

  const [captures, projects, threads, journal] = await Promise.all([
    buckets.capture.length
      ? supabase
          .from('captures')
          .select('id, title, kind, content')
          .in('id', buckets.capture)
          .is('deleted_at', null)
      : { data: [] },
    buckets.project.length
      ? supabase
          .from('projects')
          .select('id, title, deck, kind_seed')
          .in('id', buckets.project)
      : { data: [] },
    buckets.thread.length
      ? supabase
          .from('threads')
          .select('id, kind, capture_id')
          .in('id', buckets.thread)
      : { data: [] },
    buckets.journal_entry.length
      ? supabase
          .from('journal_entries')
          .select('id, body, written_at, tags')
          .in('id', buckets.journal_entry)
      : { data: [] },
  ]);

  // Threads need their seed-capture title; pull those in one pass.
  const threadRows =
    (threads as { data: Array<{ id: string; kind: string; capture_id: string }> })
      .data ?? [];
  const threadCaptureIds = threadRows.map((t) => t.capture_id);
  const { data: threadCaptureRows } = threadCaptureIds.length
    ? await supabase
        .from('captures')
        .select('id, title')
        .in('id', threadCaptureIds)
        .is('deleted_at', null)
    : { data: [] as Array<{ id: string; title: string }> };
  const threadCaptureTitle = new Map(
    ((threadCaptureRows ?? []) as Array<{ id: string; title: string }>).map((c) => [c.id, c.title]),
  );

  const captureMap = new Map(
    (
      ((captures as { data: Array<{ id: string; title: string; kind: string; content: string | null }> })
        .data ?? []) as Array<{ id: string; title: string; kind: string; content: string | null }>
    ).map((c) => [c.id, c]),
  );
  const projectMap = new Map(
    (
      ((projects as { data: Array<{ id: string; title: string; deck: string | null; kind_seed: string | null }> })
        .data ?? []) as Array<{ id: string; title: string; deck: string | null; kind_seed: string | null }>
    ).map((p) => [p.id, p]),
  );
  const threadMap = new Map(threadRows.map((t) => [t.id, t]));
  const journalMap = new Map(
    (
      ((journal as { data: Array<{ id: string; body: string; written_at: string; tags: string[] }> })
        .data ?? []) as Array<{ id: string; body: string; written_at: string; tags: string[] }>
    ).map((j) => [j.id, j]),
  );

  // Build cards, dropping any pins whose source no longer exists (orphans).
  const cards: PinnedCard[] = [];
  for (const p of pins) {
    if (p.source_kind === 'capture') {
      const c = captureMap.get(p.source_id);
      if (!c) continue;
      cards.push({
        source_kind: 'capture',
        source_id: p.source_id,
        pinned_at: p.pinned_at,
        title: c.title,
        href: `/capture/${p.source_id}`,
        kind: c.kind,
        preview: previewText(c.content),
      });
    } else if (p.source_kind === 'project') {
      const pr = projectMap.get(p.source_id);
      if (!pr) continue;
      cards.push({
        source_kind: 'project',
        source_id: p.source_id,
        pinned_at: p.pinned_at,
        title: pr.title,
        href: `/projects/${p.source_id}`,
        kind: pr.kind_seed ?? undefined,
        preview: pr.deck ?? undefined,
      });
    } else if (p.source_kind === 'thread') {
      const t = threadMap.get(p.source_id);
      if (!t) continue;
      cards.push({
        source_kind: 'thread',
        source_id: p.source_id,
        pinned_at: p.pinned_at,
        title: threadCaptureTitle.get(t.capture_id) ?? '(untitled)',
        href: `/threads/${p.source_id}`,
        kind: t.kind,
      });
    } else if (p.source_kind === 'journal_entry') {
      const j = journalMap.get(p.source_id);
      if (!j) continue;
      cards.push({
        source_kind: 'journal_entry',
        source_id: p.source_id,
        pinned_at: p.pinned_at,
        title: j.written_at,
        href: `/journal#${p.source_id}`,
        preview: previewText(j.body),
      });
    }
  }

  return cards;
}

function previewText(s: string | null | undefined): string {
  if (!s) return '';
  const oneLine = s.replace(/\s+/g, ' ').trim();
  return oneLine.length > 140 ? oneLine.slice(0, 140) + '…' : oneLine;
}
