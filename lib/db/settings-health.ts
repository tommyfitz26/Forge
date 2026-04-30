// Phase 5.4 — /settings/health data fetcher.
//
// For each registered job, walk job_runs to compute:
//   - lastRun: most recent row regardless of status
//   - status pill: green (recent + succeeded) / yellow (overdue but no failure)
//                  / red (last run failed) / grey (no history yet)
//   - 7-day grid: per-day counts of succeeded + failed
// Plus: stuck-lease detection — `running` rows older than the 20-min
// SPEC §10.4 cutoff that haven't been swept yet by research_recovery.

import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { REGISTERED_JOBS, type RegisteredJob } from '@/lib/jobs/registry';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function untypedSupabase(): Promise<any> {
  return createClient();
}

export type JobStatusKind = 'green' | 'yellow' | 'red' | 'grey';

export type JobHealth = {
  job: RegisteredJob;
  status: JobStatusKind;
  lastRun: {
    id: string;
    status: 'running' | 'succeeded' | 'failed';
    started_at: string;
    completed_at: string | null;
    error: string | null;
  } | null;
  /** Per-day counts for the last 7 days (oldest → newest). */
  dailyGrid: Array<{ day: string; succeeded: number; failed: number }>;
};

export type StuckLease = {
  id: string;
  job_name: string;
  started_at: string;
  ageMinutes: number;
};

export type HealthSummary = {
  jobs: JobHealth[];
  stuckLeases: StuckLease[];
};

const STUCK_THRESHOLD_MIN = 20;

export async function getHealthSummary(): Promise<HealthSummary> {
  const supabase = await untypedSupabase();

  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000);
  sevenDaysAgo.setUTCHours(0, 0, 0, 0);

  // Pull recent job_runs for the registered jobs only. Single round trip.
  const jobNames = REGISTERED_JOBS.filter((j) => j.hasRunHistory).map((j) => j.jobName);
  const { data: runs, error } = jobNames.length
    ? await supabase
        .from('job_runs')
        .select('id, job_name, status, started_at, completed_at, error')
        .in('job_name', jobNames)
        .gte('started_at', sevenDaysAgo.toISOString())
        .order('started_at', { ascending: false })
        .limit(1000)
    : { data: [], error: null };

  if (error) {
    logger.error('settings.health.failed', { err: error.message });
  }

  const allRuns = (runs ?? []) as Array<{
    id: string;
    job_name: string;
    status: 'running' | 'succeeded' | 'failed';
    started_at: string;
    completed_at: string | null;
    error: string | null;
  }>;

  // Stuck-lease pass — across ALL job_names, since research-recovery sweeps
  // the entire table.
  const stuckCutoff = new Date(Date.now() - STUCK_THRESHOLD_MIN * 60_000).toISOString();
  const { data: stuckRows } = await supabase
    .from('job_runs')
    .select('id, job_name, started_at')
    .eq('status', 'running')
    .lt('started_at', stuckCutoff)
    .order('started_at', { ascending: true })
    .limit(20);

  const stuckLeases: StuckLease[] = (
    (stuckRows ?? []) as Array<{ id: string; job_name: string; started_at: string }>
  ).map((r) => ({
    id: r.id,
    job_name: r.job_name,
    started_at: r.started_at,
    ageMinutes: Math.floor(
      (Date.now() - new Date(r.started_at).getTime()) / 60_000,
    ),
  }));

  // Build per-job summaries.
  const jobs: JobHealth[] = REGISTERED_JOBS.map((job) => {
    if (!job.hasRunHistory) {
      return {
        job,
        status: 'grey' as JobStatusKind,
        lastRun: null,
        dailyGrid: emptyDailyGrid(),
      };
    }

    const myRuns = allRuns.filter((r) => r.job_name === job.jobName);
    const lastRun = myRuns[0] ?? null;

    // Status determination.
    let status: JobStatusKind = 'grey';
    if (lastRun) {
      if (lastRun.status === 'failed') {
        status = 'red';
      } else if (lastRun.status === 'running') {
        status = 'yellow';
      } else {
        // succeeded — check whether it's recent enough.
        const ageHours =
          (Date.now() - new Date(lastRun.started_at).getTime()) / 3_600_000;
        const expectedHours = 24 / Math.max(0.1, job.expectedRunsPerDay);
        // Allow 50% slack: a once-a-day job is yellow at >36h, red at >72h
        // doesn't apply — we leave red strictly to actual failures.
        status = ageHours > expectedHours * 1.5 ? 'yellow' : 'green';
      }
    }

    // Per-day grid for the last 7 days.
    const dailyGrid = emptyDailyGrid();
    for (const r of myRuns) {
      const day = r.started_at.slice(0, 10);
      const cell = dailyGrid.find((c) => c.day === day);
      if (!cell) continue;
      if (r.status === 'succeeded') cell.succeeded += 1;
      else if (r.status === 'failed') cell.failed += 1;
    }

    return { job, status, lastRun, dailyGrid };
  });

  return { jobs, stuckLeases };
}

function emptyDailyGrid(): Array<{ day: string; succeeded: number; failed: number }> {
  const out: Array<{ day: string; succeeded: number; failed: number }> = [];
  const cursor = new Date();
  cursor.setUTCHours(0, 0, 0, 0);
  cursor.setUTCDate(cursor.getUTCDate() - 6);
  for (let i = 0; i < 7; i++) {
    out.push({
      day: cursor.toISOString().slice(0, 10),
      succeeded: 0,
      failed: 0,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}
