'use client';

import * as Sentry from '@sentry/nextjs';
import { useState } from 'react';

// TEMPORARY: verifies the Sentry wiring end-to-end (Phase 3 slice 2 smoke test).
// Delete this route once Issues land in the Sentry dashboard. Keeping it here
// also catches regressions if anyone touches the instrumentation files later.
export default function SentryTestPage() {
  const [lastEventId, setLastEventId] = useState<string | undefined>();

  return (
    <main style={{ maxWidth: 640, margin: '4rem auto', padding: '1rem' }}>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Sentry test</h1>
      <p style={{ marginBottom: '1.5rem' }}>
        Two paths exercise different parts of the SDK. Check the Sentry Issues
        dashboard after clicking each.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <button
          onClick={() => {
            const id = Sentry.captureException(
              new Error('Explicit captureException — Phase 3 slice 2 smoke'),
            );
            setLastEventId(id);
          }}
          style={{
            padding: '0.75rem 1rem',
            border: '1px solid #ccc',
            borderRadius: 6,
            cursor: 'pointer',
          }}
        >
          1. Explicit Sentry.captureException()
        </button>

        <button
          onClick={() => {
            throw new Error('Click-handler throw — Phase 3 slice 2 smoke');
          }}
          style={{
            padding: '0.75rem 1rem',
            border: '1px solid #ccc',
            borderRadius: 6,
            cursor: 'pointer',
          }}
        >
          2. Throw in click handler (exercises global error handler)
        </button>

        {lastEventId && (
          <p style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>
            Last event id: {lastEventId}
          </p>
        )}
      </div>
    </main>
  );
}
