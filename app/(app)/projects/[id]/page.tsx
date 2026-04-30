import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { ArrowLeft, ScrollText, Sprout } from 'lucide-react';
import { captureForProject, getProject } from '@/lib/db/projects';
import { gradientCssForKey, gradientKeyForKind, type CoverGradientKey } from '@/lib/types/projects';
import type { CaptureKind } from '@/lib/capture/kinds';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ tab?: string }>;

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'parts', label: 'Parts', ct: '0' },
  { id: 'threads', label: 'Threads', ct: '0' },
  { id: 'refs', label: 'References', ct: '0' },
  { id: 'people', label: 'Collaborators', ct: '0' },
  { id: 'timeline', label: 'Timeline' },
] as const;

type TabId = (typeof TABS)[number]['id'];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ProjectDetail({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const sp = await searchParams;
  const activeTab: TabId = isTabId(sp.tab) ? sp.tab : 'overview';

  const project = await getProject(id);
  if (!project) notFound();

  // Phase 4.3.2: pull seed + filed captures so the Overview tab can show
  // what's actually anchored to this project.
  const { seed, filed } = await captureForProject(id);
  // The seed appears in the seed-capture card; don't double-list it.
  const filedExcludingSeed = filed.filter((c) => c.id !== seed?.id);

  const gradient: CoverGradientKey =
    (project.cover_gradient_key ?? gradientKeyForKind(project.kind_seed)) as CoverGradientKey;
  const stageLabel =
    project.status === 'active'
      ? project.stage ?? 'Active'
      : project.status === 'wrapped'
        ? 'Wrapped'
        : project.status === 'paused'
          ? 'Paused'
          : 'Archived';

  return (
    <div className="space-y-2">
      <Link href="/workshop" className="forge-detail__back">
        <ArrowLeft size={12} />
        Workshop
      </Link>

      {/* Hero */}
      <div className="forge-proj-hero">
        <div className="forge-proj-hero__cover" style={{ background: gradientCssForKey(gradient) }}>
          <span className="forge-proj-hero__stage-pill">{stageLabel}</span>
        </div>
        <div className="forge-proj-hero__meta">
          <h1>
            {project.title}
            <span className="id">PROJ · {project.id.slice(0, 8)}</span>
          </h1>
          {project.deck && <div className="forge-proj-hero__deck">{project.deck}</div>}
          <div className="forge-proj-hero__stats">
            <div className="forge-proj-hero__stat">
              <span className="num">{project.parts_kind}</span>
              parts label
            </div>
            <div className="forge-proj-hero__stat">
              <span className="num">{project.kind_seed ?? '—'}</span>
              kind seed
            </div>
            <div className="forge-proj-hero__stat">
              <span className="num">{progressLabel(project.progress_pct)}</span>
              progress
            </div>
            <div className="forge-proj-hero__stat">
              <span className="num">{new Date(project.opened_at).toLocaleDateString()}</span>
              opened
            </div>
            {project.target_at && (
              <div className="forge-proj-hero__stat">
                <span className="num">{new Date(project.target_at).toLocaleDateString()}</span>
                target
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <nav className="forge-proj-tabs" aria-label="Project sections">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={`/projects/${project.id}${t.id === 'overview' ? '' : `?tab=${t.id}`}`}
            className="forge-proj-tab"
            data-active={activeTab === t.id ? 'true' : 'false'}
          >
            {t.label}
            {'ct' in t && t.ct !== undefined && <span className="ct">{t.ct}</span>}
          </Link>
        ))}
      </nav>

      {/* Tab content */}
      {activeTab === 'overview' && (
        <div className="space-y-5">
          <p
            className="forge-detail__content"
            style={{
              fontStyle: project.deck ? 'normal' : 'italic',
              color: project.deck ? 'var(--ink-1)' : 'var(--ink-2)',
            }}
          >
            {project.deck ?? `A new project. Open the capture composer (⌘N) to start filing thoughts here.`}
          </p>

          {seed && (
            <div className="forge-detail__panel">
              <div className="forge-detail__panel-head">
                <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Sprout size={16} style={{ color: 'var(--ember)' }} />
                  Seed capture
                </h3>
                <span className="forge-detail__panel-head__meta">
                  the thought this project grew from
                </span>
              </div>
              <Link href={`/capture/${seed.id}`} className="forge-list-row" style={{ borderRadius: 8 }}>
                <div className="forge-list-row__icon">
                  <ScrollText size={14} />
                </div>
                <div className="forge-list-row__body">
                  <div className="forge-list-row__title">{seed.title}</div>
                  <div className="forge-list-row__preview">
                    captured {formatDistanceToNow(new Date(seed.created_at), { addSuffix: true })}
                  </div>
                </div>
                <div className="forge-list-row__right">
                  <span className={`forge-pill forge-pill--${seed.kind as CaptureKind}`}>{seed.kind}</span>
                </div>
              </Link>
            </div>
          )}

          <div className="forge-detail__panel">
            <div className="forge-detail__panel-head">
              <h3>Filed captures</h3>
              <span className="forge-detail__panel-head__meta">
                {filedExcludingSeed.length === 0
                  ? 'nothing filed yet'
                  : `${filedExcludingSeed.length} captures`}
              </span>
            </div>
            {filedExcludingSeed.length === 0 ? (
              <p
                style={{
                  fontFamily: 'var(--serif)',
                  fontStyle: 'italic',
                  color: 'var(--ink-2)',
                  fontSize: 14,
                  margin: 0,
                }}
              >
                Right-click any capture in Stream → &ldquo;Make this a project&rdquo; to seed it; or capture
                from this page (⌘N) to file directly here. Project filing at capture time wires up in 4.3.4.
              </p>
            ) : (
              <div className="forge-list-card" style={{ marginTop: 4 }}>
                {filedExcludingSeed.map((c) => (
                  <Link key={c.id} href={`/capture/${c.id}`} className="forge-list-row">
                    <div className="forge-list-row__icon">
                      <ScrollText size={14} />
                    </div>
                    <div className="forge-list-row__body">
                      <div className="forge-list-row__title">{c.title}</div>
                      <div className="forge-list-row__preview">
                        {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                      </div>
                    </div>
                    <div className="forge-list-row__right">
                      <span className={`forge-pill forge-pill--${c.kind as CaptureKind}`}>{c.kind}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="forge-detail__panel">
            <div className="forge-detail__panel-head">
              <h3>Next steps</h3>
              <span className="forge-detail__panel-head__meta">phase 4.3.5</span>
            </div>
            <p style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', color: 'var(--ink-2)', fontSize: 14, margin: 0 }}>
              Tasks land when intentions + per-project task lists arrive in 4.3.5.
            </p>
          </div>
        </div>
      )}

      {activeTab !== 'overview' && (
        <div
          className="forge-empty rounded-xl border"
          style={{ borderColor: 'var(--line)', background: 'var(--bg-2)' }}
        >
          <div className="forge-empty__msg">
            {tabPlaceholder(activeTab)}
          </div>
        </div>
      )}
    </div>
  );
}

function isTabId(value: string | undefined): value is TabId {
  return TABS.some((t) => t.id === value);
}

function progressLabel(pct: number | null): string {
  if (pct == null) return '—';
  return `${Math.round(pct)}%`;
}

function tabPlaceholder(tab: Exclude<TabId, 'overview'>): string {
  switch (tab) {
    case 'parts':
      return `The "${'parts'}" list — generic per-project label. Ships in Phase 4.3.5 alongside intentions and tasks.`;
    case 'threads':
      return 'Project-anchored threads. Land in Phase 4.3.3.';
    case 'refs':
      return 'References saved against this project. Land in Phase 5 (Library wave).';
    case 'people':
      return 'Collaborators (Atlas entities). Land in Phase 5 (Atlas wave).';
    case 'timeline':
      return 'Project events over time (created, captures filed, milestones, archive). Land in Phase 4.3.5.';
  }
}
