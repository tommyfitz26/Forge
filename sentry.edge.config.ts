import * as Sentry from '@sentry/nextjs';

// Edge runtime — covers proxy.ts and any future edge routes. All current
// /api/jobs/*, /api/capture/*, /api/push/* are 'nodejs' per SPEC §8.3, so in
// practice this only catches proxy errors.
const dsn = process.env['SENTRY_DSN'];

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0,
  });
}
