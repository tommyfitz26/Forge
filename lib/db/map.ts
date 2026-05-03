// Knowledge-graph fetcher for /map (Phase 5.8).
//
// Pulls nodes from 5 source tables (captures + projects + threads +
// journal_entries + entities) and edges from 2 (links + mentions). The
// MapCanvas client island runs a d3-force layout over the result.
//
// All queries are owner-scoped via RLS — no manual ownerId predicates needed.
// Date-window filtering is applied server-side to keep the payload small;
// "all" returns everything in the user's scope.

import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import type { CaptureKind, CaptureState } from '@/lib/capture/kinds';
import type { EntityKind } from '@/lib/ai/tasks';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function untypedSupabase(): Promise<any> {
  return createClient();
}

export type GraphNodeKind =
  | 'capture'
  | 'project'
  | 'thread'
  | 'journal_entry'
  | EntityKind;

/** Plain serializable node — d3-force adds x/y/vx/vy at runtime. */
export type GraphNode = {
  id: string;
  /** Composite kind for color + filter chips. */
  kind: GraphNodeKind;
  /** Short human label. */
  label: string;
  /** Detail-page href to navigate to on click. */
  href: string;
  /** ISO timestamp used by date-window filter + by node sizing (newer = bigger). */
  created_at: string;
  /** For sizing: total in+out edges. Computed after edges land. */
  degree: number;
};

export type GraphEdge = {
  source: string; // node id
  target: string; // node id
  /** Edge source-of-truth: 'links' table or 'mentions' table. */
  kind: 'link' | 'mention';
};

export type MapWindow = 30 | 90 | 'all';

export type KnowledgeGraph = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Date window applied to fetch, for the UI to echo back. */
  windowDays: MapWindow;
};

export async function getKnowledgeGraph(
  windowDays: MapWindow = 90,
): Promise<KnowledgeGraph> {
  const supabase = await untypedSupabase();
  const cutoff =
    windowDays === 'all'
      ? null
      : new Date(Date.now() - windowDays * 86_400_000).toISOString();

  // Fetch each kind in parallel. RLS does the per-user filtering.
  const queries = await Promise.all([
    fetchCaptures(supabase, cutoff),
    fetchProjects(supabase, cutoff),
    fetchThreads(supabase, cutoff),
    fetchJournal(supabase, cutoff),
    fetchEntities(supabase, cutoff),
    fetchLinks(supabase),
    fetchMentions(supabase),
  ]);

  const [captures, projects, threads, journal, entities, links, mentions] = queries;

  const nodes: GraphNode[] = [];
  for (const c of captures) {
    nodes.push({
      id: `capture:${c.id}`,
      kind: 'capture',
      label: c.title,
      href: `/capture/${c.id}`,
      created_at: c.created_at,
      degree: 0,
    });
  }
  for (const p of projects) {
    nodes.push({
      id: `project:${p.id}`,
      kind: 'project',
      label: p.title,
      href: `/projects/${p.id}`,
      created_at: p.created_at,
      degree: 0,
    });
  }
  // Threads need their seed-capture title.
  if (threads.length > 0) {
    const captureIds = threads.map((t) => t.capture_id);
    const { data: capRows } = await supabase
      .from('captures')
      .select('id, title')
      .in('id', captureIds);
    const titleMap = new Map(
      ((capRows ?? []) as Array<{ id: string; title: string }>).map((c) => [c.id, c.title]),
    );
    for (const t of threads) {
      nodes.push({
        id: `thread:${t.id}`,
        kind: 'thread',
        label: titleMap.get(t.capture_id) ?? '(untitled thread)',
        href: `/threads/${t.id}`,
        created_at: t.created_at,
        degree: 0,
      });
    }
  }
  for (const j of journal) {
    nodes.push({
      id: `journal_entry:${j.id}`,
      kind: 'journal_entry',
      label: formatJournalLabel(j.written_at, j.body),
      href: `/journal#${j.id}`,
      created_at: j.written_at,
      degree: 0,
    });
  }
  for (const e of entities) {
    nodes.push({
      id: `${e.kind}:${e.id}`,
      kind: e.kind,
      label: e.name,
      href: `/atlas/${e.id}`,
      created_at: e.created_at,
      degree: 0,
    });
  }

  const nodeIdSet = new Set(nodes.map((n) => n.id));
  const edges: GraphEdge[] = [];

  // links table → polymorphic source/target across the four content kinds.
  for (const l of links) {
    const source = `${l.source_kind}:${l.source_id}`;
    const target = `${l.target_kind}:${l.target_id}`;
    if (!nodeIdSet.has(source) || !nodeIdSet.has(target)) continue;
    edges.push({ source, target, kind: 'link' });
  }

  // mentions table → capture ↔ entity (kind embedded in the entity row).
  // Need to know each entity's kind to compose its node id; pull from the
  // entities snapshot we already have.
  const entityKindMap = new Map(entities.map((e) => [e.id, e.kind]));
  for (const m of mentions) {
    const ekind = entityKindMap.get(m.entity_id);
    if (!ekind) continue;
    const source = `capture:${m.capture_id}`;
    const target = `${ekind}:${m.entity_id}`;
    if (!nodeIdSet.has(source) || !nodeIdSet.has(target)) continue;
    edges.push({ source, target, kind: 'mention' });
  }

  // Compute degree for sizing.
  const degreeMap = new Map<string, number>();
  for (const e of edges) {
    degreeMap.set(e.source, (degreeMap.get(e.source) ?? 0) + 1);
    degreeMap.set(e.target, (degreeMap.get(e.target) ?? 0) + 1);
  }
  for (const n of nodes) {
    n.degree = degreeMap.get(n.id) ?? 0;
  }

  logger.info('map.graph.built', {
    nodeCount: nodes.length,
    edgeCount: edges.length,
    windowDays,
  });

  return { nodes, edges, windowDays };
}

// ---------------------------------------------------------------------------
// Per-table fetchers
// ---------------------------------------------------------------------------

type TimestampedRow = {
  id: string;
  created_at: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchCaptures(supabase: any, cutoff: string | null) {
  let query = supabase
    .from('captures')
    .select('id, title, created_at')
    .neq('state', 'archived')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(500);
  if (cutoff) query = query.gte('created_at', cutoff);
  const { data, error } = await query;
  if (error) logger.warn('map.captures.failed', { err: error.message });
  return (data ?? []) as Array<TimestampedRow & { title: string }>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchProjects(supabase: any, cutoff: string | null) {
  let query = supabase
    .from('projects')
    .select('id, title, created_at')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(200);
  if (cutoff) query = query.gte('created_at', cutoff);
  const { data, error } = await query;
  if (error) logger.warn('map.projects.failed', { err: error.message });
  return (data ?? []) as Array<TimestampedRow & { title: string }>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchThreads(supabase: any, cutoff: string | null) {
  let query = supabase
    .from('threads')
    .select('id, capture_id, created_at')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(200);
  if (cutoff) query = query.gte('created_at', cutoff);
  const { data, error } = await query;
  if (error) logger.warn('map.threads.failed', { err: error.message });
  return (data ?? []) as Array<TimestampedRow & { capture_id: string }>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchJournal(supabase: any, cutoff: string | null) {
  let query = supabase
    .from('journal_entries')
    .select('id, body, written_at')
    .is('deleted_at', null)
    .order('written_at', { ascending: false })
    .limit(500);
  if (cutoff) query = query.gte('written_at', cutoff.slice(0, 10));
  const { data, error } = await query;
  if (error) logger.warn('map.journal.failed', { err: error.message });
  return (data ?? []) as Array<{ id: string; body: string; written_at: string }>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchEntities(supabase: any, cutoff: string | null) {
  let query = supabase
    .from('entities')
    .select('id, name, kind, created_at')
    .order('created_at', { ascending: false })
    .limit(500);
  if (cutoff) query = query.gte('last_seen_at', cutoff);
  const { data, error } = await query;
  if (error) logger.warn('map.entities.failed', { err: error.message });
  return (data ?? []) as Array<{
    id: string;
    name: string;
    kind: EntityKind;
    created_at: string;
  }>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchLinks(supabase: any) {
  const { data, error } = await supabase
    .from('links')
    .select('source_kind, source_id, target_kind, target_id')
    .limit(2000);
  if (error) logger.warn('map.links.failed', { err: error.message });
  return (data ?? []) as Array<{
    source_kind: string;
    source_id: string;
    target_kind: string;
    target_id: string;
  }>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchMentions(supabase: any) {
  const { data, error } = await supabase
    .from('mentions')
    .select('entity_id, capture_id')
    .limit(5000);
  if (error) logger.warn('map.mentions.failed', { err: error.message });
  return (data ?? []) as Array<{ entity_id: string; capture_id: string }>;
}

function formatJournalLabel(writtenAt: string, body: string): string {
  const d = new Date(`${writtenAt}T12:00:00Z`);
  const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const oneLine = body.replace(/\s+/g, ' ').trim();
  const preview = oneLine.length > 30 ? oneLine.slice(0, 30) + '…' : oneLine;
  return `${date} · ${preview}`;
}

// Re-export for consumers that don't want to import from kinds separately.
export type { CaptureKind, CaptureState };
