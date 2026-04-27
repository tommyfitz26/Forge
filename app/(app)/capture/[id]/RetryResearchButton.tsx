'use client';

import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
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
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          await retryResearch(captureId);
        });
      }}
    >
      {pending ? 'Queuing…' : label}
    </Button>
  );
}
