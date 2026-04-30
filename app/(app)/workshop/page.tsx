import Link from 'next/link';
import { Hammer } from 'lucide-react';
import { listProjects } from '@/lib/db/projects';
import { pinnedSetForOwner } from '@/lib/db/pins';
import { gradientKeyForKind, type CoverGradientKey } from '@/lib/types/projects';
import { ProjectCover } from '@/components/projects/ProjectCover';
import { NewProjectButton } from '@/components/projects/WorkshopHeader';
import { PinButton } from '@/components/projects/PinButton';
import {
  ProjectContextMenuProvider,
  ProjectRow,
} from '@/components/projects/ProjectContextMenu';

export default async function WorkshopPage() {
  const [projects, pinned] = await Promise.all([listProjects({}), pinnedSetForOwner()]);

  return (
    <div className="space-y-6">
      <div className="forge-page-header">
        <h1>Workshop</h1>
        <span className="forge-page-header__meta">
          {projects.length === 0
            ? 'no projects yet'
            : `${projects.length} ${projects.length === 1 ? 'project' : 'projects'}, on the bench`}
        </span>
        <div className="forge-page-header__actions">
          <NewProjectButton />
        </div>
      </div>

      {projects.length === 0 ? (
        <div
          className="forge-empty rounded-xl border"
          style={{ borderColor: 'var(--line)', background: 'var(--bg-2)' }}
        >
          <div className="forge-empty__glyph">
            <Hammer size={32} className="mx-auto" />
          </div>
          <div className="forge-empty__msg">
            Projects emerge from material. The usual flow: capture an idea or problem,
            work on it, and when it has weight, promote it to a project.
            <br />
            <span className="text-xs" style={{ fontFamily: 'var(--mono)' }}>
              The promote-from-capture flow lands in Phase 4.3.2. For now, use &ldquo;+ New project&rdquo; above.
            </span>
          </div>
        </div>
      ) : (
        <ProjectContextMenuProvider>
        <div className="forge-projects">
          {projects.map((p) => {
            const gradient: CoverGradientKey =
              (p.cover_gradient_key ?? gradientKeyForKind(p.kind_seed)) as CoverGradientKey;
            const featured = p.status === 'active';
            const barClass =
              p.kind_seed === 'research'
                ? 'forge-proj__bar forge-proj__bar--gold'
                : p.kind_seed === 'problem'
                  ? 'forge-proj__bar forge-proj__bar--moss'
                  : p.kind_seed === 'observation'
                    ? 'forge-proj__bar forge-proj__bar--plum'
                    : 'forge-proj__bar';
            const statusLabel =
              p.status === 'active'
                ? p.stage ?? 'Active'
                : p.status === 'wrapped'
                  ? 'Wrapped'
                  : p.status === 'paused'
                    ? 'Paused'
                    : 'Archived';
            const isPinned = pinned.has(`project:${p.id}`);
            return (
              <ProjectRow
                key={p.id}
                target={{ id: p.id, status: p.status, isPinned }}
                className="forge-proj"
                style={{ position: 'relative' }}
              >
                <div data-featured={featured ? 'true' : 'false'}>
                  <Link href={`/projects/${p.id}`} style={{ display: 'block', color: 'inherit', textDecoration: 'none' }}>
                    <ProjectCover gradientKey={gradient} stage={statusLabel} />
                    <div className="forge-proj__body">
                      <h3 className="forge-proj__title">
                        {featured && <span className="forge-proj__title-pin">●</span>}
                        {p.title}
                      </h3>
                      {p.deck && <div className="forge-proj__deck">{p.deck}</div>}
                      <div className="forge-proj__meta">
                        {p.kind_seed && <span>#{p.kind_seed}</span>}
                        {p.kind_seed && <span className="dot" />}
                        <span>opened {new Date(p.opened_at).toLocaleDateString()}</span>
                      </div>
                      {typeof p.progress_pct === 'number' && (
                        <div className={barClass}>
                          <div style={{ width: `${Math.max(0, Math.min(100, p.progress_pct))}%` }} />
                        </div>
                      )}
                    </div>
                  </Link>
                  <div style={{ position: 'absolute', top: 8, right: 8 }}>
                    <PinButton sourceKind="project" sourceId={p.id} initiallyPinned={isPinned} />
                  </div>
                </div>
              </ProjectRow>
            );
          })}
        </div>
        </ProjectContextMenuProvider>
      )}
    </div>
  );
}
