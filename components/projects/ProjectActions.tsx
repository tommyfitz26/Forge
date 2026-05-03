'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Archive, ArchiveRestore, Trash2 } from 'lucide-react';
import {
  archiveProject,
  restoreProject,
} from '@/app/(app)/workshop/actions';
import { trashProject } from '@/app/(app)/trash/actions';
import type { ProjectStatus } from '@/lib/types/projects';

/**
 * Visible Archive + Move-to-trash controls for the project detail hero.
 * Right-click context-menu options (ProjectContextMenu) still work in
 * Workshop, but the user shouldn't have to know about them.
 */
export function ProjectActions({
  projectId,
  status,
}: {
  projectId: string;
  status: ProjectStatus;
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
          onClick={() => startTransition(() => restoreProject(projectId))}
        >
          <ArchiveRestore size={13} /> Restore
        </button>
      ) : (
        <button
          type="button"
          className="forge-btn"
          disabled={isPending}
          onClick={() => startTransition(() => archiveProject(projectId))}
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
          <span>
            Move project to trash? Auto-deletes after 30 days.
          </span>
          <button
            type="button"
            className="forge-btn forge-btn--danger"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                await trashProject(projectId);
                router.push('/workshop');
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
