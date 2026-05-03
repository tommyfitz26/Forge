import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { pinnedSetForOwner } from '@/lib/db/pins';
import { CAPTURE_KINDS, type CaptureKind, type CaptureState } from '@/lib/capture/kinds';
import { StreamRows, type StreamRowData } from '../../stream/StreamRows';

type Params = { kind: string };

const KIND_BLURB: Record<CaptureKind, string> = {
  idea: 'startup ideas and proposed solutions',
  problem: "frustrations and observations of what's broken",
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
  const [{ data }, pinned] = await Promise.all([
    supabase
      .from('captures')
      // is_project + project_id are 4.3.1 columns; the auto-generated db.ts
      // hasn't picked them up yet so the row is cast at the use site.
      .select('id, title, content, kind, state, created_at, is_project, project_id')
      .eq('kind', k)
      .neq('state', 'archived')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(50),
    pinnedSetForOwner(),
  ]);

  const captures: StreamRowData[] = (data ?? []).map((c) => {
    const row = c as typeof c & { is_project?: boolean; project_id?: string | null };
    return {
      id: row.id,
      title: row.title,
      content: row.content ?? '',
      kind: row.kind as CaptureKind,
      state: row.state as CaptureState,
      created_at: row.created_at,
      is_project: Boolean(row.is_project),
      project_id: row.project_id ?? null,
      is_pinned: pinned.has(`capture:${row.id}`),
    };
  });

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
        <StreamRows captures={captures} />
      )}
    </div>
  );
}
