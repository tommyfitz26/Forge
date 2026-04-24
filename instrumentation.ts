import * as Sentry from '@sentry/nextjs';

// Next.js instrumentation hook — loads the right Sentry config per runtime.
// Edge runtime uses the edge config; Node runtime uses the server config.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
