import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { verifyJobRequest } from '@/lib/qstash';
import { sendPush, type StoredSubscription } from '@/lib/push/send';
import { isVapidConfigured, VapidNotConfiguredError } from '@/lib/push/vapid';
import { logger } from '@/lib/logger';
import { env } from '@/lib/env';

// SPEC §11 — Morning focus nudge.
//
// QStash schedule invokes this route at ~9am America/New_York. Behavior:
//   1. Verify QStash signature.
//   2. Claim a job_runs row idempotency_key=morning-focus-nudge:{YYYY-MM-DD}
//      (local date). Idempotent across QStash redelivery / retries.
//   3. For each user with push subscriptions, check if today's intention row
//      exists. If it does, skip them — the lamp is already lit.
//   4. Otherwise push: title "Today's focus" / body "What's the one thing on
//      the bench today?" / url "/today".
//
// Push fanout uses the same primitives as the regular nudge job.

export const runtime = 'nodejs';
// Push fanout is a few ms per device; intentions read is one indexed query;
// sub-second runtime expected even at hundreds of users.
export const maxDuration = 30;

const JOB_NAME = 'morning-focus-nudge';

function localYmd(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: env.APP_SCHEDULE_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rawBody = await req.text();

  const auth = await verifyJobRequest(req, rawBody);
  if (!auth.ok) {
    logger.warn('jobs.morning_focus_nudge.auth_failed', { reason: auth.reason });
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  if (!isVapidConfigured()) {
    logger.warn('jobs.morning_focus_nudge.vapid_not_configured');
    return NextResponse.json({ status: 'vapid_not_configured' }, { status: 200 });
  }

  const service = createServiceClient();

  const ymd = localYmd();
  const claim = await claimJobRun(service, ymd);
  if (claim.status !== 'claimed') {
    logger.info('jobs.morning_focus_nudge.skipped_claim', { ymd, reason: claim.status });
    return NextResponse.json({ status: claim.status });
  }
  const { jobRunId } = claim;

  try {
    // Distinct user ids that have push subscriptions.
    const { data: subRows, error: subErr } = await service
      .from('push_subscriptions')
      .select('id, endpoint, p256dh_key, auth_key, user_id');
    if (subErr) {
      throw new Error(`push_subscriptions query failed: ${subErr.message}`);
    }
    const allSubs = subRows ?? [];
    if (allSubs.length === 0) {
      await markJobSucceeded(service, jobRunId, { reason: 'no_subscriptions' });
      return NextResponse.json({ status: 'no_subscriptions' });
    }

    const userIds = [...new Set(allSubs.map((s) => s.user_id))];

    // Fetch today's intentions in one round-trip — if a user is here, skip them.
    // Cast to `any` because the auto-generated Database type doesn't yet
    // include the `intentions` table (post-`pnpm db:types` this clears).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const intentionsTable = (service as any).from('intentions');
    const { data: intRows, error: intErr } = await intentionsTable
      .select('owner_id')
      .eq('day', ymd)
      .in('owner_id', userIds);
    if (intErr) {
      throw new Error(`intentions query failed: ${intErr.message}`);
    }
    const lit = new Set(
      ((intRows ?? []) as Array<{ owner_id: string }>).map((r) => r.owner_id),
    );
    const targets = userIds.filter((u) => !lit.has(u));

    if (targets.length === 0) {
      await markJobSucceeded(service, jobRunId, { reason: 'all_lit', userCount: userIds.length });
      logger.info('jobs.morning_focus_nudge.all_lit', { ymd, userCount: userIds.length });
      return NextResponse.json({ status: 'all_lit', userCount: userIds.length });
    }

    const payload = {
      title: "Today's focus",
      body: "What's the one thing on the bench today?",
      url: '/today',
      tag: `forge-morning-focus-${ymd}`,
    };

    let sent = 0;
    let expired = 0;
    let failed = 0;
    let usersNudged = 0;
    for (const uid of targets) {
      const userSubs = allSubs.filter((s) => s.user_id === uid);
      let anyDelivered = false;
      for (const row of userSubs) {
        const stored: StoredSubscription = {
          id: row.id,
          endpoint: row.endpoint,
          p256dhKey: row.p256dh_key,
          authKey: row.auth_key,
        };
        try {
          const result = await sendPush(stored, payload);
          if (result.ok) {
            sent++;
            anyDelivered = true;
          } else if (result.expired) {
            expired++;
          } else {
            failed++;
          }
        } catch (err) {
          if (err instanceof VapidNotConfiguredError) {
            await markJobFailed(service, jobRunId, 'vapid_not_configured');
            return NextResponse.json({ status: 'vapid_not_configured' }, { status: 200 });
          }
          throw err;
        }
      }
      if (anyDelivered) usersNudged++;
    }

    await markJobSucceeded(service, jobRunId, {
      ymd,
      userCount: userIds.length,
      targets: targets.length,
      usersNudged,
      sent,
      expired,
      failed,
    });

    logger.info('jobs.morning_focus_nudge.completed', {
      ymd,
      userCount: userIds.length,
      targets: targets.length,
      usersNudged,
      sent,
      expired,
      failed,
    });

    return NextResponse.json({
      status: 'sent',
      userCount: userIds.length,
      targets: targets.length,
      usersNudged,
      sent,
      expired,
      failed,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markJobFailed(service, jobRunId, message);
    logger.error('jobs.morning_focus_nudge.unhandled', { err: message });
    return NextResponse.json({ status: 'failed', error: message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Helpers — same idempotency-claim flow as the existing nudge job.
// ---------------------------------------------------------------------------

type ClaimResult =
  | { status: 'claimed'; jobRunId: string }
  | { status: 'already_running' }
  | { status: 'already_succeeded' };

async function claimJobRun(
  service: ReturnType<typeof createServiceClient>,
  ymd: string,
): Promise<ClaimResult> {
  const key = `${JOB_NAME}:${ymd}`;

  const { data: existing } = await service
    .from('job_runs')
    .select('id, status')
    .eq('job_name', JOB_NAME)
    .eq('idempotency_key', key)
    .maybeSingle();

  if (existing) {
    if (existing.status === 'succeeded') return { status: 'already_succeeded' };
    if (existing.status === 'running') return { status: 'already_running' };
    const { error: updErr } = await service
      .from('job_runs')
      .update({
        status: 'running',
        started_at: new Date().toISOString(),
        completed_at: null,
        error: null,
      })
      .eq('id', existing.id);
    if (updErr) throw new Error(`job_runs re-claim failed: ${updErr.message}`);
    return { status: 'claimed', jobRunId: existing.id };
  }

  const { data: created, error: insErr } = await service
    .from('job_runs')
    .insert({ job_name: JOB_NAME, idempotency_key: key, status: 'running' })
    .select('id')
    .single();
  if (insErr || !created) {
    return { status: 'already_running' };
  }
  return { status: 'claimed', jobRunId: created.id };
}

async function markJobSucceeded(
  service: ReturnType<typeof createServiceClient>,
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

async function markJobFailed(
  service: ReturnType<typeof createServiceClient>,
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
