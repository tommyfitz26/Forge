// Next.js instrumentation hook. No-op for now.
// Sentry will be reinstalled and wired here in Phase 3 (see SPEC §15);
// keeping it out of the bundle now avoids @sentry/node + @opentelemetry
// dynamic requires that Vercel's deploy checker flags.
export async function register() {
  // no-op
}
