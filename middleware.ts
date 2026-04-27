import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

// Match every path EXCEPT static assets, image optimization, the favicon, and
// the PWA service worker. Auth routes are handled inside updateSession.
//
// Runs on the default Edge runtime. We previously opted into Node runtime via
// experimental.nodeMiddleware + runtime:'nodejs' to avoid Vercel's edge module
// allowlist, but Next 15.5's nodeMiddleware bundler emits ESM that the Vercel
// runtime then loads as CJS, crashing the function at load time. The original
// motivation (server-only-incompatible imports in middleware's graph) no
// longer applies — lib/env.ts and lib/supabase/middleware.ts are clean —
// so Edge is fine. See HANDOFF "Things to be careful about" #1.
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|sw.js|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)',
  ],
};
