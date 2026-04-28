import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendPush, type StoredSubscription } from '@/lib/push/send';
import { isVapidConfigured, VapidNotConfiguredError } from '@/lib/push/vapid';
import { logger } from '@/lib/logger';

// POST /api/push/test — fan a "Forge test push" notification out to every
// subscription belonging to the signed-in owner. Used to confirm VAPID + the
// service worker are wired correctly before the cron-driven nudge job ships
// (slice 3 of Phase 2b). Owner-only via the proxy's OWNER_EMAIL check.

export const runtime = 'nodejs';

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  if (!isVapidConfigured()) {
    return NextResponse.json({ error: 'vapid_not_configured' }, { status: 503 });
  }

  const { data: subs, error } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh_key, auth_key')
    .eq('user_id', user.id);
  if (error) {
    logger.error('push.test_list_failed', { err: error.message });
    return NextResponse.json({ error: 'list_failed' }, { status: 500 });
  }
  if (!subs || subs.length === 0) {
    return NextResponse.json({ error: 'no_subscriptions' }, { status: 404 });
  }

  const payload = {
    title: 'Forge — test push',
    body: 'If you see this, push is working. Daily nudges land here.',
    url: '/',
    tag: 'forge-test',
  };

  let sent = 0;
  let expired = 0;
  let failed = 0;
  try {
    for (const row of subs) {
      const stored: StoredSubscription = {
        id: row.id,
        endpoint: row.endpoint,
        p256dhKey: row.p256dh_key,
        authKey: row.auth_key,
      };
      const result = await sendPush(stored, payload);
      if (result.ok) sent++;
      else if (result.expired) expired++;
      else failed++;
    }
  } catch (err) {
    if (err instanceof VapidNotConfiguredError) {
      return NextResponse.json({ error: 'vapid_not_configured' }, { status: 503 });
    }
    throw err;
  }

  logger.info('push.test_sent', { sent, expired, failed, total: subs.length });
  return NextResponse.json({ ok: true, sent, expired, failed, total: subs.length });
}
