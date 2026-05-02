'use client';

import { useState, useTransition } from 'react';
import { createWebClipCapture } from '@/app/(app)/capture/actions';

export function WebClipCapture({ projectId }: { projectId?: string | null }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createWebClipCapture(formData);
      if (!result.ok) {
        setError(result.error);
      }
      // On success the server action redirects.
    });
  }

  return (
    <form action={onSubmit} className="space-y-4">
      <div>
        <label htmlFor="clip-url">URL</label>
        <input
          id="clip-url"
          name="url"
          type="url"
          required
          autoFocus
          placeholder="https://"
          autoComplete="off"
        />
      </div>
      <div>
        <label htmlFor="clip-note">Note (optional)</label>
        <textarea
          id="clip-note"
          name="note"
          rows={4}
          placeholder="What made you save this?"
        />
      </div>

      {error && (
        <p style={{ color: 'var(--hot)', fontSize: 13 }}>{error}</p>
      )}

      {projectId && <input type="hidden" name="project_id" value={projectId} />}

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button type="submit" disabled={isPending}>
          {isPending ? 'Saving…' : 'Save clip'}
        </button>
      </div>
    </form>
  );
}
