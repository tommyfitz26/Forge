import 'server-only';
import type { createServiceClient } from '@/lib/supabase/service';

// SPEC §10.4 Layer B — `job_runs` claim / outcome helpers used by background
// job routes that need exactly-once-ish semantics under QStash redelivery.
// The unique index on (job_name, idempotency_key) is the durable guard;
// these helpers are just the query plumbing on top.
//
// Order of operations a caller follows:
//   const claim = await claimJobRun(service, JOB_NAME, key);
//   if (claim.status !== 'claimed') return ...;   // already_running / already_succeeded
//   try { ...do work... await markJobSucceeded(service, claim.jobRunId, result); }
//   catch (err) { await markJobFailed(service, claim.jobRunId, msg); }
//
// Stuck `running` rows are reaped by the research-recovery cron after 20m
// (SPEC §10.4 — this same machinery applies to any job_runs row).

type ServiceClient = ReturnType<typeof createServiceClient>;

export type ClaimResult =
  | { status: 'claimed'; jobRunId: string }
  | { status: 'already_running' }
  | { status: 'already_succeeded' };

export async function claimJobRun(
  service: ServiceClient,
  jobName: string,
  idempotencyKey: string,
): Promise<ClaimResult> {
  const { data: existing } = await service
    .from('job_runs')
    .select('id, status')
    .eq('job_name', jobName)
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();

  if (existing) {
    if (existing.status === 'succeeded') return { status: 'already_succeeded' };
    if (existing.status === 'running') return { status: 'already_running' };
    // 'failed' → re-claim. Recovery cron flips stale 'running' rows to
    // 'failed' + 'stale_lease' after 20 minutes (SPEC §10.4).
    const { error: updErr } = await service
      .from('job_runs')
      .update({
        status: 'running',
        started_at: new Date().toISOString(),
        completed_at: null,
        error: null,
      })
      .eq('id', existing.id);
    if (updErr) {
      throw new Error(`job_runs re-claim failed: ${updErr.message}`);
    }
    return { status: 'claimed', jobRunId: existing.id };
  }

  const { data: created, error: insErr } = await service
    .from('job_runs')
    .insert({ job_name: jobName, idempotency_key: idempotencyKey, status: 'running' })
    .select('id')
    .single();
  if (insErr || !created) {
    // Race: another worker won the unique index between our SELECT and INSERT.
    return { status: 'already_running' };
  }
  return { status: 'claimed', jobRunId: created.id };
}

export async function markJobSucceeded(
  service: ServiceClient,
  jobRunId: string,
  result: Record<string, string | number | boolean | null>,
): Promise<void> {
  await service
    .from('job_runs')
    .update({
      status: 'succeeded',
      completed_at: new Date().toISOString(),
      error: null,
      result,
    })
    .eq('id', jobRunId);
}

export async function markJobFailed(
  service: ServiceClient,
  jobRunId: string,
  errorMessage: string,
): Promise<void> {
  await service
    .from('job_runs')
    .update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      error: errorMessage,
    })
    .eq('id', jobRunId);
}
