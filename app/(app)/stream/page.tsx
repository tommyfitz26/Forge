import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { Plus, ScrollText } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import type { CaptureKind, CaptureState } from '@/lib/capture/kinds';

const RECENT_LIMIT = 50;

type CaptureRow = {
  id: string;
  title: string;
  content: string;
  kind: CaptureKind;
  state: CaptureState;
  created_at: string;
};

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

export default async function StreamPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from('captures')
    .select('id, title, content, kind, state, created_at')
    .neq('state', 'archived')
    .order('created_at', { ascending: false })
    .limit(RECENT_LIMIT);

  const captures = (data ?? []) as CaptureRow[];

  return (
    <div className="space-y-6">
      <div className="forge-page-header">
        <h1>Stream</h1>
        <span className="forge-page-header__meta">
          {captures.length === 0
            ? 'nothing captured yet'
            : `${captures.length} unsorted`}
        </span>
        <div className="forge-page-header__actions">
          <Link href="/capture" className="forge-btn forge-btn--primary">
            <Plus size={14} /> Capture
          </Link>
        </div>
      </div>

      {captures.length === 0 ? (
        <div
          className="forge-empty rounded-xl border"
          style={{ borderColor: 'var(--line)', background: 'var(--bg-2)' }}
        >
          <div className="forge-empty__glyph">⌖</div>
          <div className="forge-empty__msg">
            Nothing in the stream yet. Capture something — voice, text, photo, or a web clip — and it lands here.
          </div>
          <div className="mt-4">
            <Link href="/capture" className="forge-btn forge-btn--primary">
              <Plus size={14} /> Start capturing
            </Link>
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
                <div className="forge-list-row__preview">{previewText(c.content)}</div>
              </div>
              <div className="forge-list-row__right">
                <span className="forge-list-row__when">
                  {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                </span>
                <span className={kindPillClass(c.kind)}>#{c.kind}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function previewText(s: string): string {
  if (!s) return '';
  const oneLine = s.replace(/\s+/g, ' ').trim();
  return oneLine.length > 120 ? oneLine.slice(0, 120) + '…' : oneLine;
}
