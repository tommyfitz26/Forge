// Next.js instrumentation hook. Sentry is dynamic-imported behind a SENTRY_DSN
// gate so the package isn't resolved at build time when DSN is absent (e.g.
// CI, dev without .env.local). Per memory `project_sentry_deferred.md`, do
// NOT static-import @sentry/nextjs at module top — that drags it into the
// edge bundle even when DSN-less. `import type` is erased at compile time so
// the Parameters<> type below is free at runtime.
import type { captureRequestError } from '@sentry/nextjs';

export async function register() {
  if (!process.env.SENTRY_DSN) return;
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export async function onRequestError(
  ...args: Parameters<typeof captureRequestError>
) {
  if (!process.env.SENTRY_DSN) return;
  const Sentry = await import('@sentry/nextjs');
  return Sentry.captureRequestError(...args);
}
