import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

// Match every path EXCEPT static assets, image optimization, the favicon, and
// the PWA service worker. Auth routes are handled inside updateSession.
//
// runtime: 'nodejs' — Node runtime middleware avoids Vercel's edge-function
// module allowlist so @supabase/ssr (and transitive deps) don't trip it.
// Cold-start cost is negligible for a single-user app.
export const config = {
  runtime: 'nodejs',
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|sw.js|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)',
  ],
};
