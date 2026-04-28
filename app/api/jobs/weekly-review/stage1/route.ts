import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { runTask, BudgetExceededError } from '@/lib/ai/run';
import { ResearchSchema } from '@/lib/ai/research-schema';
import { createServiceClient } from '@/lib/supabase/service';
import { verifyJobRequest, publishJob } from '@/lib/qstash';
import { claimJobRun, markJobFailed, markJobSucceeded } from '@/lib/jobs/job-runs';
import { logger } from '@/lib/logger';
import { env } from '@/lib/env';
import { weekOfFor, weekStartInstant } from '@/lib/weekly-review/week-of';
import {
  formatPatternDetectionBlock,
  formatWeeklySummaryCapturesBlock,
  formatPatternsBlock,
  type CaptureForPatterns,
  type CaptureForSummary,
} from '@/lib/weekly-review/captures-block';
import { composeWeeklyReviewEmail } from '@/lib/email/compose';
import type { CaptureKind } from '@/lib/capture/kinds';

// SPEC §4.5 Stage 1 — runs pattern_detection + weekly_summary, writes the
// weekly_summaries row, publishes Stage 2. Cron-fired Sunday 17:00 ET.
//
// Layer B (job_runs) wraps the whole stage so a redelivery early-exits.
// Layer A (weekly_summaries (user_id, week_of) unique) is checked inside
// the claim so a row already at status='sent' short-circuits without
// running LLM tasks. A row at 'composing' is treated as resume — re-run
// the tasks and overwrite (cheap; idempotency on email send + push is the
// guard against user-visible duplicates).

export const runtime = 'nodejs';
// Two Sonnet calls, each 30–90s in the worst case + DB I/O. Same envelope
// as the research route (140s SDK timeout, retries, etc).
export const maxDuration = 300;

const JOB_NAME = 'weekly_review';
// SPEC §4.7 — 40-capture cap on pattern detection input.
const PATTERN_DETECTION_CAP = 40;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rawBody = await req.text();
  const auth = await verifyJobRequest(req, rawBody);
  if (!auth.ok) {
    logger.warn('jobs.weekly_review.stage1.auth_failed', { reason: auth.reason });
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  const service = createServiceClient();
  const weekOf = weekOfFor(new Date());

  // Resolve the owner's user_id. Single-user invariant — there's exactly one
  // row in public.users keyed off OWNER_EMAIL.
  const { data: owner, error: ownerErr } = await service
    .from('users')
    .select('id')
    .eq('email', env.OWNER_EMAIL)
    .maybeSingle();
  if (ownerErr || !owner) {
    logger.error('jobs.weekly_review.stage1.owner_missing', {
      err: ownerErr?.message,
    });
    return NextResponse.json({ error: 'owner_missing' }, { status: 500 });
  }
  const userId = owner.id;
  const stage1Key = `weekly:${weekOf}:stage1`;

  const claim = await claimJobRun(service, JOB_NAME, stage1Key);
  if (claim.status !== 'claimed') {
    logger.info('jobs.weekly_review.stage1.skipped_claim', {
      weekOf,
      reason: claim.status,
    });
    return NextResponse.json({ status: claim.status });
  }
  const { jobRunId } = claim;

  try {
    // Layer A short-circuit: if last week's row is already 'sent', do nothing.
    const { data: existing } = await service
      .from('weekly_summaries')
      .select('id, status')
      .eq('user_id', userId)
      .eq('week_of', weekOf)
      .maybeSingle();

    if (existing?.status === 'sent') {
      await markJobSucceeded(service, jobRunId, { skipped: 'already_sent' });
      logger.info('jobs.weekly_review.stage1.already_sent', { weekOf });
      return NextResponse.json({ status: 'already_sent' });
    }

    // This-week's captures (eligibility + summary input).
    const weekStart = weekStartInstant(weekOf);
    const { data: thisWeekRows, error: thisWeekErr } = await service
      .from('captures')
      .select('id, kind, title, content, created_at')
      .eq('user_id', userId)
      .neq('state', 'archived')
      .gte('created_at', weekStart)
      .order('created_at', { ascending: true });
    if (thisWeekErr) {
      throw new Error(`this-week captures query failed: ${thisWeekErr.message}`);
    }
    const thisWeekCaptures = thisWeekRows ?? [];

    if (thisWeekCaptures.length === 0) {
      await markJobSucceeded(service, jobRunId, { skipped: 'no_captures' });
      logger.info('jobs.weekly_review.stage1.no_captures', { weekOf });
      return NextResponse.json({ status: 'no_captures' });
    }

    // Pattern detection input — 40 most recent non-archived, no time bound.
    // SPEC §4.7 (post-2026-04-28 edit).
    const { data: patternRows, error: patternErr } = await service
      .from('captures')
      .select('id, kind, title, content, created_at')
      .eq('user_id', userId)
      .neq('state', 'archived')
      .order('created_at', { ascending: false })
      .limit(PATTERN_DETECTION_CAP);
    if (patternErr) {
      throw new Error(`pattern captures query failed: ${patternErr.message}`);
    }
    const patternCandidates: CaptureForPatterns[] = (patternRows ?? []).map((c) => ({
      id: c.id,
      kind: c.kind as CaptureKind,
      title: c.title,
      content: c.content,
      created_at: c.created_at,
    }));

    const patterns = await runTask('pattern_detection', {
      captures_block: formatPatternDetectionBlock(patternCandidates),
    });

    // Research lookup for this week's captures, used by the summary block.
    const thisWeekIds = thisWeekCaptures.map((c) => c.id);
    const { data: researchRows } = await service
      .from('research')
      .select(
        'capture_id, competitors, market_context, recent_news, angles, confidence, sources_count, generated_at',
      )
      .in('capture_id', thisWeekIds);
    const researchByCaptureId = new Map<string, ReturnType<typeof ResearchSchema.parse> | null>();
    for (const r of researchRows ?? []) {
      const parsed = ResearchSchema.safeParse(r);
      researchByCaptureId.set(r.capture_id, parsed.success ? parsed.data : null);
    }

    const summaryInput: CaptureForSummary[] = thisWeekCaptures.map((c) => ({
      id: c.id,
      kind: c.kind as CaptureKind,
      title: c.title,
      content: c.content,
      created_at: c.created_at,
      research: researchByCaptureId.get(c.id) ?? null,
    }));

    // Lookup for the patterns_block — covers any UUID the model surfaced.
    const allCapturesLookup = new Map(
      patternCandidates.map(
        (c) => [c.id, { kind: c.kind, title: c.title }] as const,
      ),
    );

    const summary = await runTask('weekly_summary', {
      week_of: weekOf,
      captures_block: formatWeeklySummaryCapturesBlock(summaryInput),
      patterns_block: formatPatternsBlock(patterns.pairs, allCapturesLookup),
    });

    // Insert (or reuse) the weekly_summaries row so Stage 2 has a stable id
    // for the deep-link URL.
    let weekId: string;
    if (existing) {
      weekId = existing.id;
    } else {
      const { data: inserted, error: insertErr } = await service
        .from('weekly_summaries')
        .insert({
          user_id: userId,
          week_of: weekOf,
          status: 'composing',
          captures_included: thisWeekIds,
          patterns_detected: patterns.pairs,
        })
        .select('id')
        .single();
      if (insertErr || !inserted) {
        throw new Error(
          `weekly_summaries insert failed: ${insertErr?.message ?? 'unknown'}`,
        );
      }
      weekId = inserted.id;
    }

    // Compose markdown (canonical artifact) — Stage 2 re-renders HTML from this.
    const captureMeta = thisWeekCaptures.map((c) => ({
      id: c.id,
      kind: c.kind as CaptureKind,
      title: c.title,
    }));
    const composed = composeWeeklyReviewEmail({
      weekId,
      weekOf,
      summary,
      captures: captureMeta,
    });

    const { error: updErr } = await service
      .from('weekly_summaries')
      .update({
        email_content_md: composed.markdown,
        captures_included: thisWeekIds,
        patterns_detected: patterns.pairs,
      })
      .eq('id', weekId);
    if (updErr) {
      throw new Error(`weekly_summaries update failed: ${updErr.message}`);
    }

    // Publish Stage 2. Counts go in the body so Stage 2 doesn't need an
    // extra schema column or to re-parse the markdown for the push payload.
    const counts = {
      captureCount: summary.captures.length,
      patternCount: patterns.pairs.length,
      readyCount: summary.ready_to_develop_ids.length,
    };
    await publishJob(
      '/api/jobs/weekly-review/stage2',
      { week_of: weekOf, ...counts },
      {
        delaySeconds: 0,
        deduplicationId: `weekly:${weekOf}:stage2:publish`,
      },
    );

    await markJobSucceeded(service, jobRunId, { weekOf, ...counts });
    logger.info('jobs.weekly_review.stage1.completed', { weekOf, ...counts });
    return NextResponse.json({ status: 'stage2_publishing', weekOf, ...counts });
  } catch (err) {
    if (err instanceof BudgetExceededError) {
      await markJobFailed(service, jobRunId, 'budget_exceeded');
      logger.warn('jobs.weekly_review.stage1.budget_exceeded', { weekOf });
      return NextResponse.json({ status: 'budget_exceeded' });
    }
    const message = err instanceof Error ? err.message : String(err);
    await markJobFailed(service, jobRunId, message);
    logger.error('jobs.weekly_review.stage1.failed', { weekOf, err: message });
    return NextResponse.json({ status: 'failed', error: message }, { status: 500 });
  }
}
