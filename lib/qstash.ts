import 'server-only';
import { Client, Receiver } from '@upstash/qstash';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

// QStash client + signature verification. Production traffic always proves
// authenticity via the QStash receiver; dev requests can also use a bearer
// escape hatch (JOB_DEV_BEARER) so you can curl jobs locally without ngrok.

let _client: Client | null = null;
export function getQStash(): Client {
  if (!env.QSTASH_TOKEN) {
    throw new Error('QSTASH_TOKEN is not set — cannot publish jobs.');
  }
  if (!_client) {
    _client = new Client({ token: env.QSTASH_TOKEN });
  }
  return _client;
}

let _receiver: Receiver | null = null;
function getReceiver(): Receiver | null {
  if (!env.QSTASH_CURRENT_SIGNING_KEY || !env.QSTASH_NEXT_SIGNING_KEY) {
    return null;
  }
  if (!_receiver) {
    _receiver = new Receiver({
      currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
      nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY,
    });
  }
  return _receiver;
}

export type AuthResult =
  | { ok: true; via: 'qstash' | 'dev-bearer' }
  | { ok: false; status: 401; reason: string };

/**
 * Verify a job request is authentic. Accepts either a QStash signature or, in
 * dev only, a bearer matching `JOB_DEV_BEARER`. The function consumes the body
 * (text) so callers should pass the same string to their downstream parsing.
 */
export async function verifyJobRequest(
  req: Request,
  rawBody: string,
): Promise<AuthResult> {
  // Dev bearer first — it's a fast path that lets a local curl skip the
  // (production-only) signature dance entirely. Strictly gated on NODE_ENV.
  if (env.NODE_ENV !== 'production' && env.JOB_DEV_BEARER) {
    const auth = req.headers.get('authorization') ?? '';
    const match = auth.match(/^Bearer\s+(.+)$/i);
    if (match && match[1] === env.JOB_DEV_BEARER) {
      return { ok: true, via: 'dev-bearer' };
    }
  }

  const receiver = getReceiver();
  if (!receiver) {
    logger.warn('qstash.no_signing_keys');
    return { ok: false, status: 401, reason: 'qstash_not_configured' };
  }

  const signature = req.headers.get('upstash-signature');
  if (!signature) {
    return { ok: false, status: 401, reason: 'missing_signature' };
  }

  try {
    const valid = await receiver.verify({
      signature,
      body: rawBody,
      url: req.url,
    });
    if (!valid) {
      return { ok: false, status: 401, reason: 'invalid_signature' };
    }
    return { ok: true, via: 'qstash' };
  } catch (err) {
    logger.warn('qstash.verify_failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, status: 401, reason: 'invalid_signature' };
  }
}

/**
 * Publish a job to a `/api/jobs/*` endpoint. Fire-and-forget — caller should
 * not block on the resulting promise except in tests / explicit retries.
 */
export async function publishJob(
  path: `/api/jobs/${string}`,
  body: unknown,
  opts?: { delaySeconds?: number; deduplicationId?: string },
): Promise<{ messageId: string }> {
  const url = `${env.NEXT_PUBLIC_APP_URL}${path}`;
  const client = getQStash();
  const result = await client.publishJSON({
    url,
    body,
    ...(opts?.delaySeconds ? { delay: opts.delaySeconds } : {}),
    ...(opts?.deduplicationId ? { deduplicationId: opts.deduplicationId } : {}),
  });
  return { messageId: result.messageId };
}
