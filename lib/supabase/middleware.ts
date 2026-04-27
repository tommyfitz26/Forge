// NOTE: no `server-only` import here. Middleware runs on Edge Runtime, which
// does not set the `react-server` export condition — `server-only`'s default
// resolution throws at deploy time. Middleware is server-by-construction, so
// the guard would add no real protection anyway.
import { createServerClient, type CookieOptions } from '@supabase/ssr';

type CookieToSet = { name: string; value: string; options?: CookieOptions };
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from '@/lib/types/db';
import { env } from '@/lib/env';

// Paths that are public — no session or OWNER_EMAIL check.
// Anything else requires a session AND email === OWNER_EMAIL per SPEC §14.
const PUBLIC_PATHS = ['/login', '/auth/callback'];

// API paths that authenticate themselves (QStash signature, Bearer token, …)
// rather than relying on the session cookie.
// /api/capture supports both session-cookie (web) and Bearer-token (Shortcut)
// auth — the route picks based on ?source=. Either way, the route does its
// own auth check.
const SELF_AUTH_API_PREFIXES = ['/api/jobs/'];
const SELF_AUTH_API_EXACT = new Set(['/api/capture']);

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function isSelfAuthApi(pathname: string) {
  if (SELF_AUTH_API_EXACT.has(pathname)) return true;
  return SELF_AUTH_API_PREFIXES.some((p) => pathname.startsWith(p));
}

function isApiPath(pathname: string) {
  return pathname.startsWith('/api/');
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          // Reset the response so that cookie changes propagate.
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            if (options) {
              response.cookies.set(name, value, options);
            } else {
              response.cookies.set(name, value);
            }
          }
        },
      },
    },
  );

  // getUser() hits Supabase Auth and validates the JWT. Do NOT use getSession()
  // here — that only reads cookies and can be spoofed client-side.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic = isPublicPath(pathname);
  const isApi = isApiPath(pathname);

  // API paths that authenticate themselves (QStash-signed jobs, Bearer-token
  // Shortcut endpoints in Phase 1d) bypass session auth — the route checks.
  if (isSelfAuthApi(pathname)) {
    return response;
  }

  // Not authenticated → API paths get a JSON 401; everything else redirects
  // to /login.
  if (!user && !isPublic) {
    if (isApi) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  // Authenticated but wrong email → destroy session, redirect with unauthorized.
  // This is the SPEC §14 whitelist enforcement point.
  if (user && user.email !== env.OWNER_EMAIL) {
    await supabase.auth.signOut();
    if (isApi) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '?error=unauthorized';
    const redirect = NextResponse.redirect(url);
    // Copy the sign-out cookie clears onto the redirect response.
    for (const cookie of response.cookies.getAll()) {
      redirect.cookies.set(cookie);
    }
    return redirect;
  }

  // Authenticated + on /login → send to home.
  if (user && pathname === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return response;
}
