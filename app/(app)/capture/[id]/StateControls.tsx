'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { ArrowUpRight, AlignLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { CaptureKind, CaptureState } from '@/lib/capture/kinds';
import { PromoteToProjectModal } from '@/components/projects/PromoteToProjectModal';
import { createThread } from '@/app/(app)/threads/actions';
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
  const [isPending, startTransition] = useTransition();
  const [showArchive, setShowArchive] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [promoteOpen, setPromoteOpen] = useState(false);

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
        {isProject && projectId ? (
          <Link
            href={`/projects/${projectId}`}
            className="forge-btn"
            style={{ textDecoration: 'none' }}
          >
            <ArrowUpRight size={14} /> Open project
          </Link>
        ) : (
          <Button
            variant="outline"
            disabled={isPending}
            onClick={() => setPromoteOpen(true)}
          >
            <ArrowUpRight className="h-4 w-4" />
            Make this a project
          </Button>
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
            <Button type="submit" variant="outline" disabled={isPending}>
              <AlignLeft className="h-4 w-4" />
              Start thread
            </Button>
          </form>
        )}
        <Button
          variant="outline"
          disabled={isPending}
          onClick={() => setShowArchive((s) => !s)}
        >
          Archive
        </Button>
      </div>

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
