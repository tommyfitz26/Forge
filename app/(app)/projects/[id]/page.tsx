import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import {
  AlignLeft,
  ArrowLeft,
  Camera,
  Clock,
  Compass,
  ExternalLink,
  Image as ImageIcon,
  Link as LinkIcon,
  ScrollText,
  Sprout,
  User,
} from 'lucide-react';
import { captureForProject, getProject } from '@/lib/db/projects';
import {
  buildProjectTimeline,
  listCollaboratorsForProject,
  listReferencesForProject,
  listThreadsForProject,
  projectTabCounts,
  type ProjectReference,
  type TimelineEvent,
} from '@/lib/db/project-detail';
import { listOpenTasksForProject, listTasksForProject } from '@/lib/db/project-tasks';
import { listPartsForProject } from '@/lib/db/project-parts';
import { gradientCssForKey, gradientKeyForKind, type CoverGradientKey } from '@/lib/types/projects';
import { ConnectionsPanel } from '@/components/links/ConnectionsPanel';
import { SuggestionsPanel } from '@/components/links/SuggestionsPanel';
import { PostSaveAutoRefresh } from '@/components/links/PostSaveAutoRefresh';
import { NextStepsPanel } from '@/components/projects/NextStepsPanel';
import { PartsList } from '@/components/projects/PartsList';
import type { CaptureKind } from '@/lib/capture/kinds';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ tab?: string }>;

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'tasks', label: 'Next steps' },
  { id: 'parts', label: 'Parts' },
  { id: 'threads', label: 'Threads' },
  { id: 'refs', label: 'References' },
  { id: 'people', label: 'Collaborators' },
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

  // Pull everything in parallel — we use most of it for the tab pill counts
  // anyway and the detail view always renders the hero.
  const [
    { seed, filed },
    threadsForProj,
    references,
    collaborators,
    timeline,
    openTasks,
    allTasks,
    parts,
    counts,
  ] = await Promise.all([
    captureForProject(id),
    listThreadsForProject(id),
    listReferencesForProject(id),
    listCollaboratorsForProject(id),
    buildProjectTimeline(id),
    listOpenTasksForProject(id, 5),
    listTasksForProject(id),
    listPartsForProject(id),
    projectTabCounts(id),
  ]);

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

  const tabCount = (id: TabId): number | null => {
    switch (id) {
      case 'tasks':
        return counts.tasks_open;
      case 'parts':
        return counts.parts;
      case 'threads':
        return counts.threads;
      case 'refs':
        return counts.refs;
      case 'people':
        return counts.people;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-2">
      <PostSaveAutoRefresh />
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
        {TABS.map((t) => {
          const ct = tabCount(t.id);
          return (
            <Link
              key={t.id}
              href={`/projects/${project.id}${t.id === 'overview' ? '' : `?tab=${t.id}`}`}
              className="forge-proj-tab"
              data-active={activeTab === t.id ? 'true' : 'false'}
            >
              {t.label}
              {ct !== null && ct > 0 && <span className="ct">{ct}</span>}
            </Link>
          );
        })}
      </nav>

      {/* ============================================================
          OVERVIEW
          ============================================================ */}
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
                Open ⌘N, pick this project from the project picker, and the capture
                lands here.
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
              <span className="forge-detail__panel-head__meta">
                {counts.tasks_open === 0 ? 'nothing open' : `${counts.tasks_open} open`}
              </span>
            </div>
            <NextStepsPanel projectId={project.id} tasks={openTasks} variant="overview" />
          </div>

          <SuggestionsPanel source={{ kind: 'project', id: project.id }} />

          <ConnectionsPanel source={{ kind: 'project', id: project.id }} />
        </div>
      )}

      {/* ============================================================
          NEXT STEPS (full tab)
          ============================================================ */}
      {activeTab === 'tasks' && (
        <div className="forge-detail__panel">
          <div className="forge-detail__panel-head">
            <h3>Next steps</h3>
            <span className="forge-detail__panel-head__meta">
              {counts.tasks_open} open · {allTasks.length - counts.tasks_open} done
            </span>
          </div>
          <NextStepsPanel projectId={project.id} tasks={allTasks} variant="tab" />
        </div>
      )}

      {/* ============================================================
          PARTS
          ============================================================ */}
      {activeTab === 'parts' && (
        <div className="forge-detail__panel">
          <PartsList
            projectId={project.id}
            partsKind={project.parts_kind}
            parts={parts}
          />
        </div>
      )}

      {/* ============================================================
          THREADS
          ============================================================ */}
      {activeTab === 'threads' && (
        <div className="forge-detail__panel">
          <div className="forge-detail__panel-head">
            <h3>Threads in project</h3>
            <span className="forge-detail__panel-head__meta">
              {threadsForProj.length === 0
                ? 'nothing yet'
                : `${threadsForProj.length} thread${threadsForProj.length === 1 ? '' : 's'}`}
            </span>
          </div>
          {threadsForProj.length === 0 ? (
            <p
              style={{
                fontFamily: 'var(--serif)',
                fontStyle: 'italic',
                color: 'var(--ink-2)',
                fontSize: 14,
                margin: 0,
              }}
            >
              Open any filed capture and click &ldquo;Start thread&rdquo; to expand it
              into a long-form working doc — it shows up here.
            </p>
          ) : (
            <div className="forge-list-card" style={{ marginTop: 4 }}>
              {threadsForProj.map((t) => (
                <Link key={t.id} href={`/threads/${t.id}`} className="forge-list-row">
                  <div className="forge-list-row__icon">
                    <AlignLeft size={14} />
                  </div>
                  <div className="forge-list-row__body">
                    <div className="forge-list-row__title">{t.capture_title}</div>
                    <div className="forge-list-row__preview">
                      updated {formatDistanceToNow(new Date(t.updated_at), { addSuffix: true })}
                    </div>
                  </div>
                  <div className="forge-list-row__right">
                    <span className={`forge-pill forge-pill--${t.kind}`}>{t.kind}</span>
                    <span
                      className="forge-pill"
                      style={{ marginLeft: 6, color: 'var(--ink-2)' }}
                    >
                      {t.status.replace('_', ' ')}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ============================================================
          REFERENCES
          ============================================================ */}
      {activeTab === 'refs' && (
        <div className="forge-detail__panel">
          <div className="forge-detail__panel-head">
            <h3>References</h3>
            <span className="forge-detail__panel-head__meta">
              filed photos, clips, and research
            </span>
          </div>
          {references.length === 0 ? (
            <p
              style={{
                fontFamily: 'var(--serif)',
                fontStyle: 'italic',
                color: 'var(--ink-2)',
                fontSize: 14,
                margin: 0,
              }}
            >
              Anything filed here as a Web clip, photo, or research capture
              shows up as a reference. Use the project picker in the capture
              modal to file directly.
            </p>
          ) : (
            <div className="forge-list-card" style={{ marginTop: 4 }}>
              {references.map((r) => (
                <ReferenceRow key={r.id} ref_={r} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ============================================================
          COLLABORATORS
          ============================================================ */}
      {activeTab === 'people' && (
        <div className="forge-detail__panel">
          <div className="forge-detail__panel-head">
            <h3>Collaborators</h3>
            <span className="forge-detail__panel-head__meta">
              people, places, and things mentioned in this project
            </span>
          </div>
          {collaborators.length === 0 ? (
            <p
              style={{
                fontFamily: 'var(--serif)',
                fontStyle: 'italic',
                color: 'var(--ink-2)',
                fontSize: 14,
                margin: 0,
              }}
            >
              Once a capture filed here mentions a person, place, or product
              by name, the classifier extracts them and they appear here.
            </p>
          ) : (
            <ul className="forge-collab-list">
              {collaborators.map((c) => (
                <li key={c.entity_id}>
                  <Link href={`/atlas/${c.entity_id}`} className="forge-collab-row">
                    <div className="forge-collab-row__ico">
                      {c.kind === 'person' ? <User size={14} /> : <Compass size={14} />}
                    </div>
                    <div className="forge-collab-row__body">
                      <div className="forge-collab-row__name">{c.name}</div>
                      <div className="forge-collab-row__sub">
                        {c.kind} · mentioned in {c.mention_count} capture
                        {c.mention_count === 1 ? '' : 's'} here
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ============================================================
          TIMELINE
          ============================================================ */}
      {activeTab === 'timeline' && (
        <div className="forge-detail__panel">
          <div className="forge-detail__panel-head">
            <h3>Timeline</h3>
            <span className="forge-detail__panel-head__meta">
              recent project events
            </span>
          </div>
          {timeline.length === 0 ? (
            <p
              style={{
                fontFamily: 'var(--serif)',
                fontStyle: 'italic',
                color: 'var(--ink-2)',
                fontSize: 14,
                margin: 0,
              }}
            >
              Nothing has happened in this project yet. Capture and file a
              thought to start the timeline.
            </p>
          ) : (
            <ol className="forge-timeline">
              {timeline.map((e, i) => (
                <li key={`${e.kind}-${i}-${e.at}`} className="forge-timeline__row">
                  <span className="forge-timeline__dot" data-kind={e.kind} />
                  <div className="forge-timeline__body">
                    <TimelineEntry e={e} />
                    <div className="forge-timeline__when">
                      {formatDistanceToNow(new Date(e.at), { addSuffix: true })}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
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

function ReferenceRow({ ref_ }: { ref_: ProjectReference }) {
  const Icon =
    ref_.shelf === 'visual' ? Camera : ref_.shelf === 'audio' ? ImageIcon : LinkIcon;
  const shelfLabel =
    ref_.shelf === 'visual' ? 'Visual' : ref_.shelf === 'audio' ? 'Audio' : 'Text';
  return (
    <Link href={`/capture/${ref_.id}`} className="forge-list-row">
      <div className="forge-list-row__icon">
        <Icon size={14} />
      </div>
      <div className="forge-list-row__body">
        <div className="forge-list-row__title">{ref_.title}</div>
        <div className="forge-list-row__preview">
          {ref_.source_url ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <ExternalLink size={10} />
              {hostnameFor(ref_.source_url)}
            </span>
          ) : (
            formatDistanceToNow(new Date(ref_.created_at), { addSuffix: true })
          )}
        </div>
      </div>
      <div className="forge-list-row__right">
        <span className="forge-pill" style={{ color: 'var(--ink-2)' }}>{shelfLabel}</span>
      </div>
    </Link>
  );
}

function hostnameFor(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function TimelineEntry({ e }: { e: TimelineEvent }) {
  switch (e.kind) {
    case 'project_opened':
      return (
        <div>
          <strong>Project opened</strong> · {e.title}
        </div>
      );
    case 'project_status':
      return (
        <div>
          Status changed to <strong>{e.status}</strong>
        </div>
      );
    case 'capture_filed':
      return (
        <div>
          {e.seed ? (
            <>
              <Sprout size={11} style={{ display: 'inline', marginRight: 4, color: 'var(--ember)' }} />
              <strong>Seed capture</strong>:{' '}
            </>
          ) : (
            <>Filed capture: </>
          )}
          <Link href={`/capture/${e.capture_id}`} className="forge-timeline__link">
            {e.capture_title}
          </Link>
          <span style={{ color: 'var(--ink-3)', fontSize: 11, marginLeft: 6 }}>
            #{e.capture_kind}
          </span>
        </div>
      );
    case 'thread_created':
      return (
        <div>
          Thread started:{' '}
          <Link href={`/threads/${e.thread_id}`} className="forge-timeline__link">
            {e.capture_title}
          </Link>
        </div>
      );
    case 'thread_saved':
      return (
        <div>
          <Clock size={11} style={{ display: 'inline', marginRight: 4, color: 'var(--ink-3)' }} />
          Thread updated:{' '}
          <Link href={`/threads/${e.thread_id}`} className="forge-timeline__link">
            {e.capture_title}
          </Link>
        </div>
      );
  }
}
