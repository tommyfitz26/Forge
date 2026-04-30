import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { ScrollText, Archive as ArchiveIcon } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import type { CaptureKind } from '@/lib/capture/kinds';

function kindPillClass(kind: CaptureKind): string {
  switch (kind) {
    case 'idea':
      return 'forge-tag-pill';
    case 'problem':
      return 'forge-tag-pill forge-tag-pill--plum';
    case 'observation':
      return 'forge-tag-pill forge-tag-pill--sky';
    case 'research':
      return 'forge-tag-pill forge-tag-pill--gold';
  }
}

export default async function ArchivePage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from('captures')
    .select('id, title, kind, created_at, archive_reason')
    .eq('state', 'archived')
    .order('created_at', { ascending: false });

  const captures = data ?? [];

  return (
    <div className="space-y-6">
      <div className="forge-page-header">
        <h1>Archive</h1>
        <span className="forge-page-header__meta">inactive but kept</span>
      </div>

      {captures.length === 0 ? (
        <div
          className="forge-empty rounded-xl border"
          style={{ borderColor: 'var(--line)', background: 'var(--bg-2)' }}
        >
          <div className="forge-empty__glyph">
            <ArchiveIcon size={32} className="mx-auto" />
          </div>
          <div className="forge-empty__msg">
            Archive is empty. Restore or delete forever from any capture&apos;s detail page.
          </div>
        </div>
      ) : (
        <div className="forge-list-card">
          {captures.map((c) => (
            <Link key={c.id} href={`/capture/${c.id}`} className="forge-list-row">
              <div className="forge-list-row__icon">
                <ScrollText size={14} />
              </div>
              <div className="forge-list-row__body">
                <div className="forge-list-row__title">{c.title}</div>
                <div className="forge-list-row__preview">
                  {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                  {c.archive_reason && ` · ${c.archive_reason}`}
                </div>
              </div>
              <div className="forge-list-row__right">
                <span className={kindPillClass(c.kind as CaptureKind)}>#{c.kind}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
