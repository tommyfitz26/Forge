// project_deadlines query helpers (Phase 5.10).

import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import type { ProjectDeadline } from '@/lib/types/project-extras';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function untypedSupabase(): Promise<any> {
  return createClient();
}

/** All deadlines for one project, soonest-first. */
export async function listDeadlinesForProject(
  projectId: string,
): Promise<ProjectDeadline[]> {
  const supabase = await untypedSupabase();
  const { data, error } = await supabase
    .from('project_deadlines')
    .select('*')
    .eq('project_id', projectId)
    .order('due_at', { ascending: true })
    .limit(500);
  if (error) {
    logger.warn('project.deadlines.list.failed', { projectId, err: error.message });
    return [];
  }
  return (data ?? []) as ProjectDeadline[];
}

/** Aggregate counts for the inspector + tab pill. */
export async function projectDeadlineCounts(projectId: string): Promise<{
  pending: number;
  overdue: number;
  hit: number;
}> {
  const supabase = await untypedSupabase();
  const { data, error } = await supabase
    .from('project_deadlines')
    .select('status, due_at')
    .eq('project_id', projectId);
  if (error) {
    logger.warn('project.deadlines.counts.failed', { projectId, err: error.message });
    return { pending: 0, overdue: 0, hit: 0 };
  }
  const today = new Date().toISOString().slice(0, 10);
  const rows = (data ?? []) as Array<{ status: string; due_at: string }>;
  const pending = rows.filter((r) => r.status === 'pending').length;
  const overdue = rows.filter((r) => r.status === 'pending' && r.due_at < today).length;
  const hit = rows.filter((r) => r.status === 'hit').length;
  return { pending, overdue, hit };
}
