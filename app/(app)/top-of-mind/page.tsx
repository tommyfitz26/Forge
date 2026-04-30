import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { Bookmark } from 'lucide-react';
import { listPinnedCards } from '@/lib/db/pins';
import { PinButton } from '@/components/projects/PinButton';
import {
  PinnedCardContextMenuProvider,
  PinnedCardRow,
} from '@/components/pins/PinnedCardContextMenu';
import type { CaptureKind } from '@/lib/capture/kinds';

const KIND_LABEL: Record<string, string> = {
  capture: 'Capture',
  project: 'Project',
  thread: 'Thread',
  journal_entry: 'Journal entry',
};

export default async function TopOfMindPage() {
  const cards = await listPinnedCards();

  return (
    <div className="space-y-6">
      <div className="forge-page-header">
        <h1>Top of mind</h1>
        <span className="forge-page-header__meta">
          {cards.length === 0
            ? 'nothing pinned yet'
            : `${cards.length} ${cards.length === 1 ? 'item' : 'items'} pinned`}
        </span>
      </div>

      {cards.length === 0 ? (
        <div
          className="forge-empty rounded-xl border"
          style={{ borderColor: 'var(--line)', background: 'var(--bg-2)' }}
        >
          <div className="forge-empty__glyph">
            <Bookmark size={32} className="mx-auto" />
          </div>
          <div className="forge-empty__msg">
            Nothing pinned yet. Use the bookmark icon on any capture, project, thread, or journal
            entry to pin it here.
          </div>
        </div>
      ) : (
        <PinnedCardContextMenuProvider>
          <div className="forge-pinned-grid">
            {cards.map((c) => (
              <PinnedCardRow
                key={`${c.source_kind}:${c.source_id}`}
                target={{
                  sourceKind: c.source_kind,
                  sourceId: c.source_id,
                  href: c.href,
                }}
                className="forge-pin-card"
              >
                <Link href={c.href} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span className="forge-pin-card__kind">{KIND_LABEL[c.source_kind] ?? c.source_kind}</span>
                  <h3 className="forge-pin-card__title">{c.title}</h3>
                  {c.preview && <div className="forge-pin-card__preview">{c.preview}</div>}
                </Link>
                <div className="forge-pin-card__pinned-at">
                  <span>pinned {formatDistanceToNow(new Date(c.pinned_at), { addSuffix: true })}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {c.kind && <span className={`forge-pill forge-pill--${c.kind as CaptureKind}`}>{c.kind}</span>}
                    <PinButton
                      sourceKind={c.source_kind}
                      sourceId={c.source_id}
                      initiallyPinned={true}
                    />
                  </span>
                </div>
              </PinnedCardRow>
            ))}
          </div>
        </PinnedCardContextMenuProvider>
      )}
    </div>
  );
}
