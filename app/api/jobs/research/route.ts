import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { runTask } from '@/lib/ai/run';
import { createServiceClient } from '@/lib/supabase/service';
import { verifyJobRequest, publishJob } from '@/lib/qstash';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
// Sonnet + web_search (max_uses 8) regularly takes 60–140s. Anthropic SDK
// timeout is 140s (lib/ai/anthropic.ts); worst case 2 attempts × 140s + 2s
// backoff = 282s, comfortably inside this 300s budget. Vercel Fluid Compute
// (Hobby) lifts the legacy 60s cap.
export const maxDuration = 300;

// Body shape published by capture-side enqueue (and the recovery cron).
// `isDelayedRetry` distinguishes the one-hour delayed retry from the initial
// attempt so we don't loop forever on a permanently broken model output.
const Body = z.object({
  captureId: z.string().uuid(),
  isDelayedRetry: z.boolean().optional(),
});

const JOB_NAME = 'research';
const idempotencyKey = (captureId: string) => `${JOB_NAME}:${captureId}`;

// Two attempts per job invocation (initial + one in-loop retry). Persistent
// failures fall through to the QStash delayed retry an hour later.
const IN_JOB_RETRY_BACKOFFS_MS = [2_000];

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rawBody = await req.text();

  const auth = await verifyJobRequest(req, rawBody);
  if (!auth.ok) {
    logger.warn('jobs.research.auth_failed', { reason: auth.reason });
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(JSON.parse(rawBody));
  } catch (err) {
    logger.warn('jobs.research.bad_body', {
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'bad_body' }, { status: 400 });
  }
  const { captureId, isDelayedRetry = false } = parsed;
  const service = createServiceClient();

  // Layer A — business invariant. If a research row already exists, this job's
  // outcome is already realized; do nothing further. SPEC §10.4.
  const { data: existing } = await service
    .from('research')
    .select('id')
    .eq('capture_id', captureId)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ status: 'already_sent' });
  }

  // Load the capture content for the prompt. If it was deleted, drop the job
  // silently — no retry needed.
  const { data: capture, error: captureErr } = await service
    .from('captures')
    .select('kind, title, content, user_id')
    .eq('id', captureId)
    .maybeSingle();
  if (captureErr) {
    logger.error('jobs.research.capture_read_failed', { err: captureErr.message });
    return NextResponse.json({ error: 'capture_read_failed' }, { status: 500 });
  }
  if (!capture) {
    logger.info('jobs.research.capture_missing', { captureId });
    return NextResponse.json({ status: 'capture_missing' });
  }

  // Layer B — claim the job_runs row.
  const claim = await claimJobRun(service, captureId);
  if (claim.status === 'already_running' || claim.status === 'already_succeeded') {
    return NextResponse.json({ status: claim.status });
  }
  const { jobRunId } = claim;

  await service
    .from('captures')
    .update({ research_status: 'running', updated_at: new Date().toISOString() })
    .eq('id', captureId);

  let lastError: unknown = null;
  for (let attempt = 0; attempt <= IN_JOB_RETRY_BACKOFFS_MS.length; attempt += 1) {
    if (attempt > 0) {
      const delay = IN_JOB_RETRY_BACKOFFS_MS[attempt - 1] ?? 0;
      await sleep(delay);
    }
    try {
      const research = await runTask(
        'research_idea',
        {
          kind: capture.kind,
          title: capture.title,
          content: capture.content,
        },
        { captureId },
      );

      const { error: insertErr } = await service.from('research').insert({
        capture_id: captureId,
        model: 'claude-sonnet-4-6',
        competitors: research.competitors,
        market_context: research.market_context,
        recent_news: research.recent_news,
        angles: research.angles,
        confidence: research.confidence,
        sources_count: research.sources_count,
        generated_at: research.generated_at,
        raw_response: research,
      });
      if (insertErr) throw new Error(`research insert failed: ${insertErr.message}`);

      await service
        .from('captures')
        .update({ research_status: 'succeeded', updated_at: new Date().toISOString() })
        .eq('id', captureId);

      await service
        .from('job_runs')
        .update({
          status: 'succeeded',
          completed_at: new Date().toISOString(),
          error: null,
        })
        .eq('id', jobRunId);

      logger.info('jobs.research.succeeded', { captureId, attempt });
      return NextResponse.json({ status: 'succeeded' });
    } catch (err) {
      lastError = err;
      logger.warn('jobs.research.attempt_failed', {
        captureId,
        attempt,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // All in-job attempts failed.
  const errorMessage = lastError instanceof Error ? lastError.message : String(lastError);

  if (!isDelayedRetry) {
    // Schedule the one delayed retry. job_runs stays as 'failed' so the
    // delayed delivery can re-claim it.
    await service
      .from('job_runs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error: `${errorMessage} (will retry in 1h)`,
      })
      .eq('id', jobRunId);

    try {
      await publishJob(
        '/api/jobs/research',
        { captureId, isDelayedRetry: true },
        { delaySeconds: 3600, deduplicationId: `research_${captureId}_retry` },
      );
      logger.info('jobs.research.delayed_retry_enqueued', { captureId });
    } catch (publishErr) {
      // Couldn't enqueue the retry — surface as terminal failure.
      logger.error('jobs.research.delayed_retry_enqueue_failed', {
        captureId,
        err: publishErr instanceof Error ? publishErr.message : String(publishErr),
      });
      await service
        .from('captures')
        .update({ research_status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', captureId);
    }
    // Always 200 — we've handled the failure path; QStash should not auto-retry.
    return NextResponse.json({ status: 'scheduled_retry' });
  }

  // Delayed retry also failed → terminal. User can manually retry from the UI.
  await service
    .from('job_runs')
    .update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      error: errorMessage,
    })
    .eq('id', jobRunId);
  await service
    .from('captures')
    .update({ research_status: 'failed', updated_at: new Date().toISOString() })
    .eq('id', captureId);

  logger.error('jobs.research.failed_terminal', { captureId, err: errorMessage });
  return NextResponse.json({ status: 'failed' });
}

type ClaimResult =
  | { status: 'claimed'; jobRunId: string }
  | { status: 'already_running' }
  | { status: 'already_succeeded' };

async function claimJobRun(
  service: ReturnType<typeof createServiceClient>,
  captureId: string,
): Promise<ClaimResult> {
  const key = idempotencyKey(captureId);

  const { data: existing } = await service
    .from('job_runs')
    .select('id, status')
    .eq('job_name', JOB_NAME)
    .eq('idempotency_key', key)
    .maybeSingle();

  if (existing) {
    if (existing.status === 'succeeded') {
      return { status: 'already_succeeded' };
    }
    if (existing.status === 'running') {
      return { status: 'already_running' };
    }
    // status === 'failed' → re-claim. The recovery cron flips stuck 'running'
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
    if (updErr) {
      throw new Error(`job_runs re-claim failed: ${updErr.message}`);
    }
    return { status: 'claimed', jobRunId: existing.id };
  }

  const { data: created, error: insErr } = await service
    .from('job_runs')
    .insert({
      job_name: JOB_NAME,
      idempotency_key: key,
      status: 'running',
    })
    .select('id')
    .single();

  if (insErr || !created) {
    // Race: another worker inserted between our SELECT and INSERT. Treat as
    // already_running — the live lease is theirs to either complete or have
    // swept by the recovery cron.
    return { status: 'already_running' };
  }
  return { status: 'claimed', jobRunId: created.id };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
