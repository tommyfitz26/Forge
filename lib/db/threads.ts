// Threads query helpers (Phase 4.3.3).
//
// Same untyped-supabase pattern as lib/db/projects.ts — drop the casts
// after `pnpm db:types` regenerates lib/types/db.ts.

import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import type { CaptureKind } from '@/lib/capture/kinds';
import type { Thread, ThreadStatus } from '@/lib/types/threads';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function untypedSupabase(): Promise<any> {
  return createClient();
}

type ListOptions = {
  status?: ThreadStatus | ThreadStatus[];
  kind?: CaptureKind;
  /** Default 50. */
  limit?: number;
};

export async function listThreads(opts: ListOptions = {}): Promise<Thread[]> {
  const supabase = await untypedSupabase();
  const limit = opts.limit ?? 50;

  let query = supabase
    .from('threads')
    .select('*')
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (Array.isArray(opts.status)) {
    query = query.in('status', opts.status);
  } else if (opts.status) {
    query = query.eq('status', opts.status);
  }
  if (opts.kind) {
    query = query.eq('kind', opts.kind);
  }

  const { data, error } = await query;
  if (error) {
    logger.error('threads.list.failed', { err: error.message });
    return [];
  }
  return (data ?? []) as Thread[];
}

export async function getThread(id: string): Promise<Thread | null> {
  const supabase = await untypedSupabase();
  const { data, error } = await supabase
    .from('threads')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) {
    logger.error('threads.get.failed', { id, err: error.message });
    return null;
  }
  return (data ?? null) as Thread | null;
}

export async function getThreadByCaptureId(captureId: string): Promise<Thread | null> {
  const supabase = await untypedSupabase();
  const { data, error } = await supabase
    .from('threads')
    .select('*')
    .eq('capture_id', captureId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) {
    logger.error('threads.getByCapture.failed', { captureId, err: error.message });
    return null;
  }
  return (data ?? null) as Thread | null;
}

export async function threadCounts(): Promise<{
  total: number;
  in_progress: number;
  complete: number;
  archived: number;
  byKind: Record<CaptureKind, number>;
}> {
  const supabase = await untypedSupabase();
  const { data, error } = await supabase
    .from('threads')
    .select('status, kind')
    .is('deleted_at', null);
  if (error) {
    logger.error('threads.counts.failed', { err: error.message });
    return {
      total: 0,
      in_progress: 0,
      complete: 0,
      archived: 0,
      byKind: { idea: 0, problem: 0, observation: 0, research: 0 },
    };
  }
  const rows = (data ?? []) as Array<{ status: string; kind: string }>;
  const byKind: Record<CaptureKind, number> = { idea: 0, problem: 0, observation: 0, research: 0 };
  for (const r of rows) {
    if (r.kind in byKind) byKind[r.kind as CaptureKind] += 1;
  }
  return {
    total: rows.length,
    in_progress: rows.filter((r) => r.status === 'in_progress').length,
    complete: rows.filter((r) => r.status === 'complete').length,
    archived: rows.filter((r) => r.status === 'archived').length,
    byKind,
  };
}
