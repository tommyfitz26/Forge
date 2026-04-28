import type { NextConfig } from 'next';
import withSerwistInit from '@serwist/next';
import path from 'path';

// Derive the Supabase origin so CSP can whitelist it for fetch + WebSocket.
// In dev, a missing value falls through to '*.supabase.co' — CSP still loads.
const supabaseUrl = process.env['NEXT_PUBLIC_SUPABASE_URL'] ?? '';
const supabaseHost = (() => {
  try {
    return supabaseUrl ? new URL(supabaseUrl).host : '';
  } catch {
    return '';
  }
})();
const supabaseHttp = supabaseHost ? `https://${supabaseHost}` : 'https://*.supabase.co';
const supabaseWs = supabaseHost ? `wss://${supabaseHost}` : 'wss://*.supabase.co';

const isDev = process.env.NODE_ENV !== 'production';

// CSP — see SPEC §10.9. 'unsafe-inline' is required for Next.js hydration
// scripts and Tailwind inline styles. Dev additionally needs 'unsafe-eval'.
// `upgrade-insecure-requests` is prod-only — emitting it locally breaks
// http://localhost by forcing an https upgrade against a non-TLS dev server.
// Tightening to nonce-based CSP is a future enhancement (see Appendix D).
const csp = [
  `default-src 'self'`,
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' data: blob: https:`,
  `font-src 'self' data:`,
  `connect-src 'self' ${supabaseHttp} ${supabaseWs}`,
  `media-src 'self' blob:`,
  `frame-ancestors 'none'`,
  `object-src 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  ...(isDev ? [] : [`upgrade-insecure-requests`]),
].join('; ');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(__dirname),
  experimental: {
    // Server Actions default to a 1MB body cap, but photo uploads in
    // app/(app)/capture/actions.ts:createPhotoCapture pre-validate up to
    // MAX_PHOTO_BYTES (15MB). Match the cap so the action itself can receive
    // the FormData; oversized files still get rejected with a friendly error
    // before hitting Storage.
    serverActions: {
      bodySizeLimit: '15mb',
    },
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(self), microphone=(self), geolocation=()',
          },
          // HSTS: prod-only. Setting this on http://localhost poisons Safari's
          // HSTS cache (keyed by host) so the browser then refuses plaintext
          // localhost for the max-age — two years in this case.
          ...(isDev
            ? []
            : [
                {
                  key: 'Strict-Transport-Security',
                  value: 'max-age=63072000; includeSubDomains; preload',
                },
              ]),
        ],
      },
    ];
  },
};

// Sentry will be wired back in Phase 3 — see instrumentation.ts + sentry.*.ts
// files for the shape when we return to it. Keeping it out of the bundle for
// now eliminates @sentry/node + @opentelemetry dynamic requires that Vercel's
// edge checker trips on.

// Serwist generates public/sw.js from app/sw.ts on build. Disabled in dev so
// the SW doesn't cache stale chunks during HMR; iOS push still requires a real
// build (and the app installed to Home Screen) to test end-to-end.
const withSerwist = withSerwistInit({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  cacheOnNavigation: true,
  reloadOnOnline: true,
  disable: isDev,
});

export default withSerwist(nextConfig);
