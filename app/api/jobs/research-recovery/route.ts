import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { verifyJobRequest, publishJob } from '@/lib/qstash';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

// Hourly QStash schedule (SPEC §12.1). Two passes:
// 1. captures with research_status='running' and updated_at < now()-5min →
//    reset to 'pending' and re-enqueue research.
// 2. job_runs with status='running' and started_at < now()-20min →
//    mark 'failed' + 'stale_lease' so a redelivery can re-claim.

const STUCK_CAPTURE_AGE_MIN = 5;
const STALE_LEASE_AGE_MIN = 20;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rawBody = await req.text();
  const auth = await verifyJobRequest(req, rawBody);
  if (!auth.ok) {
    logger.warn('jobs.research_recovery.auth_failed', { reason: auth.reason });
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  const service = createServiceClient();

  const stuckCaptureCutoff = new Date(
    Date.now() - STUCK_CAPTURE_AGE_MIN * 60 * 1000,
  ).toISOString();
  const staleLeaseCutoff = new Date(
    Date.now() - STALE_LEASE_AGE_MIN * 60 * 1000,
  ).toISOString();

  // Pass 1 — stuck captures.
  const { data: stuckCaptures, error: stuckErr } = await service
    .from('captures')
    .select('id')
    .eq('research_status', 'running')
    .lt('updated_at', stuckCaptureCutoff);

  let captureResets = 0;
  let republishFailures = 0;
  if (stuckErr) {
    logger.error('jobs.research_recovery.captures_query_failed', {
      err: stuckErr.message,
    });
  } else {
    for (const row of stuckCaptures ?? []) {
      const { error: updErr } = await service
        .from('captures')
        .update({ research_status: 'pending', updated_at: new Date().toISOString() })
        .eq('id', row.id);
      if (updErr) {
        logger.warn('jobs.research_recovery.capture_reset_failed', {
          captureId: row.id,
          err: updErr.message,
        });
        continue;
      }
      captureResets += 1;
      try {
        await publishJob('/api/jobs/research', { captureId: row.id });
      } catch (err) {
        republishFailures += 1;
        logger.warn('jobs.research_recovery.republish_failed', {
          captureId: row.id,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  // Pass 2 — stale leases. Mark across all job_names so this cron also rescues
  // future job types (nudge, weekly-review) without code changes.
  const { data: staleRuns, error: staleErr } = await service
    .from('job_runs')
    .select('id, job_name, idempotency_key')
    .eq('status', 'running')
    .lt('started_at', staleLeaseCutoff);

  let leasesSwept = 0;
  if (staleErr) {
    logger.error('jobs.research_recovery.runs_query_failed', { err: staleErr.message });
  } else if (staleRuns && staleRuns.length > 0) {
    const ids = staleRuns.map((r) => r.id);
    const { error: sweepErr } = await service
      .from('job_runs')
      .update({
        status: 'failed',
        error: 'stale_lease',
        completed_at: new Date().toISOString(),
      })
      .in('id', ids);
    if (sweepErr) {
      logger.warn('jobs.research_recovery.sweep_failed', { err: sweepErr.message });
    } else {
      leasesSwept = ids.length;
    }
  }

  logger.info('jobs.research_recovery.done', {
    captureResets,
    republishFailures,
    leasesSwept,
  });

  return NextResponse.json({
    captureResets,
    republishFailures,
    leasesSwept,
  });
}
