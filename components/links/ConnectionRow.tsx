'use client';

import { useTransition } from 'react';
import { X } from 'lucide-react';
import { deleteLink } from '@/app/(app)/links/actions';

/**
 * The unlink button next to each connection row. Client island so it can
 * call deleteLink + revalidate. No confirm — manual links are cheap to
 * recreate and AI inferences will resurface on the next save.
 */
export function ConnectionRow({ id }: { id: string }) {
  const [isPending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className="forge-connections__unlink"
      onClick={() => startTransition(async () => deleteLink(id))}
      disabled={isPending}
      aria-label="Remove this link"
      title="Remove this link"
    >
      <X size={11} />
    </button>
  );
}
