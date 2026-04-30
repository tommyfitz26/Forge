// Trash fetcher (Phase 4.5).
//
// Unified soft-delete view across the three tables that have a `deleted_at`
// column: journal_entries, threads, projects. Captures use `state='archived'`
// instead and live on /archive — they don't show here.
//
// 30-day window: items with `deleted_at < now() - 30 days` are filtered out
// at read time. A future cron will hard-purge them.
//
// v1 entry points:
//   - journal_entries: deleteJournalEntry already soft-deletes
//   - threads: no entry point yet (4.6 context menu adds it)
//   - projects: no entry point yet (4.6 context menu adds it)
//
// Untyped escape hatch — drop after `pnpm db:types`.

import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function untypedSupabase(): Promise<any> {
  return createClient();
}

export const TRASH_KINDS = ['journal_entry', 'thread', 'project'] as const;
export type TrashKind = (typeof TRASH_KINDS)[number];

export type TrashItem = {
  kind: TrashKind;
  id: string;
  /** Best-effort title for display. Journal entries: their date. */
  title: string;
  /** One-line preview if applicable. */
  preview: string | null;
  deleted_at: string;
  /** Days since deletion (rounded). */
  ageDays: number;
  /** Days remaining before auto-purge. */
  daysLeft: number;
  href: string | null;
};

const WINDOW_DAYS = 30;

function ageDays(isoDeletedAt: string, now: number): number {
  return Math.floor((now - new Date(isoDeletedAt).getTime()) / 86_400_000);
}

function previewLine(s: string | null | undefined): string | null {
  if (!s) return null;
  const oneLine = s.replace(/\s+/g, ' ').trim();
  if (!oneLine) return null;
  return oneLine.length > 140 ? oneLine.slice(0, 140) + '…' : oneLine;
}

function isoDayFormatted(s: string): string {
  // Render written_at as "Apr 27, 2026".
  const d = new Date(`${s}T12:00:00Z`);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export async function listTrash(): Promise<TrashItem[]> {
  const supabase = await untypedSupabase();
  const cutoff = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();
  const now = Date.now();

  const [journalRes, threadsRes, projectsRes] = await Promise.all([
    supabase
      .from('journal_entries')
      .select('id, written_at, body, deleted_at')
      .not('deleted_at', 'is', null)
      .gte('deleted_at', cutoff)
      .order('deleted_at', { ascending: false })
      .limit(200),
    supabase
      .from('threads')
      .select('id, kind, capture_id, deleted_at')
      .not('deleted_at', 'is', null)
      .gte('deleted_at', cutoff)
      .order('deleted_at', { ascending: false })
      .limit(200),
    supabase
      .from('projects')
      .select('id, title, deck, deleted_at')
      .not('deleted_at', 'is', null)
      .gte('deleted_at', cutoff)
      .order('deleted_at', { ascending: false })
      .limit(200),
  ]);

  if (journalRes.error) {
    logger.error('trash.journal.failed', { err: journalRes.error.message });
  }
  if (threadsRes.error) {
    logger.error('trash.threads.failed', { err: threadsRes.error.message });
  }
  if (projectsRes.error) {
    logger.error('trash.projects.failed', { err: projectsRes.error.message });
  }

  const items: TrashItem[] = [];

  for (const j of (journalRes.data ?? []) as Array<{
    id: string;
    written_at: string;
    body: string;
    deleted_at: string;
  }>) {
    const age = ageDays(j.deleted_at, now);
    items.push({
      kind: 'journal_entry',
      id: j.id,
      title: isoDayFormatted(j.written_at),
      preview: previewLine(j.body),
      deleted_at: j.deleted_at,
      ageDays: age,
      daysLeft: Math.max(0, WINDOW_DAYS - age),
      href: null, // journal entries don't have a detail route yet
    });
  }

  // Threads need their seed-capture title; resolve in one pass.
  const threadRows = (threadsRes.data ?? []) as Array<{
    id: string;
    kind: string;
    capture_id: string;
    deleted_at: string;
  }>;
  if (threadRows.length > 0) {
    const captureIds = threadRows.map((t) => t.capture_id);
    const { data: capRows } = await supabase
      .from('captures')
      .select('id, title')
      .in('id', captureIds);
    const titleMap = new Map(
      ((capRows ?? []) as Array<{ id: string; title: string }>).map((c) => [c.id, c.title]),
    );
    for (const t of threadRows) {
      const age = ageDays(t.deleted_at, now);
      items.push({
        kind: 'thread',
        id: t.id,
        title: titleMap.get(t.capture_id) ?? '(untitled thread)',
        preview: `${t.kind} thread`,
        deleted_at: t.deleted_at,
        ageDays: age,
        daysLeft: Math.max(0, WINDOW_DAYS - age),
        href: null, // /threads/[id] hides deleted_at not null rows
      });
    }
  }

  for (const p of (projectsRes.data ?? []) as Array<{
    id: string;
    title: string;
    deck: string | null;
    deleted_at: string;
  }>) {
    const age = ageDays(p.deleted_at, now);
    items.push({
      kind: 'project',
      id: p.id,
      title: p.title,
      preview: p.deck,
      deleted_at: p.deleted_at,
      ageDays: age,
      daysLeft: Math.max(0, WINDOW_DAYS - age),
      href: null,
    });
  }

  // Sort unified list by deleted_at desc.
  items.sort((a, b) => b.deleted_at.localeCompare(a.deleted_at));
  return items;
}

export async function trashCount(): Promise<{
  total: number;
  byKind: Record<TrashKind, number>;
  oldestDays: number;
}> {
  const items = await listTrash();
  const byKind: Record<TrashKind, number> = {
    journal_entry: 0,
    thread: 0,
    project: 0,
  };
  let oldest = 0;
  for (const it of items) {
    byKind[it.kind] += 1;
    if (it.ageDays > oldest) oldest = it.ageDays;
  }
  return { total: items.length, byKind, oldestDays: oldest };
}
