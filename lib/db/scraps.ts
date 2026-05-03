// Scraps fetcher (Phase 4.5).
//
// Scraps = "drafts, fragments, seeds" — captures that haven't yet graduated
// into a project or thread. Definition for v1:
//   state = 'raw'
//   AND is_project = false (or null)
//   AND project_id is null
//   AND state != 'archived'
//
// We deliberately don't filter by age. If the user wants to see only stale
// scraps, the right pattern is a small filter chip in the page header — not
// hardcoded into the fetcher.

import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { STREAM_KIND_IN, STREAM_MEDIA_IN } from '@/lib/capture/buckets';
import type { CaptureKind, CaptureState } from '@/lib/capture/kinds';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function untypedSupabase(): Promise<any> {
  return createClient();
}

export type Scrap = {
  id: string;
  title: string;
  content: string;
  kind: CaptureKind;
  state: CaptureState;
  created_at: string;
  is_project: boolean;
  project_id: string | null;
};

export async function listScraps(limit = 200): Promise<Scrap[]> {
  const supabase = await untypedSupabase();
  // Phase 5.6 — Scraps belongs to the Stream side of the Stream/Library
  // split. Photos, web clips, and research-kind captures live on /library
  // even when they're stuck in `raw` state.
  const { data, error } = await supabase
    .from('captures')
    .select('id, title, content, kind, state, created_at, is_project, project_id')
    .eq('state', 'raw')
    .is('deleted_at', null)
    .in('kind', STREAM_KIND_IN)
    .in('media_kind', STREAM_MEDIA_IN)
    .or('is_project.is.null,is_project.eq.false')
    .is('project_id', null)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    logger.error('scraps.list.failed', { err: error.message });
    return [];
  }
  return ((data ?? []) as Array<{
    id: string;
    title: string;
    content: string | null;
    kind: string;
    state: string;
    created_at: string;
    is_project: boolean | null;
    project_id: string | null;
  }>).map((c) => ({
    id: c.id,
    title: c.title,
    content: c.content ?? '',
    kind: c.kind as CaptureKind,
    state: c.state as CaptureState,
    created_at: c.created_at,
    is_project: Boolean(c.is_project),
    project_id: c.project_id,
  }));
}

export async function scrapsCount(): Promise<number> {
  const supabase = await untypedSupabase();
  const { count, error } = await supabase
    .from('captures')
    .select('id', { count: 'exact', head: true })
    .eq('state', 'raw')
    .is('deleted_at', null)
    .in('kind', STREAM_KIND_IN)
    .in('media_kind', STREAM_MEDIA_IN)
    .or('is_project.is.null,is_project.eq.false')
    .is('project_id', null);
  if (error) {
    logger.error('scraps.count.failed', { err: error.message });
    return 0;
  }
  return count ?? 0;
}
