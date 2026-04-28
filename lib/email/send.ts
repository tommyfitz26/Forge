import 'server-only';
import { getResend, getFromAddress } from './resend';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

// SPEC §4.5 — Resend wrapper for the Sunday weekly review email.
// Idempotency-Key is `weekly:{weekOf}` so a redelivered Stage 2 (or a crashed
// Stage 2 that ran the email send before crashing on the DB write) never
// double-sends. Resend caches the response server-side keyed on this header
// for ~24h, which covers all realistic redelivery windows.
//
// Failure posture: on any non-success outcome we LOG and RETURN — never
// throw. The caller (Stage 2) decides whether to mark the job failed and let
// QStash retry, or swallow and continue. Email is the only side-effect that
// the caller can't undo, so the idempotency key is the durable guard.

export type WeeklyEmailInput = {
  /** ISO date YYYY-MM-DD identifying the week's Monday. Used as the idempotency key suffix. */
  weekOf: string;
  subject: string;
  html: string;
  /** Optional plain-text alternative. Resend auto-derives one when omitted; pass when you want exact control. */
  text?: string;
};

export type SendEmailOutcome =
  | { ok: true; id: string }
  | { ok: false; error: string };

export async function sendWeeklyReviewEmail(
  input: WeeklyEmailInput,
): Promise<SendEmailOutcome> {
  const idempotencyKey = `weekly:${input.weekOf}`;
  let resend: ReturnType<typeof getResend>;
  let from: string;
  try {
    resend = getResend();
    from = getFromAddress();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn('email.not_configured', { weekOf: input.weekOf, err: message });
    return { ok: false, error: message };
  }

  try {
    const result = await resend.emails.send(
      {
        from,
        to: env.OWNER_EMAIL,
        subject: input.subject,
        html: input.html,
        ...(input.text ? { text: input.text } : {}),
      },
      { idempotencyKey },
    );

    if (result.error) {
      logger.warn('email.send_failed', {
        weekOf: input.weekOf,
        idempotencyKey,
        err: result.error.message,
      });
      return { ok: false, error: result.error.message };
    }
    if (!result.data?.id) {
      logger.warn('email.send_no_id', { weekOf: input.weekOf, idempotencyKey });
      return { ok: false, error: 'Resend returned no message id' };
    }

    logger.info('email.sent', {
      weekOf: input.weekOf,
      idempotencyKey,
      messageId: result.data.id,
    });
    return { ok: true, id: result.data.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn('email.send_threw', {
      weekOf: input.weekOf,
      idempotencyKey,
      err: message,
    });
    return { ok: false, error: message };
  }
}
