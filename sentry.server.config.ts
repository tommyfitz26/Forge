import * as Sentry from '@sentry/nextjs';

// Sentry init is DSN-gated — leaving SENTRY_DSN unset makes this a no-op, which
// is the intended state until we create a Sentry project. Once the DSN is in
// env, error capture activates automatically.
const dsn = process.env['SENTRY_DSN'];

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0,
    // We're single-tenant; PII in errors is the owner's own data. Allow it.
    sendDefaultPii: true,
  });
}
