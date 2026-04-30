import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { AlignLeft, ScrollText } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { listThreads } from '@/lib/db/threads';
import { pinnedSetForOwner } from '@/lib/db/pins';
import { PinButton } from '@/components/projects/PinButton';
import {
  ThreadContextMenuProvider,
  ThreadRow,
  type ThreadStatus,
} from '@/components/threads/ThreadContextMenu';
import { CAPTURE_KINDS, type CaptureKind } from '@/lib/capture/kinds';

type SearchParams = Promise<{ kind?: string }>;

const KIND_LABELS: Record<CaptureKind, string> = {
  idea: 'Idea',
  problem: 'Problem',
  observation: 'Observation',
  research: 'Research',
};

export default async function ThreadsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const filterKind = isCaptureKind(sp.kind) ? sp.kind : null;

  const [threads, pinned] = await Promise.all([
    listThreads({
      status: ['in_progress', 'complete'],
      ...(filterKind ? { kind: filterKind } : {}),
    }),
    pinnedSetForOwner(),
  ]);

  // Bulk-fetch the seed-capture titles so each thread row can show one.
  const captureIds = threads.map((t) => t.capture_id);
  const supabase = await createClient();
  const { data: captureRows } = captureIds.length
    ? await supabase
        .from('captures')
        .select('id, title, project_id')
        .in('id', captureIds)
    : { data: [] as Array<{ id: string; title: string; project_id: string | null }> };

  const titleByCaptureId = new Map<string, string>();
  const projectIdByCaptureId = new Map<string, string | null>();
  for (const c of captureRows ?? []) {
    titleByCaptureId.set(c.id, c.title);
    projectIdByCaptureId.set(c.id, (c as { project_id?: string | null }).project_id ?? null);
  }

  return (
    <div className="space-y-6">
      <div className="forge-page-header">
        <h1>Threads</h1>
        <span className="forge-page-header__meta">
          {threads.length === 0
            ? 'no threads yet'
            : `${threads.length} ${threads.length === 1 ? 'thread' : 'threads'}, expanding`}
        </span>
      </div>

      <div className="forge-filter-chips" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        <FilterChip active={!filterKind} href="/threads" label="All" />
        {CAPTURE_KINDS.map((k) => (
          <FilterChip
            key={k}
            active={filterKind === k}
            href={`/threads?kind=${k}`}
            label={KIND_LABELS[k]}
          />
        ))}
      </div>

      {threads.length === 0 ? (
        <div
          className="forge-empty rounded-xl border"
          style={{ borderColor: 'var(--line)', background: 'var(--bg-2)' }}
        >
          <div className="forge-empty__glyph">
            <AlignLeft size={32} className="mx-auto" />
          </div>
          <div className="forge-empty__msg">
            No threads yet. From any capture detail page, click <strong>Start thread</strong> to open the
            kind-aware canvas — five sections for ideas, four for problems, three each for observations and research.
          </div>
        </div>
      ) : (
        <ThreadContextMenuProvider>
        <div className="forge-list-card">
          {threads.map((t) => {
            const title = titleByCaptureId.get(t.capture_id) ?? '(untitled)';
            const filledSections = t.sections.filter((s) => s.body.trim().length > 0).length;
            const totalSections = t.sections.length;
            const isPinned = pinned.has(`thread:${t.id}`);
            return (
              <ThreadRow
                key={t.id}
                target={{
                  id: t.id,
                  status: t.status as ThreadStatus,
                  isPinned,
                }}
                className="forge-list-row"
                style={{ gap: 12 }}
              >
                <Link
                  href={`/threads/${t.id}`}
                  style={{
                    display: 'flex',
                    flex: 1,
                    minWidth: 0,
                    gap: 14,
                    alignItems: 'center',
                    color: 'inherit',
                    textDecoration: 'none',
                  }}
                >
                  <div className="forge-list-row__icon">
                    <ScrollText size={14} />
                  </div>
                  <div className="forge-list-row__body">
                    <div className="forge-list-row__title">{title}</div>
                    <div className="forge-list-row__preview">
                      {filledSections} of {totalSections} sections filled
                      {' · '}
                      updated {formatDistanceToNow(new Date(t.updated_at), { addSuffix: true })}
                    </div>
                  </div>
                </Link>
                <div className="forge-list-row__right" style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <span className={`forge-pill forge-pill--${t.kind}`}>{t.kind}</span>
                  <PinButton sourceKind="thread" sourceId={t.id} initiallyPinned={isPinned} />
                </div>
              </ThreadRow>
            );
          })}
        </div>
        </ThreadContextMenuProvider>
      )}
    </div>
  );
}

function FilterChip({ active, href, label }: { active: boolean; href: string; label: string }) {
  return (
    <Link
      href={href}
      style={{
        fontSize: 11.5,
        padding: '4px 10px',
        borderRadius: 999,
        border: '1px solid var(--line)',
        background: active ? 'var(--ember-soft)' : 'var(--bg-2)',
        color: active ? 'var(--ember)' : 'var(--ink-2)',
        borderColor: active ? 'var(--ember)' : 'var(--line)',
        textDecoration: 'none',
        fontFamily: 'var(--mono)',
      }}
    >
      {label}
    </Link>
  );
}

function isCaptureKind(value: string | undefined): value is CaptureKind {
  return value === 'idea' || value === 'problem' || value === 'observation' || value === 'research';
}
