import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { runTask, BudgetExceededError } from '@/lib/ai/run';
import { ResearchSchema } from '@/lib/ai/research-schema';
import { createServiceClient } from '@/lib/supabase/service';
import { verifyJobRequest } from '@/lib/qstash';
import { sendPush, type StoredSubscription } from '@/lib/push/send';
import { isVapidConfigured, VapidNotConfiguredError } from '@/lib/push/vapid';
import { selectCapture, type NudgeCandidate } from '@/lib/nudge/select-capture';
import { summarizeResearch } from '@/lib/nudge/research-summary';
import { logger } from '@/lib/logger';
import { env } from '@/lib/env';
import type { CaptureKind, ResearchStatus } from '@/lib/capture/kinds';

// SPEC §4.4 — twice-daily nudge cron. Two QStash schedules invoke this route
// with ?slot=morning|evening at 10am / 5pm America/New_York.
//
// Order of operations:
//   1. Verify QStash signature.
//   2. Layer A — eligibility query: captures (state in raw/developed) with no
//      sent_at in last 20h AND no responded_at in last 48h. Skip silently if
//      none match (SPEC §4.9).
//   3. Layer B — claim job_runs row keyed nudge:{slot}:{YYYY-MM-DD}. Idempotent
//      across QStash redelivery / retries (SPEC §4.4 concurrency guard).
//   4. Pick one capture via the weighted strategy (selectCapture).
//   5. Generate the question via runTask('nudge_question').
//   6. Insert nudges row with question + scheduled_for=now() (sent_at left null).
//   7. Fan push out to every owner subscription. Set sent_at on first success.

export const runtime = 'nodejs';
// Haiku is fast (~3s); push fanout is single-digit ms per device; allow margin.
export const maxDuration = 60;

const Slot = z.enum(['morning', 'evening']);
type SlotName = z.infer<typeof Slot>;

const JOB_NAME = 'nudge';

// 20h since last sent + 48h since last responded — SPEC §4.4 step 1.
const SENT_DEBOUNCE_HOURS = 20;
const RESPONDED_DEBOUNCE_HOURS = 48;

function idempotencyKey(slot: SlotName, dateIsoYmd: string): string {
  // YYYY-MM-DD in America/New_York is the "natural day" of the slot. UTC midnight
  // would split the evening slot across days twice a year on DST boundaries —
  // we don't want that. Date is computed from the slot's local hour, see below.
  return `${JOB_NAME}:${slot}:${dateIsoYmd}`;
}

// Returns YYYY-MM-DD in APP_SCHEDULE_TZ for the current instant. We can't rely
// on `new Date().toISOString().slice(0,10)` because that's UTC, not local.
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
    logger.warn('jobs.nudge.auth_failed', { reason: auth.reason });
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  const slotParam = req.nextUrl.searchParams.get('slot');
  const slotResult = Slot.safeParse(slotParam);
  if (!slotResult.success) {
    return NextResponse.json({ error: 'invalid_slot' }, { status: 400 });
  }
  const slot = slotResult.data;

  if (!isVapidConfigured()) {
    logger.warn('jobs.nudge.vapid_not_configured');
    return NextResponse.json({ status: 'vapid_not_configured' }, { status: 200 });
  }

  const service = createServiceClient();

  // Layer B — claim before doing any expensive work. Two simultaneous QStash
  // deliveries of the same slot would both pass eligibility but only one wins
  // the unique index on (job_name, idempotency_key).
  const ymd = localYmd();
  const claim = await claimJobRun(service, slot, ymd);
  if (claim.status !== 'claimed') {
    logger.info('jobs.nudge.skipped_claim', { slot, ymd, reason: claim.status });
    return NextResponse.json({ status: claim.status });
  }
  const { jobRunId } = claim;

  try {
    // Layer A — eligibility.
    const candidate = await pickEligibleCapture(service);
    if (!candidate) {
      await markJobSucceeded(service, jobRunId, { skipped: 'no_eligible_captures' });
      logger.info('jobs.nudge.no_eligible_captures', { slot });
      return NextResponse.json({ status: 'no_eligible_captures' });
    }

    // Pull research (if any) for prompt context.
    const { data: rawResearch } = await service
      .from('research')
      .select(
        'competitors, market_context, recent_news, angles, confidence, sources_count, generated_at',
      )
      .eq('capture_id', candidate.id)
      .maybeSingle();
    const parsedResearch = rawResearch ? ResearchSchema.safeParse(rawResearch).data ?? null : null;

    // Generate the question.
    let question: string;
    let reasoning: string;
    try {
      const out = await runTask(
        'nudge_question',
        {
          kind: candidate.kind,
          title: candidate.title,
          content: candidate.content ?? '',
          research_summary: summarizeResearch(parsedResearch),
          conversation_state: '(none)',
        },
        { captureId: candidate.id },
      );
      question = out.question;
      reasoning = out.reasoning;
    } catch (err) {
      if (err instanceof BudgetExceededError) {
        await markJobFailed(service, jobRunId, 'budget_exceeded');
        logger.warn('jobs.nudge.budget_exceeded', { slot });
        return NextResponse.json({ status: 'budget_exceeded' });
      }
      const message = err instanceof Error ? err.message : String(err);
      await markJobFailed(service, jobRunId, `task_failed: ${message}`);
      logger.error('jobs.nudge.task_failed', { slot, captureId: candidate.id, err: message });
      return NextResponse.json({ status: 'task_failed' }, { status: 500 });
    }

    // Insert nudges row up front so the tap-target URL has a stable id.
    // sent_at stays null until at least one push delivery succeeds.
    const { data: nudgeRow, error: insertErr } = await service
      .from('nudges')
      .insert({
        capture_id: candidate.id,
        scheduled_for: new Date().toISOString(),
        question,
      })
      .select('id')
      .single();
    if (insertErr || !nudgeRow) {
      const message = insertErr?.message ?? 'unknown';
      await markJobFailed(service, jobRunId, `nudges_insert_failed: ${message}`);
      logger.error('jobs.nudge.insert_failed', { slot, err: message });
      return NextResponse.json({ status: 'insert_failed' }, { status: 500 });
    }

    // Push fanout. SPEC §4.4: preview text is "Re: {short_title} — {question}".
    const { data: subs } = await service
      .from('push_subscriptions')
      .select('id, endpoint, p256dh_key, auth_key')
      .eq('user_id', candidate.user_id);

    const payload = {
      title: `Re: ${truncateForPush(candidate.title, 60)}`,
      body: question,
      url: `/capture/${candidate.id}?nudge=${nudgeRow.id}`,
      tag: `forge-nudge-${nudgeRow.id}`,
    };

    let sent = 0;
    let expired = 0;
    let failed = 0;
    for (const row of subs ?? []) {
      const stored: StoredSubscription = {
        id: row.id,
        endpoint: row.endpoint,
        p256dhKey: row.p256dh_key,
        authKey: row.auth_key,
      };
      try {
        const result = await sendPush(stored, payload);
        if (result.ok) sent++;
        else if (result.expired) expired++;
        else failed++;
      } catch (err) {
        if (err instanceof VapidNotConfiguredError) {
          // Should be caught upstream by isVapidConfigured(), but defensive.
          await markJobFailed(service, jobRunId, 'vapid_not_configured');
          return NextResponse.json({ status: 'vapid_not_configured' }, { status: 200 });
        }
        throw err;
      }
    }

    if (sent > 0) {
      await service
        .from('nudges')
        .update({ sent_at: new Date().toISOString() })
        .eq('id', nudgeRow.id);
    }

    await markJobSucceeded(service, jobRunId, {
      captureId: candidate.id,
      nudgeId: nudgeRow.id,
      sent,
      expired,
      failed,
    });

    logger.info('jobs.nudge.completed', {
      slot,
      captureId: candidate.id,
      nudgeId: nudgeRow.id,
      sent,
      expired,
      failed,
      reasoning,
    });

    return NextResponse.json({
      status: 'sent',
      captureId: candidate.id,
      nudgeId: nudgeRow.id,
      sent,
      expired,
      failed,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markJobFailed(service, jobRunId, message);
    logger.error('jobs.nudge.unhandled', { slot, err: message });
    return NextResponse.json({ status: 'failed', error: message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type EligibleCapture = NudgeCandidate & {
  user_id: string;
  title: string;
  content: string | null;
};

async function pickEligibleCapture(
  service: ReturnType<typeof createServiceClient>,
): Promise<EligibleCapture | null> {
  const sentCutoff = new Date(Date.now() - SENT_DEBOUNCE_HOURS * 3600 * 1000).toISOString();
  const respondedCutoff = new Date(
    Date.now() - RESPONDED_DEBOUNCE_HOURS * 3600 * 1000,
  ).toISOString();

  // Fetch raw/developed captures with their most-recent-relevant nudge stats.
  // Single round-trip + in-memory filter — at v1 capture volumes (~2/week)
  // this is dozens of rows, not a query-planner concern.
  const { data: captures, error } = await service
    .from('captures')
    .select('id, kind, state, research_status, created_at, user_id, title, content')
    .in('state', ['raw', 'developed']);
  if (error) {
    throw new Error(`captures query failed: ${error.message}`);
  }
  if (!captures || captures.length === 0) return null;

  const ids = captures.map((c) => c.id);

  // For the debounce checks we only need to know:
  //   - latest sent_at per capture (to compare to sentCutoff)
  //   - latest responded_at per capture (to compare to respondedCutoff)
  // Pull both in one query.
  const { data: nudgeRows } = await service
    .from('nudges')
    .select('capture_id, sent_at, responded_at')
    .in('capture_id', ids);

  const recentlySent = new Set<string>();
  const recentlyResponded = new Set<string>();
  for (const row of nudgeRows ?? []) {
    if (row.sent_at && row.sent_at >= sentCutoff) recentlySent.add(row.capture_id);
    if (row.responded_at && row.responded_at >= respondedCutoff) {
      recentlyResponded.add(row.capture_id);
    }
  }

  const eligible: EligibleCapture[] = captures
    .filter((c) => !recentlySent.has(c.id) && !recentlyResponded.has(c.id))
    .map((c) => ({
      id: c.id,
      kind: c.kind as CaptureKind,
      state: c.state as 'raw' | 'developed',
      research_status: (c.research_status ?? 'pending') as ResearchStatus,
      created_at: c.created_at,
      user_id: c.user_id,
      title: c.title,
      content: c.content,
    }));

  const picked = selectCapture(eligible);
  if (!picked) return null;
  // selectCapture returns the same reference; cast back to the richer shape.
  return eligible.find((c) => c.id === picked.id) ?? null;
}

type ClaimResult =
  | { status: 'claimed'; jobRunId: string }
  | { status: 'already_running' }
  | { status: 'already_succeeded' };

async function claimJobRun(
  service: ReturnType<typeof createServiceClient>,
  slot: SlotName,
  ymd: string,
): Promise<ClaimResult> {
  const key = idempotencyKey(slot, ymd);

  const { data: existing } = await service
    .from('job_runs')
    .select('id, status')
    .eq('job_name', JOB_NAME)
    .eq('idempotency_key', key)
    .maybeSingle();

  if (existing) {
    if (existing.status === 'succeeded') return { status: 'already_succeeded' };
    if (existing.status === 'running') return { status: 'already_running' };
    // status === 'failed' — re-claim. The recovery cron flips stale 'running'
    // rows to 'failed' + 'stale_lease' after 20 minutes (SPEC §10.4).
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
    // Race: another worker beat us between SELECT and INSERT.
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

function truncateForPush(s: string, maxChars: number): string {
  return s.length <= maxChars ? s : `${s.slice(0, maxChars - 1).trimEnd()}…`;
}
