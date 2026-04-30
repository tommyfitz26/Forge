// Links query helpers (Phase 5.2).
//
// The links table is polymorphic any-to-any across (capture, project, thread,
// journal_entry). Detail pages call `listConnectionsFor(kind, id)` to render
// the Connections panel; the link palette calls `linkExists` to dedupe.
//
// Untyped escape hatch — drop after `pnpm db:types`.

import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import type {
  Connection,
  Link,
  LinkSourceKind,
} from '@/lib/types/links';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function untypedSupabase(): Promise<any> {
  return createClient();
}

/** Inbound + outbound links for a single anchor item. */
export async function listLinksFor(
  kind: LinkSourceKind,
  id: string,
): Promise<{ outbound: Link[]; inbound: Link[] }> {
  const supabase = await untypedSupabase();
  const [outRes, inRes] = await Promise.all([
    supabase
      .from('links')
      .select('*')
      .eq('source_kind', kind)
      .eq('source_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('links')
      .select('*')
      .eq('target_kind', kind)
      .eq('target_id', id)
      .order('created_at', { ascending: false }),
  ]);
  if (outRes.error) {
    logger.error('links.listOut.failed', { kind, id, err: outRes.error.message });
  }
  if (inRes.error) {
    logger.error('links.listIn.failed', { kind, id, err: inRes.error.message });
  }
  return {
    outbound: (outRes.data ?? []) as Link[],
    inbound: (inRes.data ?? []) as Link[],
  };
}

/**
 * Hydrate the linked items for the Connections panel: pulls the title +
 * detail href for the "other" endpoint of every link in/out of the anchor.
 * Bucketed by kind so we do at most 4 lookup queries.
 */
export async function listConnectionsFor(
  kind: LinkSourceKind,
  id: string,
): Promise<Connection[]> {
  const { outbound, inbound } = await listLinksFor(kind, id);
  if (outbound.length === 0 && inbound.length === 0) return [];

  // Collect every "other" endpoint we need to title-resolve.
  const wanted: Record<LinkSourceKind, Set<string>> = {
    capture: new Set(),
    project: new Set(),
    thread: new Set(),
    journal_entry: new Set(),
  };
  for (const l of outbound) wanted[l.target_kind].add(l.target_id);
  for (const l of inbound) wanted[l.source_kind].add(l.source_id);

  const supabase = await untypedSupabase();
  const [captureRows, projectRows, threadRows, journalRows] = await Promise.all([
    wanted.capture.size
      ? supabase.from('captures').select('id, title').in('id', [...wanted.capture])
      : { data: [] },
    wanted.project.size
      ? supabase.from('projects').select('id, title').in('id', [...wanted.project])
      : { data: [] },
    wanted.thread.size
      ? supabase.from('threads').select('id, capture_id').in('id', [...wanted.thread])
      : { data: [] },
    wanted.journal_entry.size
      ? supabase
          .from('journal_entries')
          .select('id, written_at, body')
          .in('id', [...wanted.journal_entry])
      : { data: [] },
  ]);

  // Threads need their seed-capture title.
  const threadDataRaw = (threadRows as { data: Array<{ id: string; capture_id: string }> }).data ?? [];
  const threadCaptureIds = threadDataRaw.map((t) => t.capture_id);
  const { data: threadCaptureRows } = threadCaptureIds.length
    ? await supabase.from('captures').select('id, title').in('id', threadCaptureIds)
    : { data: [] as Array<{ id: string; title: string }> };
  const threadCaptureTitleMap = new Map(
    ((threadCaptureRows ?? []) as Array<{ id: string; title: string }>).map((c) => [
      c.id,
      c.title,
    ]),
  );

  const captureMap = new Map(
    ((captureRows as { data: Array<{ id: string; title: string }> }).data ?? []).map((c) => [
      c.id,
      c.title,
    ]),
  );
  const projectMap = new Map(
    ((projectRows as { data: Array<{ id: string; title: string }> }).data ?? []).map((p) => [
      p.id,
      p.title,
    ]),
  );
  const threadMap = new Map(
    threadDataRaw.map((t) => [
      t.id,
      threadCaptureTitleMap.get(t.capture_id) ?? '(untitled thread)',
    ]),
  );
  const journalMap = new Map(
    ((journalRows as { data: Array<{ id: string; written_at: string; body: string }> })
      .data ?? []).map((j) => [
      j.id,
      formatJournalLabel(j.written_at, j.body),
    ]),
  );

  function titleOf(k: LinkSourceKind, otherId: string): string {
    switch (k) {
      case 'capture':
        return captureMap.get(otherId) ?? '(deleted capture)';
      case 'project':
        return projectMap.get(otherId) ?? '(deleted project)';
      case 'thread':
        return threadMap.get(otherId) ?? '(deleted thread)';
      case 'journal_entry':
        return journalMap.get(otherId) ?? '(deleted entry)';
    }
  }

  function hrefOf(k: LinkSourceKind, otherId: string): string {
    switch (k) {
      case 'capture':
        return `/capture/${otherId}`;
      case 'project':
        return `/projects/${otherId}`;
      case 'thread':
        return `/threads/${otherId}`;
      case 'journal_entry':
        return `/journal#${otherId}`;
    }
  }

  const rows: Connection[] = [];
  for (const l of outbound) {
    rows.push({
      id: l.id,
      direction: 'out',
      other_kind: l.target_kind,
      other_id: l.target_id,
      other_title: titleOf(l.target_kind, l.target_id),
      other_href: hrefOf(l.target_kind, l.target_id),
      reason: l.reason,
      link_kind: l.kind,
      created_at: l.created_at,
    });
  }
  for (const l of inbound) {
    rows.push({
      id: l.id,
      direction: 'in',
      other_kind: l.source_kind,
      other_id: l.source_id,
      other_title: titleOf(l.source_kind, l.source_id),
      other_href: hrefOf(l.source_kind, l.source_id),
      reason: l.reason,
      link_kind: l.kind,
      created_at: l.created_at,
    });
  }
  rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return rows;
}

/**
 * Does ANY link already exist between the two endpoints? Considers both
 * directions so the link palette can warn about duplicates.
 */
export async function linkExists(
  aKind: LinkSourceKind,
  aId: string,
  bKind: LinkSourceKind,
  bId: string,
): Promise<boolean> {
  const supabase = await untypedSupabase();
  const { data, error } = await supabase
    .from('links')
    .select('id')
    .or(
      // Source = a AND target = b OR source = b AND target = a
      `and(source_kind.eq.${aKind},source_id.eq.${aId},target_kind.eq.${bKind},target_id.eq.${bId}),and(source_kind.eq.${bKind},source_id.eq.${bId},target_kind.eq.${aKind},target_id.eq.${aId})`,
    )
    .limit(1);
  if (error) {
    logger.error('links.exists.failed', {
      aKind, aId, bKind, bId, err: error.message,
    });
    return false;
  }
  return (data?.length ?? 0) > 0;
}

function formatJournalLabel(writtenAt: string, body: string): string {
  // "Apr 27 — three lines about something..."
  const d = new Date(`${writtenAt}T12:00:00Z`);
  const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const oneLine = body.replace(/\s+/g, ' ').trim();
  const preview = oneLine.length > 50 ? oneLine.slice(0, 50) + '…' : oneLine;
  return `${date} — ${preview}`;
}
