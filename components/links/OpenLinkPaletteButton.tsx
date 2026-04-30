'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { LinkPalette } from './LinkPalette';
import type { LinkSourceKind } from '@/lib/types/links';

/**
 * The "+ Link" button at the top of the Connections panel. Opens the
 * LinkPalette modal scoped to this detail page's anchor item.
 */
export function OpenLinkPaletteButton({
  source,
}: {
  source: { kind: LinkSourceKind; id: string };
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="forge-btn"
        onClick={() => setOpen(true)}
      >
        <Plus size={13} /> Link
      </button>
      <LinkPalette open={open} onClose={() => setOpen(false)} source={source} />
    </>
  );
}
