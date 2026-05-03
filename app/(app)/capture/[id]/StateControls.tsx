'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowUpRight, AlignLeft, Trash2 } from 'lucide-react';
import type { CaptureKind, CaptureState } from '@/lib/capture/kinds';
import { PromoteToProjectModal } from '@/components/projects/PromoteToProjectModal';
import { createThread } from '@/app/(app)/threads/actions';
import { trashCapture } from '@/app/(app)/trash/actions';
import {
  archiveCapture,
  unarchiveCapture,
  deleteCaptureForever,
} from './actions';

// Phase 4.3.2 — "Make this a project" button. Idempotent: if the capture is
// already a project, the button becomes a link to the existing project.
// Phase 4.3.3 — "Start thread" / "Open thread" button.

export function StateControls({
  id,
  state,
  kind,
  title,
  isProject,
  projectId,
  threadId,
}: {
  id: string;
  state: CaptureState;
  kind: CaptureKind;
  title: string;
  isProject: boolean;
  projectId: string | null;
  threadId: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showArchive, setShowArchive] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [promoteOpen, setPromoteOpen] = useState(false);

  if (state === 'archived') {
    return (
      <div className="forge-state-row">
        <button
          type="button"
          className="forge-btn"
          disabled={isPending}
          onClick={() => startTransition(() => unarchiveCapture(id))}
        >
          Restore
        </button>

        {!showDelete ? (
          <button
            type="button"
            className="forge-btn forge-btn--danger"
            disabled={isPending}
            onClick={() => setShowDelete(true)}
          >
            Delete forever
          </button>
        ) : (
          <div className="forge-confirm forge-confirm--danger">
            <span>This cannot be undone.</span>
            <button
              type="button"
              className="forge-btn forge-btn--danger"
              disabled={isPending}
              onClick={() => startTransition(() => deleteCaptureForever(id))}
            >
              Yes, delete
            </button>
            <button
              type="button"
              className="forge-btn forge-btn--ghost"
              onClick={() => setShowDelete(false)}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="forge-state-controls">
      <div className="forge-state-row">
        {isProject && projectId ? (
          <Link
            href={`/projects/${projectId}`}
            className="forge-btn"
            style={{ textDecoration: 'none' }}
          >
            <ArrowUpRight size={14} /> Open project
          </Link>
        ) : (
          <button
            type="button"
            className="forge-btn"
            disabled={isPending}
            onClick={() => setPromoteOpen(true)}
          >
            <ArrowUpRight size={14} />
            Make this a project
          </button>
        )}
        {threadId ? (
          <Link
            href={`/threads/${threadId}`}
            className="forge-btn"
            style={{ textDecoration: 'none' }}
          >
            <AlignLeft size={14} /> Open thread
          </Link>
        ) : (
          <form
            action={(fd) => {
              fd.set('capture_id', id);
              startTransition(async () => {
                await createThread(fd);
              });
            }}
          >
            <button type="submit" className="forge-btn" disabled={isPending}>
              <AlignLeft size={14} />
              Start thread
            </button>
          </form>
        )}
        <button
          type="button"
          className="forge-btn"
          disabled={isPending}
          onClick={() => setShowArchive((s) => !s)}
        >
          Archive
        </button>
        <button
          type="button"
          className="forge-btn forge-btn--danger"
          disabled={isPending}
          onClick={() => setShowTrash((s) => !s)}
        >
          <Trash2 size={14} /> Move to trash
        </button>
      </div>

      {showTrash && (
        <div className="forge-confirm forge-confirm--danger">
          <span>
            Move this capture to trash? It auto-deletes after 30 days; you can
            restore it from /trash before then.
          </span>
          <button
            type="button"
            className="forge-btn forge-btn--danger"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                await trashCapture(id);
                router.push('/stream');
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

      <PromoteToProjectModal
        open={promoteOpen}
        onClose={() => setPromoteOpen(false)}
        capture={{ id, title, kind }}
      />

      {showArchive && (
        <form
          action={(fd) => {
            fd.set('id', id);
            startTransition(async () => {
              await archiveCapture(fd);
              setShowArchive(false);
            });
          }}
          className="forge-archive-form"
        >
          <label className="forge-archive-form__label">
            Why are you archiving? (optional)
          </label>
          <textarea
            name="reason"
            rows={2}
            placeholder="Not pursuing further, duplicate of X, lost interest, …"
            className="forge-archive-form__textarea"
          />
          <div className="forge-state-row">
            <button
              type="submit"
              className="forge-btn forge-btn--primary"
              disabled={isPending}
            >
              {isPending ? 'Archiving…' : 'Confirm archive'}
            </button>
            <button
              type="button"
              className="forge-btn forge-btn--ghost"
              onClick={() => setShowArchive(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
