import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';

// POST /api/push/subscribe — register a Web Push subscription for the signed-in
// owner. Cookie-auth only (the proxy already enforces OWNER_EMAIL); this route
// just translates the incoming PushSubscription JSON into a row.
//
// DELETE /api/push/subscribe — accepts { endpoint } and removes the row.

export const runtime = 'nodejs';

const SubscribeBody = z.object({
  subscription: z.object({
    endpoint: z.string().url(),
    keys: z.object({
      p256dh: z.string().min(1),
      auth: z.string().min(1),
    }),
  }),
  // User-Agent isn't a great device identifier on iOS, but it's enough to tell
  // "iPhone" from "Chrome on macOS" when looking at push_subscriptions by hand.
  userAgent: z.string().max(500).optional(),
});

const UnsubscribeBody = z.object({
  endpoint: z.string().url(),
});

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let parsed;
  try {
    parsed = SubscribeBody.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'invalid_body', issues: err instanceof z.ZodError ? err.issues : undefined },
      { status: 400 },
    );
  }
  const { subscription, userAgent } = parsed;

  // endpoint is the unique key — onConflict upsert handles re-subscribe (the
  // browser will hand back a fresh subscription whose endpoint may match an
  // older row if the device hasn't rotated; either way we want one row).
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      {
        user_id: user.id,
        endpoint: subscription.endpoint,
        p256dh_key: subscription.keys.p256dh,
        auth_key: subscription.keys.auth,
        user_agent: userAgent ?? req.headers.get('user-agent') ?? null,
        last_used_at: null,
      },
      { onConflict: 'endpoint' },
    );
  if (error) {
    logger.error('push.subscribe_failed', { userId: user.id, err: error.message });
    return NextResponse.json({ error: 'persist_failed' }, { status: 500 });
  }

  logger.info('push.subscribed', { userId: user.id });
  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let parsed;
  try {
    parsed = UnsubscribeBody.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'invalid_body', issues: err instanceof z.ZodError ? err.issues : undefined },
      { status: 400 },
    );
  }

  // Scoped to user_id as defense-in-depth even though endpoints are unique.
  const { error } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('user_id', user.id)
    .eq('endpoint', parsed.endpoint);
  if (error) {
    logger.error('push.unsubscribe_failed', { userId: user.id, err: error.message });
    return NextResponse.json({ error: 'delete_failed' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
