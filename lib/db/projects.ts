// Projects query helpers (Phase 4.3.1).
//
// `lib/types/db.ts` is auto-generated and doesn't yet include the `projects`
// table. The typed Supabase builder rejects unknown table names, so each
// query here uses an `any`-cast Supabase client. After `pnpm db:types`
// regenerates the types from the 20260430030211 migration, switch to the
// strongly-typed `createClient` flow (search for `untypedSupabase` to find
// every site that needs updating).

import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import type { Project, ProjectStatus } from '@/lib/types/projects';

/**
 * Untyped escape hatch for queries against tables not yet in the generated
 * Database type. Drop this when `pnpm db:types` is re-run.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function untypedSupabase(): Promise<any> {
  return createClient();
}

type ListOptions = {
  /** Filter by status. Pass an array to include multiple, or undefined for all
   *  non-archived projects (default). */
  status?: ProjectStatus | ProjectStatus[];
  /** Default 50. */
  limit?: number;
};

/**
 * List projects for the signed-in user, ordered by `last_activity_at desc`.
 * Soft-deleted projects (deleted_at is not null) are always excluded.
 */
export async function listProjects(opts: ListOptions = {}): Promise<Project[]> {
  const supabase = await untypedSupabase();
  const limit = opts.limit ?? 50;

  let query = supabase
    .from('projects')
    .select('*')
    .is('deleted_at', null)
    .order('last_activity_at', { ascending: false })
    .limit(limit);

  if (Array.isArray(opts.status)) {
    query = query.in('status', opts.status);
  } else if (opts.status) {
    query = query.eq('status', opts.status);
  }

  const { data, error } = await query;
  if (error) {
    logger.error('projects.list.failed', { err: error.message });
    return [];
  }
  return (data ?? []) as Project[];
}

/**
 * Fetch one project by id. Returns null if not found or RLS blocks it.
 */
export async function getProject(id: string): Promise<Project | null> {
  const supabase = await untypedSupabase();
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) {
    logger.error('projects.get.failed', { id, err: error.message });
    return null;
  }
  return (data ?? null) as Project | null;
}

/**
 * Aggregate counts for the Workshop inspector and home-page hero.
 */
export async function projectCounts(): Promise<{
  active: number;
  drafting: number;
  wrapped: number;
  paused: number;
  total: number;
}> {
  const supabase = await untypedSupabase();
  const { data, error } = await supabase
    .from('projects')
    .select('status')
    .is('deleted_at', null);
  if (error) {
    logger.error('projects.counts.failed', { err: error.message });
    return { active: 0, drafting: 0, wrapped: 0, paused: 0, total: 0 };
  }
  const rows = (data ?? []) as Array<{ status: string }>;
  return {
    active: rows.filter((r) => r.status === 'active').length,
    // 'drafting' is not a status enum value (it's a `stage` value); kept as a
    // computed line in counts for future use.
    drafting: 0,
    wrapped: rows.filter((r) => r.status === 'wrapped').length,
    paused: rows.filter((r) => r.status === 'paused').length,
    total: rows.length,
  };
}
