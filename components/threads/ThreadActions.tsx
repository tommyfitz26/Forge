'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Archive, ArchiveRestore, Trash2 } from 'lucide-react';
import {
  archiveThread,
  restoreThread,
} from '@/app/(app)/threads/actions';
import { trashThread } from '@/app/(app)/trash/actions';

/**
 * Visible Archive + Move-to-trash controls for the thread detail page.
 * Mirrors ProjectActions; right-click context menu is still wired in
 * the threads list.
 */
export function ThreadActions({
  threadId,
  status,
}: {
  threadId: string;
  status: 'in_progress' | 'complete' | 'archived';
}) {
  const router = useRouter();
  const [showTrash, setShowTrash] = useState(false);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="forge-proj-actions">
      {status === 'archived' ? (
        <button
          type="button"
          className="forge-btn"
          disabled={isPending}
          onClick={() => startTransition(() => restoreThread(threadId))}
        >
          <ArchiveRestore size={13} /> Restore
        </button>
      ) : (
        <button
          type="button"
          className="forge-btn"
          disabled={isPending}
          onClick={() => startTransition(() => archiveThread(threadId))}
        >
          <Archive size={13} /> Archive
        </button>
      )}

      {!showTrash ? (
        <button
          type="button"
          className="forge-btn forge-btn--danger"
          disabled={isPending}
          onClick={() => setShowTrash(true)}
        >
          <Trash2 size={13} /> Move to trash
        </button>
      ) : (
        <div className="forge-confirm forge-confirm--danger">
          <span>Move thread to trash? Auto-deletes after 30 days.</span>
          <button
            type="button"
            className="forge-btn forge-btn--danger"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                await trashThread(threadId);
                router.push('/threads');
              })
            }
          >
            Yes, move to trash
          </button>
          <button
            type="button"
            className="forge-btn forge-btn--ghost"
            onClick={() => setShowTrash(false)}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
