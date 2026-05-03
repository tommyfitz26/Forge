// Phase 5.4 — single source of truth for the registered QStash crons.
// Used by /settings/health and /settings/jobs to display schedule + status,
// AND by scripts/register-qstash-schedules.ts to apply this registry to the
// live QStash account. Edit this file → run `pnpm jobs:sync` to push the
// changes to QStash.
//
// The `nudge` entry is special: its real schedule is two crons (one per slot)
// because each slot fires a distinct URL. The sync script expands it; the
// dashboard treats it as one logical job because both slots feed the same
// `job_runs.job_name`.

export type RegisteredJob = {
  /** Matches `job_runs.job_name`. Some jobs (research_recovery) don't claim
   *  job_runs rows; their `jobName` is informational and run history will be
   *  empty. */
  jobName: string;
  /** Display label. */
  label: string;
  /** One-sentence what-it-does. */
  description: string;
  /** Cron expression as registered in Upstash. */
  cron: string;
  /** Timezone the cron expression evaluates in. */
  tz: string;
  /** Production URL the schedule POSTs to. */
  url: string;
  /** Approximate runs per day — used by the Health tab to flag a job as
   *  potentially stuck if no successful run is recent enough. */
  expectedRunsPerDay: number;
  /** True if this job logs run telemetry to `job_runs`. False = informational
   *  only (research_recovery sweeps other jobs and doesn't claim its own row). */
  hasRunHistory: boolean;
};

export const REGISTERED_JOBS: RegisteredJob[] = [
  {
    jobName: 'nudge',
    label: 'Daily nudges',
    description:
      'Twice-daily Socratic question to develop a captured idea further.',
    cron: '0 10,17 * * *',
    tz: 'America/New_York',
    url: '/api/jobs/nudge?slot=morning|evening',
    expectedRunsPerDay: 2,
    hasRunHistory: true,
  },
  {
    jobName: 'morning-focus-nudge',
    label: 'Morning focus nudge',
    description: "9am push if today's focus isn't set yet.",
    cron: '0 9 * * *',
    tz: 'America/New_York',
    url: '/api/jobs/morning-focus-nudge',
    expectedRunsPerDay: 1,
    hasRunHistory: true,
  },
  {
    jobName: 'weekly_review',
    label: 'Weekly review',
    description:
      'Sunday 5pm chained job: pattern_detection + weekly_summary + email + push.',
    cron: '0 17 * * 0',
    tz: 'America/New_York',
    url: '/api/jobs/weekly-review/stage1',
    expectedRunsPerDay: 1 / 7,
    hasRunHistory: true,
  },
  {
    jobName: 'research_recovery',
    label: 'Research recovery',
    description:
      'Hourly sweep that resets captures stuck in research_status=running for >20m.',
    cron: '0 * * * *',
    tz: 'UTC',
    url: '/api/jobs/research-recovery',
    expectedRunsPerDay: 24,
    hasRunHistory: false,
  },
];

/**
 * Look up a registered job by jobName. Returns undefined for ad-hoc job_name
 * values that don't appear in the registry (research, etc., used by the
 * inline research code path — not a registered cron).
 */
export function findRegistered(jobName: string): RegisteredJob | undefined {
  return REGISTERED_JOBS.find((j) => j.jobName === jobName);
}
