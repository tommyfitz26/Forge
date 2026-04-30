// Phase 5.4 — /settings/jobs data fetcher.
//
// Per-job recent invocations from job_runs. Powers the operational view —
// last 10 runs per job, with status, duration, error if any.

import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { REGISTERED_JOBS, type RegisteredJob } from '@/lib/jobs/registry';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function untypedSupabase(): Promise<any> {
  return createClient();
}

export type JobInvocation = {
  id: string;
  status: 'running' | 'succeeded' | 'failed';
  started_at: string;
  completed_at: string | null;
  durationMs: number | null;
  error: string | null;
  /** JSONB result column from job_runs — typically a small object the job wrote on success. */
  result: Record<string, unknown> | null;
};

export type JobsSummary = {
  jobs: Array<{
    job: RegisteredJob;
    invocations: JobInvocation[];
  }>;
};

const PER_JOB_LIMIT = 10;

export async function getJobsSummary(): Promise<JobsSummary> {
  const supabase = await untypedSupabase();

  // Pull a generous slab of recent runs in one query, then bucket per job.
  const jobNames = REGISTERED_JOBS.filter((j) => j.hasRunHistory).map((j) => j.jobName);
  const { data, error } = jobNames.length
    ? await supabase
        .from('job_runs')
        .select('id, job_name, status, started_at, completed_at, error, result')
        .in('job_name', jobNames)
        .order('started_at', { ascending: false })
        .limit(PER_JOB_LIMIT * jobNames.length * 2)
    : { data: [], error: null };

  if (error) {
    logger.error('settings.jobs.failed', { err: error.message });
  }

  const allRuns = (data ?? []) as Array<{
    id: string;
    job_name: string;
    status: 'running' | 'succeeded' | 'failed';
    started_at: string;
    completed_at: string | null;
    error: string | null;
    result: Record<string, unknown> | null;
  }>;

  const jobs = REGISTERED_JOBS.map((job) => {
    const myRuns = job.hasRunHistory
      ? allRuns
          .filter((r) => r.job_name === job.jobName)
          .slice(0, PER_JOB_LIMIT)
      : [];
    const invocations: JobInvocation[] = myRuns.map((r) => ({
      id: r.id,
      status: r.status,
      started_at: r.started_at,
      completed_at: r.completed_at,
      durationMs:
        r.completed_at && r.started_at
          ? new Date(r.completed_at).getTime() - new Date(r.started_at).getTime()
          : null,
      error: r.error,
      result: r.result,
    }));
    return { job, invocations };
  });

  return { jobs };
}
