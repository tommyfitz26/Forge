'use client';

import { useTransition } from 'react';
import { retryResearch } from './actions';

export function RetryResearchButton({
  captureId,
  label,
}: {
  captureId: string;
  label: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      className="forge-btn"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          await retryResearch(captureId);
        });
      }}
    >
      {pending ? 'Queuing…' : label}
    </button>
  );
}
