import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/service';
import { verifyJobRequest } from '@/lib/qstash';
import { claimJobRun, markJobFailed, markJobSucceeded } from '@/lib/jobs/job-runs';
import { sendWeeklyReviewEmail } from '@/lib/email/send';
import { renderMarkdownToHtml } from '@/lib/email/markdown';
import { composePushBody } from '@/lib/email/compose';
import { sendPush, type StoredSubscription } from '@/lib/push/send';
import { isVapidConfigured } from '@/lib/push/vapid';
import { isResendConfigured } from '@/lib/email/resend';
import { logger } from '@/lib/logger';
import { env } from '@/lib/env';

// SPEC §4.5 Stage 2 — sends the weekly review email + push, marks the row
// `status='sent'`. Published by Stage 1 with delaySeconds: 0.
//
// Idempotency: Layer B claim on `weekly:{week_of}:stage2`, plus Resend's
// `Idempotency-Key: weekly:{week_of}` header so a redelivered Stage 2 never
// double-sends even if the post-send DB write was lost.

export const runtime = 'nodejs';
// Email send + push fanout is fast (~1s). Generous margin for slow networks.
export const maxDuration = 60;

const JOB_NAME = 'weekly_review';

const Body = z.object({
  week_of: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  captureCount: z.number().int().nonnegative(),
  patternCount: z.number().int().nonnegative(),
  readyCount: z.number().int().nonnegative(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rawBody = await req.text();
  const auth = await verifyJobRequest(req, rawBody);
  if (!auth.ok) {
    logger.warn('jobs.weekly_review.stage2.auth_failed', { reason: auth.reason });
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(JSON.parse(rawBody));
  } catch (err) {
    logger.warn('jobs.weekly_review.stage2.bad_body', {
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'bad_body' }, { status: 400 });
  }
  const { week_of: weekOf, captureCount, patternCount, readyCount } = parsed;

  const service = createServiceClient();

  // Resolve owner user_id (single-user invariant).
  const { data: owner } = await service
    .from('users')
    .select('id')
    .eq('email', env.OWNER_EMAIL)
    .maybeSingle();
  if (!owner) {
    logger.error('jobs.weekly_review.stage2.owner_missing', { weekOf });
    return NextResponse.json({ error: 'owner_missing' }, { status: 500 });
  }
  const userId = owner.id;

  const stage2Key = `weekly:${weekOf}:stage2`;
  const claim = await claimJobRun(service, JOB_NAME, stage2Key);
  if (claim.status !== 'claimed') {
    logger.info('jobs.weekly_review.stage2.skipped_claim', {
      weekOf,
      reason: claim.status,
    });
    return NextResponse.json({ status: claim.status });
  }
  const { jobRunId } = claim;

  try {
    const { data: row, error: readErr } = await service
      .from('weekly_summaries')
      .select('id, status, email_content_md, captures_included')
      .eq('user_id', userId)
      .eq('week_of', weekOf)
      .maybeSingle();
    if (readErr) {
      throw new Error(`weekly_summaries read failed: ${readErr.message}`);
    }
    if (!row) {
      throw new Error('weekly_summaries row missing');
    }
    if (row.status === 'sent') {
      await markJobSucceeded(service, jobRunId, { skipped: 'already_sent' });
      logger.info('jobs.weekly_review.stage2.already_sent', { weekOf });
      return NextResponse.json({ status: 'already_sent' });
    }
    if (!row.email_content_md) {
      throw new Error('email_content_md missing on composing row');
    }

    const subject = `This week in Forge — ${weekOf}`;
    const html = renderMarkdownToHtml(row.email_content_md);
    const text = row.email_content_md;
    const pushBody = composePushBody({ captureCount, patternCount, readyCount });

    let emailMessageId: string | null = null;
    let emailError: string | null = null;
    if (!isResendConfigured()) {
      // Resend env not set — log and continue. Stage 2 still tries to push,
      // and the row stays 'composing' so a future redelivery (after env fix)
      // can retry. SPEC §4.5 doesn't require we fail the job here.
      emailError = 'resend_not_configured';
      logger.warn('jobs.weekly_review.stage2.resend_not_configured', { weekOf });
    } else {
      const result = await sendWeeklyReviewEmail({
        weekOf,
        subject,
        html,
        text,
      });
      if (result.ok) {
        emailMessageId = result.id;
      } else {
        emailError = result.error;
      }
    }

    // Push fanout. Reuses the daily-nudge sender; expired endpoints get
    // pruned automatically.
    let pushSent = 0;
    let pushExpired = 0;
    let pushFailed = 0;
    if (!isVapidConfigured()) {
      logger.warn('jobs.weekly_review.stage2.vapid_not_configured', { weekOf });
    } else {
      const { data: subs } = await service
        .from('push_subscriptions')
        .select('id, endpoint, p256dh_key, auth_key')
        .eq('user_id', userId);
      for (const s of subs ?? []) {
        const stored: StoredSubscription = {
          id: s.id,
          endpoint: s.endpoint,
          p256dhKey: s.p256dh_key,
          authKey: s.auth_key,
        };
        const result = await sendPush(stored, {
          title: 'Your weekly Forge review',
          body: pushBody,
          url: `/review/${row.id}`,
          tag: `forge-weekly-${weekOf}`,
        });
        if (result.ok) pushSent++;
        else if (result.expired) pushExpired++;
        else pushFailed++;
      }
    }

    // Mark sent only when the email actually went out. Without an email send
    // the user has no notification channel that survives push expiry, so the
    // row stays 'composing' and a future redelivery will retry.
    if (emailMessageId) {
      const { error: updErr } = await service
        .from('weekly_summaries')
        .update({
          status: 'sent',
          email_message_id: emailMessageId,
          sent_at: new Date().toISOString(),
        })
        .eq('id', row.id);
      if (updErr) {
        // Email already sent (Resend Idempotency-Key would block a retry from
        // re-sending, but the user-visible state is wrong). Surface as a
        // failure so the job_runs row reflects reality.
        throw new Error(
          `weekly_summaries update to sent failed (email already sent ${emailMessageId}): ${updErr.message}`,
        );
      }
    }

    await markJobSucceeded(service, jobRunId, {
      weekOf,
      emailMessageId,
      emailError,
      pushSent,
      pushExpired,
      pushFailed,
    });
    logger.info('jobs.weekly_review.stage2.completed', {
      weekOf,
      emailMessageId,
      emailError,
      pushSent,
      pushExpired,
      pushFailed,
    });

    return NextResponse.json({
      status: emailMessageId ? 'sent' : 'partial',
      emailMessageId,
      emailError,
      pushSent,
      pushExpired,
      pushFailed,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markJobFailed(service, jobRunId, message);
    logger.error('jobs.weekly_review.stage2.failed', { weekOf, err: message });
    return NextResponse.json({ status: 'failed', error: message }, { status: 500 });
  }
}
