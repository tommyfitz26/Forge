import Link from 'next/link';
import { Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { pinnedSetForOwner } from '@/lib/db/pins';
import { STREAM_KIND_IN, STREAM_MEDIA_IN } from '@/lib/capture/buckets';
import type { CaptureKind, CaptureState } from '@/lib/capture/kinds';
import { StreamRows, type StreamRowData } from './StreamRows';

const RECENT_LIMIT = 50;

export default async function StreamPage() {
  const supabase = await createClient();
  // Phase 5.6 — Stream and Library are mutually exclusive. Stream shows
  // problem/idea/observation captures whose media is note or voice (not
  // photo or web clip). Web clips, photos, and any kind=research go to
  // /library.
  const [{ data }, pinned] = await Promise.all([
    supabase
      .from('captures')
      // is_project + project_id are Phase 4.3.1 columns. Cast the result row
      // since the generated db.ts hasn't picked them up yet.
      .select('id, title, content, kind, state, created_at, is_project, project_id, media_kind')
      .neq('state', 'archived')
      .in('kind', STREAM_KIND_IN)
      .in('media_kind', STREAM_MEDIA_IN)
      .order('created_at', { ascending: false })
      .limit(RECENT_LIMIT),
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
        <StreamRows captures={captures} />
      )}
    </div>
  );
}
