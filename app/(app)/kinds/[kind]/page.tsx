import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { ScrollText } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { CAPTURE_KINDS, type CaptureKind } from '@/lib/capture/kinds';

type Params = { kind: string };

const KIND_BLURB: Record<CaptureKind, string> = {
  idea: 'startup ideas and proposed solutions',
  problem: 'frustrations and observations of what\'s broken',
  observation: 'cool noticings, not yet a problem or idea',
  research: 'questions you want the AI to chase down',
};

export default async function KindFilterPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { kind } = await params;
  if (!CAPTURE_KINDS.includes(kind as CaptureKind)) notFound();
  const k = kind as CaptureKind;

  const supabase = await createClient();
  const { data } = await supabase
    .from('captures')
    .select('id, title, content, kind, state, created_at')
    .eq('kind', k)
    .neq('state', 'archived')
    .order('created_at', { ascending: false })
    .limit(50);

  const captures = data ?? [];

  return (
    <div className="space-y-6">
      <div className="forge-page-header">
        <h1>
          <span style={{ color: 'var(--ember)' }}>#</span>
          {k}
        </h1>
        <span className="forge-page-header__meta">{KIND_BLURB[k]}</span>
      </div>

      {captures.length === 0 ? (
        <div
          className="forge-empty rounded-xl border"
          style={{ borderColor: 'var(--line)', background: 'var(--bg-2)' }}
        >
          <div className="forge-empty__msg">
            No <code style={{ fontFamily: 'var(--mono)' }}>{k}</code> captures yet.
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
                <span className="forge-tag-pill">{c.state}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function previewText(s: string | null): string {
  if (!s) return '';
  const oneLine = s.replace(/\s+/g, ' ').trim();
  return oneLine.length > 120 ? oneLine.slice(0, 120) + '…' : oneLine;
}
