import * as Sentry from '@sentry/nextjs';

// Edge runtime (middleware + any edge routes). All our /api/jobs/* and
// /api/capture/* are 'nodejs' runtime per SPEC §8.3, so in practice this
// only catches middleware errors.
const dsn = process.env['SENTRY_DSN'];

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0,
  });
}
