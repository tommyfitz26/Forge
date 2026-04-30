import * as Sentry from '@sentry/nextjs';

// Server runtime (Node) — covers app/api/* routes, server actions, RSC.
// DSN-gated so the file is a no-op when SENTRY_DSN is unset.
const dsn = process.env['SENTRY_DSN'];

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0,
    // Single-tenant; PII in errors is the owner's own data.
    sendDefaultPii: true,
  });
}
