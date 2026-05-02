'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { createTextCapture } from './actions';

export function TextCapture({ projectId }: { projectId?: string | null }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createTextCapture(formData);
      if (!result.ok) {
        setError(result.error);
      }
      // On success the server action redirects — we don't hit this line.
    });
  }

  return (
    <form action={onSubmit} className="space-y-4">
      <Textarea
        name="content"
        required
        autoFocus
        rows={8}
        placeholder={'Type a capture. Start with "idea:", "problem:", "observation:", or "research:" to skip classification.'}
      />
      {projectId && <input type="hidden" name="project_id" value={projectId} />}

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="flex items-center justify-end gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Saving…' : 'Save capture'}
        </Button>
      </div>
    </form>
  );
}
