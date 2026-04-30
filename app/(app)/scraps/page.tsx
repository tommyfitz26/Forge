import Link from 'next/link';
import { Plus, ScrollText } from 'lucide-react';
import { listScraps } from '@/lib/db/scraps';
import { pinnedSetForOwner } from '@/lib/db/pins';
import { StreamRows, type StreamRowData } from '../stream/StreamRows';

export default async function ScrapsPage() {
  const [scraps, pinned] = await Promise.all([listScraps(), pinnedSetForOwner()]);

  const rows: StreamRowData[] = scraps.map((s) => ({
    id: s.id,
    title: s.title,
    content: s.content,
    kind: s.kind,
    state: s.state,
    created_at: s.created_at,
    is_project: s.is_project,
    project_id: s.project_id,
    is_pinned: pinned.has(`capture:${s.id}`),
  }));

  return (
    <div className="space-y-6">
      <div className="forge-page-header">
        <h1>Scraps</h1>
        <span className="forge-page-header__meta">
          {rows.length === 0
            ? 'no fragments waiting'
            : rows.length === 1
              ? '1 fragment'
              : `${rows.length} fragments`}
        </span>
        <div className="forge-page-header__actions">
          <Link href="/capture" className="forge-btn">
            <Plus size={14} /> Capture
          </Link>
        </div>
      </div>

      {rows.length === 0 ? (
        <div
          className="forge-empty rounded-xl border"
          style={{ borderColor: 'var(--line)', background: 'var(--bg-2)' }}
        >
          <div className="forge-empty__glyph">
            <ScrollText size={32} className="mx-auto" />
          </div>
          <div className="forge-empty__msg">
            Half-formed things, low pressure. Captures still in <code style={{ fontFamily: 'var(--mono)' }}>raw</code>{' '}
            state and not yet anchored to a project show here.
          </div>
        </div>
      ) : (
        <StreamRows captures={rows} />
      )}
    </div>
  );
}
