'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { CaptureState } from '@/lib/capture/kinds';
import {
  promoteToSerious,
  archiveCapture,
  unarchiveCapture,
  deleteCaptureForever,
} from './actions';

export function StateControls({ id, state }: { id: string; state: CaptureState }) {
  const [isPending, startTransition] = useTransition();
  const [showArchive, setShowArchive] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  if (state === 'archived') {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          disabled={isPending}
          onClick={() => startTransition(() => unarchiveCapture(id))}
        >
          Restore
        </Button>

        {!showDelete ? (
          <Button
            variant="destructive"
            disabled={isPending}
            onClick={() => setShowDelete(true)}
          >
            Delete forever
          </Button>
        ) : (
          <div className="flex items-center gap-2 rounded-md border border-red-500/40 bg-red-500/5 p-2 text-xs">
            <span className="text-red-700 dark:text-red-400">
              This cannot be undone.
            </span>
            <Button
              size="sm"
              variant="destructive"
              disabled={isPending}
              onClick={() => startTransition(() => deleteCaptureForever(id))}
            >
              Yes, delete
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowDelete(false)}>
              Cancel
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {state !== 'serious' && (
          <Button
            variant="outline"
            disabled={isPending}
            onClick={() => startTransition(() => promoteToSerious(id))}
          >
            Promote to serious
          </Button>
        )}
        <Button
          variant="outline"
          disabled={isPending}
          onClick={() => setShowArchive((s) => !s)}
        >
          Archive
        </Button>
      </div>

      {showArchive && (
        <form
          action={(fd) => {
            fd.set('id', id);
            startTransition(async () => {
              await archiveCapture(fd);
              setShowArchive(false);
            });
          }}
          className="space-y-2 rounded-md border border-neutral-200 p-3 dark:border-neutral-800"
        >
          <label className="block text-xs font-medium">
            Why are you archiving? (optional)
          </label>
          <Textarea
            name="reason"
            rows={2}
            placeholder="Not pursuing further, duplicate of X, lost interest, …"
          />
          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? 'Archiving…' : 'Confirm archive'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setShowArchive(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
