// project_tasks query helpers (Phase 5.9.4). Untyped Supabase client because
// the table isn't in the generated db.ts until `pnpm db:types` runs.

import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import type { ProjectTask, TaskStatus } from '@/lib/types/project-extras';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function untypedSupabase(): Promise<any> {
  return createClient();
}

/**
 * All tasks for one project. Open first (by position), done after (by
 * completion time descending).
 */
export async function listTasksForProject(projectId: string): Promise<ProjectTask[]> {
  const supabase = await untypedSupabase();
  const { data, error } = await supabase
    .from('project_tasks')
    .select('*')
    .eq('project_id', projectId)
    .order('status', { ascending: true })   // open < done lexicographically
    .order('position', { ascending: true })
    .order('completed_at', { ascending: false, nullsFirst: false })
    .limit(500);
  if (error) {
    logger.warn('project.tasks.list.failed', { projectId, err: error.message });
    return [];
  }
  return (data ?? []) as ProjectTask[];
}

/** Just the open ones, position-ascending. Used by the Overview "Next steps" panel. */
export async function listOpenTasksForProject(
  projectId: string,
  limit = 5,
): Promise<ProjectTask[]> {
  const supabase = await untypedSupabase();
  const { data, error } = await supabase
    .from('project_tasks')
    .select('*')
    .eq('project_id', projectId)
    .eq('status', 'open')
    .order('position', { ascending: true })
    .limit(limit);
  if (error) {
    logger.warn('project.tasks.open.failed', { projectId, err: error.message });
    return [];
  }
  return (data ?? []) as ProjectTask[];
}

/** Aggregate counts for inspector + tab pill. */
export async function projectTaskCounts(projectId: string): Promise<{
  open: number;
  done: number;
}> {
  const supabase = await untypedSupabase();
  const { data, error } = await supabase
    .from('project_tasks')
    .select('status')
    .eq('project_id', projectId);
  if (error) {
    logger.warn('project.tasks.counts.failed', { projectId, err: error.message });
    return { open: 0, done: 0 };
  }
  const rows = (data ?? []) as Array<{ status: TaskStatus }>;
  return {
    open: rows.filter((r) => r.status === 'open').length,
    done: rows.filter((r) => r.status === 'done').length,
  };
}
