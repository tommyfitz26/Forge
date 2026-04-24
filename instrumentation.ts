// Next.js instrumentation hook — loads the right Sentry config per runtime.
// Skip entirely when no DSN is set so @sentry/nextjs (which pulls in
// @sentry/node → @opentelemetry/instrumentation with dynamic requires) never
// enters the edge bundle — Vercel flags that as unsupported even on warnings.
export async function register() {
  if (!process.env['SENTRY_DSN']) return;

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

// Intentionally NOT exporting `onRequestError` while Sentry is DSN-less.
// Importing Sentry.captureRequestError at module top would drag @sentry/nextjs
// into the edge bundle. Re-enable with a dynamic import once SENTRY_DSN is set.
