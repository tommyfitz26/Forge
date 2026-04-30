'use client';

import { useState, useTransition } from 'react';
import { Trash2 } from 'lucide-react';
import { deleteJournalEntry } from '@/app/(app)/journal/actions';

/**
 * Soft-delete a journal entry (sets `deleted_at`). The entry then shows up
 * in /trash with restore + delete-forever buttons. Two-click confirm here
 * because the action is destructive (even though reversible for 30 days).
 */
export function DeleteEntryButton({ id }: { id: string }) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <button
        type="button"
        className="forge-pin-btn"
        onClick={() => setConfirming(true)}
        aria-label="Delete entry"
        title="Delete entry"
        disabled={isPending}
      >
        <Trash2 size={14} />
      </button>
    );
  }

  return (
    <span className="forge-journal-entry__confirm">
      <span>Delete?</span>
      <button
        type="button"
        className="forge-btn forge-btn--danger"
        onClick={() =>
          startTransition(async () => {
            await deleteJournalEntry(id);
          })
        }
        disabled={isPending}
      >
        {isPending ? 'Deleting…' : 'Yes'}
      </button>
      <button
        type="button"
        className="forge-btn forge-btn--ghost"
        onClick={() => setConfirming(false)}
        disabled={isPending}
      >
        Cancel
      </button>
    </span>
  );
}
