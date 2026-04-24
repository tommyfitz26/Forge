import * as Sentry from '@sentry/nextjs';

// Client-side Sentry. Uses NEXT_PUBLIC_SENTRY_DSN so the DSN can reach the
// browser bundle. Optional — unset DSN = no-op.
const dsn = process.env['NEXT_PUBLIC_SENTRY_DSN'];

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0,
    replaysOnErrorSampleRate: 1.0,
    replaysSessionSampleRate: 0,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
