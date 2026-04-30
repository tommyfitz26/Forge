import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';

// Phase 5.5 — JSON export. Snapshot of everything the user has stored,
// shaped as a single object the user can keep / re-import / inspect later.
//
// Included tables (user data + provenance):
//   captures, projects, threads, journal_entries, tags, pins, intentions,
//   links, capture_events, content_versions.
//
// Deliberately excluded:
//   api_costs       — spending data, not user content
//   job_runs        — infrastructure
//   weekly_summaries — derived; can be regenerated
//   nudges          — push log; ephemeral
//   research        — derived; large; can be re-run
//   link_suggestions — pending AI artifacts; resolved or dismissed soon
//   push_subscriptions — device-specific, not portable
//
// Schema version tracks the export shape, NOT the database schema. Bump
// SCHEMA_VERSION any time the export shape changes incompatibly so future
// re-import code can adapt.

const SCHEMA_VERSION = 1;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function untypedSupabase(): Promise<any> {
  return createClient();
}

export type UserExport = {
  meta: {
    schemaVersion: number;
    exportedAt: string;
    ownerEmail: string;
    counts: Record<string, number>;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  captures: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  projects: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  threads: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  journal_entries: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tags: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pins: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  intentions: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  links: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  capture_events: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  content_versions: any[];
};

export type ExportCounts = {
  captures: number;
  projects: number;
  threads: number;
  journal_entries: number;
  tags: number;
  pins: number;
  intentions: number;
  links: number;
  capture_events: number;
  content_versions: number;
  total: number;
};

/**
 * Owner-scoped fetch of every user-data row. RLS does the per-user filtering
 * automatically — every table has an owner_id (or user_id for legacy tables)
 * RLS policy. We don't need to pass the ownerId in the queries; we just need
 * to be authenticated as them.
 */
export async function buildUserExport(ownerEmail: string): Promise<UserExport> {
  const supabase = await untypedSupabase();

  const [
    captures,
    projects,
    threads,
    journal,
    tags,
    pins,
    intentions,
    links,
    captureEvents,
    contentVersions,
  ] = await Promise.all([
    fetchAll(supabase, 'captures', 'created_at'),
    fetchAll(supabase, 'projects', 'created_at'),
    fetchAll(supabase, 'threads', 'created_at'),
    fetchAll(supabase, 'journal_entries', 'written_at'),
    fetchAll(supabase, 'tags', 'created_at'),
    fetchAll(supabase, 'pins', 'pinned_at'),
    fetchAll(supabase, 'intentions', 'day'),
    fetchAll(supabase, 'links', 'created_at'),
    fetchCaptureEvents(supabase),
    fetchAll(supabase, 'content_versions', 'saved_at'),
  ]);

  return {
    meta: {
      schemaVersion: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      ownerEmail,
      counts: {
        captures: captures.length,
        projects: projects.length,
        threads: threads.length,
        journal_entries: journal.length,
        tags: tags.length,
        pins: pins.length,
        intentions: intentions.length,
        links: links.length,
        capture_events: captureEvents.length,
        content_versions: contentVersions.length,
      },
    },
    captures,
    projects,
    threads,
    journal_entries: journal,
    tags,
    pins,
    intentions,
    links,
    capture_events: captureEvents,
    content_versions: contentVersions,
  };
}

/** Owner-scoped row counts (cheap — no payload, just tallies). Used by the
 *  Export tab to show the user what's in the snapshot before they download. */
export async function getExportCounts(): Promise<ExportCounts> {
  const supabase = await untypedSupabase();
  const tables = [
    'captures',
    'projects',
    'threads',
    'journal_entries',
    'tags',
    'pins',
    'intentions',
    'links',
    'content_versions',
  ] as const;

  const counts = await Promise.all(
    tables.map(async (t) => {
      const { count } = await supabase
        .from(t)
        .select('*', { count: 'exact', head: true });
      return [t, count ?? 0] as const;
    }),
  );

  // capture_events counts via the per-capture join. Cheap enough.
  const { count: ceCount } = await supabase
    .from('capture_events')
    .select('*', { count: 'exact', head: true });

  const map = Object.fromEntries(counts) as Record<string, number>;
  const total =
    Object.values(map).reduce((s, n) => s + n, 0) + (ceCount ?? 0);

  return {
    captures: map.captures ?? 0,
    projects: map.projects ?? 0,
    threads: map.threads ?? 0,
    journal_entries: map.journal_entries ?? 0,
    tags: map.tags ?? 0,
    pins: map.pins ?? 0,
    intentions: map.intentions ?? 0,
    links: map.links ?? 0,
    capture_events: ceCount ?? 0,
    content_versions: map.content_versions ?? 0,
    total,
  };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

async function fetchAll(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  table: string,
  orderBy: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any[]> {
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .order(orderBy, { ascending: true })
    .limit(50_000);
  if (error) {
    logger.error('export.fetch.failed', { table, err: error.message });
    return [];
  }
  return data ?? [];
}

/**
 * capture_events doesn't have an owner_id column — RLS gates rows via
 * the `capture_belongs_to_me(capture_id)` SECURITY DEFINER function. So
 * the query shape is identical to other tables; we just don't have a
 * direct owner column to filter on.
 */
async function fetchCaptureEvents(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any[]> {
  const { data, error } = await supabase
    .from('capture_events')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(50_000);
  if (error) {
    logger.error('export.captureEvents.failed', { err: error.message });
    return [];
  }
  return data ?? [];
}
