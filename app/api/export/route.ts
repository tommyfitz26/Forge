import 'server-only';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { buildUserExport } from '@/lib/export/build-export';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
// At v1 capture volumes (~2/week) the export is small. Allow headroom for
// growth without bumping into Vercel function timeouts.
export const maxDuration = 60;

/**
 * GET /api/export
 *
 * Returns the full user data dump as a JSON file with a Content-Disposition
 * attachment header so the browser triggers a download. Auth-gated; RLS on
 * every queried table guarantees we only ever see the signed-in user's rows.
 */
export async function GET(): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const ownerEmail = user.email ?? '';

  let payload: string;
  try {
    const data = await buildUserExport(ownerEmail);
    payload = JSON.stringify(data, null, 2);
  } catch (err) {
    logger.error('export.failed', {
      ownerId: user.id,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'export_failed' }, { status: 500 });
  }

  const day = new Date().toISOString().slice(0, 10);
  const filename = `forge-export-${day}.json`;

  logger.info('export.completed', {
    ownerId: user.id,
    bytes: payload.length,
  });

  return new Response(payload, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      // Don't cache — a fresh export should hit the database every time.
      'Cache-Control': 'no-store',
    },
  });
}
