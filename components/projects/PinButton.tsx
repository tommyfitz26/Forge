'use client';

import { useState, useTransition } from 'react';
import { Bookmark, BookmarkCheck } from 'lucide-react';
import { togglePin } from '@/app/(app)/top-of-mind/actions';
import type { PinSourceKind } from '@/lib/types/pins';

/**
 * Toggleable pin button — flips between pinned / unpinned. Optimistic-update
 * pattern: flips local state immediately, server-action confirms.
 */
export function PinButton({
  sourceKind,
  sourceId,
  initiallyPinned,
  size = 14,
  className,
}: {
  sourceKind: PinSourceKind;
  sourceId: string;
  initiallyPinned: boolean;
  size?: number;
  className?: string;
}) {
  const [pinned, setPinned] = useState(initiallyPinned);
  const [isPending, startTransition] = useTransition();

  function handle(e: React.MouseEvent | React.KeyboardEvent) {
    e.preventDefault();
    e.stopPropagation();
    const fd = new FormData();
    fd.set('source_kind', sourceKind);
    fd.set('source_id', sourceId);
    // Optimistic flip.
    setPinned((prev) => !prev);
    startTransition(async () => {
      const res = await togglePin(fd);
      if (res.ok) {
        setPinned(res.pinned);
      } else {
        // Revert on failure.
        setPinned(initiallyPinned);
      }
    });
  }

  const Icon = pinned ? BookmarkCheck : Bookmark;
  return (
    <button
      type="button"
      onClick={handle}
      data-pinned={pinned ? 'true' : 'false'}
      aria-label={pinned ? 'Unpin from Top of mind' : 'Pin to Top of mind'}
      title={pinned ? 'Pinned · click to unpin' : 'Pin to Top of mind'}
      disabled={isPending}
      className={`forge-pin-btn ${className ?? ''}`}
    >
      <Icon size={size} />
    </button>
  );
}
