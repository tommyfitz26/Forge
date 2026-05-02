// project_parts query helpers (Phase 5.9.5).

import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import type { ProjectPart } from '@/lib/types/project-extras';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function untypedSupabase(): Promise<any> {
  return createClient();
}

export async function listPartsForProject(projectId: string): Promise<ProjectPart[]> {
  const supabase = await untypedSupabase();
  const { data, error } = await supabase
    .from('project_parts')
    .select('*')
    .eq('project_id', projectId)
    .is('deleted_at', null)
    .order('position', { ascending: true })
    .limit(500);
  if (error) {
    logger.warn('project.parts.list.failed', { projectId, err: error.message });
    return [];
  }
  return (data ?? []) as ProjectPart[];
}
