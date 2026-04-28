import 'server-only';
import webpush, { type PushSubscription as WebPushSubscription, type SendResult } from 'web-push';
import { resolveVapid } from './vapid';
import { createServiceClient } from '@/lib/supabase/service';
import { logger } from '@/lib/logger';

export type StoredSubscription = {
  id: string;
  endpoint: string;
  p256dhKey: string;
  authKey: string;
};

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

export type SendOutcome =
  | { ok: true; statusCode: number }
  | { ok: false; statusCode: number; expired: boolean; error: string };

let configured = false;
function ensureConfigured() {
  if (configured) return;
  const vapid = resolveVapid();
  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
  configured = true;
}

function toWebPushSub(sub: StoredSubscription): WebPushSubscription {
  return {
    endpoint: sub.endpoint,
    keys: { p256dh: sub.p256dhKey, auth: sub.authKey },
  };
}

/**
 * Send one push. Deletes the subscription row on 404/410 (endpoint gone).
 * Caller is responsible for budgets/idempotency upstream — this is a leaf
 * helper and only logs on failure.
 */
export async function sendPush(
  sub: StoredSubscription,
  payload: PushPayload,
): Promise<SendOutcome> {
  ensureConfigured();
  let result: SendResult;
  try {
    result = await webpush.sendNotification(toWebPushSub(sub), JSON.stringify(payload));
  } catch (err) {
    const statusCode =
      typeof err === 'object' && err !== null && 'statusCode' in err
        ? Number((err as { statusCode: unknown }).statusCode) || 0
        : 0;
    const expired = statusCode === 404 || statusCode === 410;
    if (expired) {
      await deleteSubscriptionByEndpoint(sub.endpoint);
      logger.info('push.subscription_expired', { endpoint: redactEndpoint(sub.endpoint), statusCode });
    } else {
      logger.warn('push.send_failed', {
        endpoint: redactEndpoint(sub.endpoint),
        statusCode,
        err: err instanceof Error ? err.message : String(err),
      });
    }
    return {
      ok: false,
      statusCode,
      expired,
      error: err instanceof Error ? err.message : String(err),
    };
  }
  await touchLastUsed(sub.id);
  return { ok: true, statusCode: result.statusCode };
}

async function deleteSubscriptionByEndpoint(endpoint: string): Promise<void> {
  const service = createServiceClient();
  const { error } = await service.from('push_subscriptions').delete().eq('endpoint', endpoint);
  if (error) {
    logger.warn('push.subscription_delete_failed', {
      endpoint: redactEndpoint(endpoint),
      err: error.message,
    });
  }
}

async function touchLastUsed(id: string): Promise<void> {
  const service = createServiceClient();
  const { error } = await service
    .from('push_subscriptions')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', id);
  if (error) {
    logger.warn('push.touch_last_used_failed', { id, err: error.message });
  }
}

// Endpoints contain a per-device token in the path; redact for logs.
function redactEndpoint(endpoint: string): string {
  try {
    const url = new URL(endpoint);
    return `${url.origin}${url.pathname.split('/').slice(0, 3).join('/')}/…`;
  } catch {
    return '(unparseable endpoint)';
  }
}
