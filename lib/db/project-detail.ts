// Per-project tab data fetchers (Phase 5.9).
//
// One file, six exports — each backs one of the project-detail tabs. RLS does
// the per-user scoping, so all queries are owner-scoped without an explicit
// `where owner_id = ...` predicate. The handful of joins are written by hand
// (Postgrest's relational-join syntax doesn't work cleanly across tables that
// aren't yet in the generated db.ts).

import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import type { CaptureKind, CaptureState } from '@/lib/capture/kinds';
import type { CaptureMediaKind, LibraryShelf } from '@/lib/capture/buckets';
import { libraryShelfFor } from '@/lib/capture/buckets';
import type { ThreadStatus } from '@/lib/types/threads';
import type { EntityKind } from '@/lib/ai/tasks';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function untypedSupabase(): Promise<any> {
  return createClient();
}

// ---------------------------------------------------------------------------
// Threads in project (5.9.1)
// ---------------------------------------------------------------------------

export type ProjectThread = {
  id: string;
  capture_id: string;
  capture_title: string;
  kind: CaptureKind;
  status: ThreadStatus;
  updated_at: string;
};

/**
 * Threads whose seed capture is filed to this project. Threads inherit
 * project anchoring transitively through their capture — keeps thread rows
 * free of an explicit project_id column.
 */
export async function listThreadsForProject(projectId: string): Promise<ProjectThread[]> {
  const supabase = await untypedSupabase();

  // Step 1: capture IDs filed to this project. Includes the seed capture
  // (its own project_id is set by promoteToProject), so a thread on the seed
  // is included.
  const { data: caps, error: capsErr } = await supabase
    .from('captures')
    .select('id, title')
    .eq('project_id', projectId)
    .neq('state', 'archived');
  if (capsErr) {
    logger.warn('project.threads.captures.failed', { projectId, err: capsErr.message });
    return [];
  }
  const capRows = (caps ?? []) as Array<{ id: string; title: string }>;
  if (capRows.length === 0) return [];

  const titleMap = new Map(capRows.map((c) => [c.id, c.title]));
  const captureIds = capRows.map((c) => c.id);

  // Step 2: live threads anchored to any of those captures.
  const { data: thr, error: thrErr } = await supabase
    .from('threads')
    .select('id, capture_id, kind, status, updated_at')
    .in('capture_id', captureIds)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .limit(200);
  if (thrErr) {
    logger.warn('project.threads.threads.failed', { projectId, err: thrErr.message });
    return [];
  }

  return ((thr ?? []) as Array<{
    id: string;
    capture_id: string;
    kind: CaptureKind;
    status: ThreadStatus;
    updated_at: string;
  }>).map((t) => ({
    id: t.id,
    capture_id: t.capture_id,
    capture_title: titleMap.get(t.capture_id) ?? '(untitled thread)',
    kind: t.kind,
    status: t.status,
    updated_at: t.updated_at,
  }));
}

// ---------------------------------------------------------------------------
// References in project (5.9.2)
// ---------------------------------------------------------------------------

export type ProjectReference = {
  id: string;
  title: string;
  kind: CaptureKind;
  state: CaptureState;
  media_kind: CaptureMediaKind | null;
  source_url: string | null;
  shelf: Exclude<LibraryShelf, 'process'>;
  created_at: string;
};

/**
 * Filed captures that bucket into the Library (photos, clips, voice/note
 * research). Stream-bucket captures (notes/voice ideas, problems,
 * observations) are excluded — they show in the Filed captures panel
 * already, not as references.
 */
export async function listReferencesForProject(projectId: string): Promise<ProjectReference[]> {
  const supabase = await untypedSupabase();
  const { data, error } = await supabase
    .from('captures')
    .select('id, title, kind, state, media_kind, source_url, created_at')
    .eq('project_id', projectId)
    .neq('state', 'archived')
    .or('media_kind.in.(photo,clip),kind.eq.research')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) {
    logger.warn('project.references.failed', { projectId, err: error.message });
    return [];
  }
  return ((data ?? []) as Array<{
    id: string;
    title: string;
    kind: CaptureKind;
    state: CaptureState;
    media_kind: CaptureMediaKind | null;
    source_url: string | null;
    created_at: string;
  }>)
    .map((r) => {
      const shelf = libraryShelfFor({ kind: r.kind, media_kind: r.media_kind });
      if (!shelf) return null;
      return {
        id: r.id,
        title: r.title,
        kind: r.kind,
        state: r.state,
        media_kind: r.media_kind,
        source_url: r.source_url,
        shelf,
        created_at: r.created_at,
      };
    })
    .filter((x): x is ProjectReference => x !== null);
}

// ---------------------------------------------------------------------------
// Collaborators in project (5.9.2)
// ---------------------------------------------------------------------------

export type ProjectCollaborator = {
  entity_id: string;
  name: string;
  kind: EntityKind;
  /** How many of this project's captures mention the entity. */
  mention_count: number;
};

/**
 * Atlas entities mentioned in any of this project's filed captures. Counts
 * are scoped to the project — a person mentioned in 12 captures globally but
 * only 3 in this project shows `3` here.
 */
export async function listCollaboratorsForProject(
  projectId: string,
): Promise<ProjectCollaborator[]> {
  const supabase = await untypedSupabase();

  // Step 1: capture IDs filed here.
  const { data: caps } = await supabase
    .from('captures')
    .select('id')
    .eq('project_id', projectId)
    .neq('state', 'archived');
  const captureIds = ((caps ?? []) as Array<{ id: string }>).map((c) => c.id);
  if (captureIds.length === 0) return [];

  // Step 2: mentions on those captures.
  const { data: mentions, error } = await supabase
    .from('mentions')
    .select('entity_id')
    .in('capture_id', captureIds);
  if (error) {
    logger.warn('project.collab.mentions.failed', { projectId, err: error.message });
    return [];
  }
  const mentionRows = (mentions ?? []) as Array<{ entity_id: string }>;
  if (mentionRows.length === 0) return [];

  // Step 3: count by entity, then hydrate names + kinds.
  const counts = new Map<string, number>();
  for (const m of mentionRows) {
    counts.set(m.entity_id, (counts.get(m.entity_id) ?? 0) + 1);
  }
  const entityIds = [...counts.keys()];

  const { data: ents } = await supabase
    .from('entities')
    .select('id, name, kind')
    .in('id', entityIds);

  return ((ents ?? []) as Array<{ id: string; name: string; kind: EntityKind }>)
    .map((e) => ({
      entity_id: e.id,
      name: e.name,
      kind: e.kind,
      mention_count: counts.get(e.id) ?? 0,
    }))
    // Most-mentioned first, then alphabetical for stable order.
    .sort((a, b) => b.mention_count - a.mention_count || a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Timeline (5.9.3)
// ---------------------------------------------------------------------------

export type TimelineEvent =
  | {
      kind: 'project_opened';
      at: string;
      title: string;
    }
  | {
      kind: 'project_status';
      at: string;
      status: 'wrapped' | 'paused' | 'archived';
    }
  | {
      kind: 'capture_filed';
      at: string;
      capture_id: string;
      capture_title: string;
      capture_kind: CaptureKind;
      seed: boolean;
    }
  | {
      kind: 'thread_created';
      at: string;
      thread_id: string;
      capture_title: string;
    }
  | {
      kind: 'thread_saved';
      at: string;
      thread_id: string;
      capture_title: string;
    };

/**
 * A unified, descending-by-time event feed for one project. Sources:
 *   - project row → opened_at, plus implicit "status change" if status != active
 *     (we don't yet have a project_events log; the v1 timeline is approximate)
 *   - filed captures → one event per capture, the seed gets a special label
 *   - threads on filed captures → one created + one saved-most-recently event
 *
 * Capped at 100 events for sanity.
 */
export async function buildProjectTimeline(projectId: string): Promise<TimelineEvent[]> {
  const supabase = await untypedSupabase();
  const events: TimelineEvent[] = [];

  // 1) Project opened (always present) + current status.
  const { data: proj } = await supabase
    .from('projects')
    .select('title, opened_at, status, updated_at, seed_capture_id')
    .eq('id', projectId)
    .maybeSingle();
  const projRow = proj as
    | {
        title: string;
        opened_at: string;
        status: 'active' | 'wrapped' | 'paused' | 'archived';
        updated_at: string;
        seed_capture_id: string | null;
      }
    | null;
  if (!projRow) return [];

  events.push({ kind: 'project_opened', at: projRow.opened_at, title: projRow.title });
  if (projRow.status !== 'active') {
    events.push({
      kind: 'project_status',
      at: projRow.updated_at,
      status: projRow.status,
    });
  }

  // 2) Filed captures — most recent first cap.
  const { data: caps } = await supabase
    .from('captures')
    .select('id, title, kind, created_at')
    .eq('project_id', projectId)
    .neq('state', 'archived')
    .order('created_at', { ascending: false })
    .limit(200);

  const capRows = (caps ?? []) as Array<{
    id: string;
    title: string;
    kind: CaptureKind;
    created_at: string;
  }>;
  for (const c of capRows) {
    events.push({
      kind: 'capture_filed',
      at: c.created_at,
      capture_id: c.id,
      capture_title: c.title,
      capture_kind: c.kind,
      seed: c.id === projRow.seed_capture_id,
    });
  }

  // 3) Threads on those captures — created_at + the latest content_version.
  if (capRows.length > 0) {
    const { data: thr } = await supabase
      .from('threads')
      .select('id, capture_id, created_at, updated_at')
      .in(
        'capture_id',
        capRows.map((c) => c.id),
      )
      .is('deleted_at', null)
      .limit(100);
    const titleMap = new Map(capRows.map((c) => [c.id, c.title]));
    for (const t of (thr ?? []) as Array<{
      id: string;
      capture_id: string;
      created_at: string;
      updated_at: string;
    }>) {
      const title = titleMap.get(t.capture_id) ?? '(untitled)';
      events.push({
        kind: 'thread_created',
        at: t.created_at,
        thread_id: t.id,
        capture_title: title,
      });
      // Only emit a separate "saved" event if updated_at is meaningfully
      // distinct from created_at (avoid noise for never-edited threads).
      if (
        new Date(t.updated_at).getTime() - new Date(t.created_at).getTime() >
        60 * 1000
      ) {
        events.push({
          kind: 'thread_saved',
          at: t.updated_at,
          thread_id: t.id,
          capture_title: title,
        });
      }
    }
  }

  events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  return events.slice(0, 100);
}

// ---------------------------------------------------------------------------
// Tab-pill counts (5.9.6)
// ---------------------------------------------------------------------------

export type ProjectTabCounts = {
  filed: number;
  threads: number;
  refs: number;
  people: number;
  parts: number;
  tasks_open: number;
};

export async function projectTabCounts(projectId: string): Promise<ProjectTabCounts> {
  const supabase = await untypedSupabase();

  // Filed captures (excluding archived). Use head:true + count-only to avoid
  // pulling rows we won't render.
  const { count: filed } = await supabase
    .from('captures')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)
    .neq('state', 'archived');

  // Refs are a slice of the filed set, so we can compute both with one round
  // trip if we re-pull a tiny projection. Cheaper to call the helper.
  const refs = await listReferencesForProject(projectId);

  // Threads count via the helper (already filters by project anchoring).
  const threads = await listThreadsForProject(projectId);

  // Collaborators
  const collabs = await listCollaboratorsForProject(projectId);

  // Parts and open tasks land in 5.9.4 / 5.9.5 — query the tables defensively
  // so this fetcher doesn't fail before the migration runs.
  let parts = 0;
  let tasks_open = 0;
  try {
    const { count: pc } = await supabase
      .from('project_parts')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .is('deleted_at', null);
    parts = pc ?? 0;
  } catch {
    /* table not yet present */
  }
  try {
    const { count: tc } = await supabase
      .from('project_tasks')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .eq('status', 'open');
    tasks_open = tc ?? 0;
  } catch {
    /* table not yet present */
  }

  return {
    filed: filed ?? 0,
    threads: threads.length,
    refs: refs.length,
    people: collabs.length,
    parts,
    tasks_open,
  };
}
