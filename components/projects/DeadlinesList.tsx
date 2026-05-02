'use client';

import { useRef, useState, useTransition } from 'react';
import { Calendar, Check, Plus, Trash2 } from 'lucide-react';
import {
  createProjectDeadline,
  deleteProjectDeadline,
  toggleProjectDeadline,
} from '@/app/(app)/projects/actions';
import type { ProjectDeadline } from '@/lib/types/project-extras';

/**
 * Forward-looking deadlines for one project. Renders a tidy list of
 * upcoming + overdue + past deadlines, plus an inline composer.
 *
 * Lives at the top of the Timeline tab — past events render below it.
 */
export function DeadlinesList({
  projectId,
  deadlines,
  projectTargetAt,
}: {
  projectId: string;
  deadlines: ProjectDeadline[];
  /** projects.target_at — surfaced as a non-editable "target" pseudo-deadline. */
  projectTargetAt: string | null;
}) {
  const [composing, setComposing] = useState(false);
  const [title, setTitle] = useState('');
  const [dueAt, setDueAt] = useState(defaultDueAt());
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const titleRef = useRef<HTMLInputElement>(null);

  function submit() {
    if (title.trim().length === 0) {
      setError('A deadline needs a label.');
      return;
    }
    setError(null);
    const fd = new FormData();
    fd.append('project_id', projectId);
    fd.append('title', title);
    fd.append('due_at', dueAt);
    fd.append('notes', notes);
    startTransition(async () => {
      const result = await createProjectDeadline(fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setTitle('');
      setNotes('');
      setDueAt(defaultDueAt());
      // Stay open so the user can keep adding.
      setTimeout(() => titleRef.current?.focus(), 0);
    });
  }

  function toggle(d: ProjectDeadline) {
    startTransition(async () => {
      await toggleProjectDeadline({
        id: d.id,
        project_id: projectId,
        hit: d.status !== 'hit',
      });
    });
  }

  function remove(d: ProjectDeadline) {
    startTransition(async () => {
      await deleteProjectDeadline({ id: d.id, project_id: projectId });
    });
  }

  const today = todayIso();
  const upcoming = deadlines.filter((d) => d.status === 'pending' && d.due_at >= today);
  const overdue = deadlines.filter((d) => d.status === 'pending' && d.due_at < today);
  const hit = deadlines.filter((d) => d.status === 'hit');

  return (
    <div className="forge-deadlines">
      <div className="forge-deadlines__head">
        <div>
          <h3>Upcoming</h3>
          <span className="forge-deadlines__sub">
            {summarize(upcoming.length, overdue.length, hit.length)}
          </span>
        </div>
        {!composing && (
          <button
            type="button"
            onClick={() => setComposing(true)}
            className="forge-tasks__btn forge-tasks__btn--primary"
          >
            <Plus size={11} style={{ marginRight: 4 }} />
            Add deadline
          </button>
        )}
      </div>

      {composing && (
        <div className="forge-deadlines__compose">
          <div className="forge-deadlines__compose-grid">
            <input
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Label (e.g. demo to Maren)"
              disabled={isPending}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setComposing(false);
                  setTitle('');
                  setNotes('');
                  setError(null);
                }
              }}
            />
            <input
              type="date"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              disabled={isPending}
              min={todayIso()}
            />
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional note"
            rows={2}
            disabled={isPending}
          />
          {error && <p style={{ color: 'var(--hot)', fontSize: 12, margin: 0 }}>{error}</p>}
          <div className="forge-tasks__compose-row">
            <button
              type="button"
              onClick={submit}
              disabled={isPending || title.trim().length === 0}
              className="forge-tasks__btn forge-tasks__btn--primary"
            >
              {isPending ? 'Adding…' : 'Add deadline'}
            </button>
            <button
              type="button"
              onClick={() => {
                setComposing(false);
                setTitle('');
                setNotes('');
                setError(null);
              }}
              className="forge-tasks__btn"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Project target_at — read-only, surfaced if set. */}
      {projectTargetAt && (
        <div className="forge-deadlines__row" data-tone="target">
          <div className="forge-deadlines__date">
            <DateChip iso={projectTargetAt} />
          </div>
          <div className="forge-deadlines__body">
            <div className="forge-deadlines__title">Project target</div>
            <div className="forge-deadlines__sub">
              From the project settings — edit on the hero
            </div>
          </div>
          <span className="forge-deadlines__badge">target</span>
        </div>
      )}

      {/* Overdue first */}
      {overdue.map((d) => (
        <DeadlineRow
          key={d.id}
          d={d}
          tone="overdue"
          onToggle={() => toggle(d)}
          onDelete={() => remove(d)}
          disabled={isPending}
        />
      ))}

      {/* Upcoming */}
      {upcoming.map((d) => (
        <DeadlineRow
          key={d.id}
          d={d}
          tone="upcoming"
          onToggle={() => toggle(d)}
          onDelete={() => remove(d)}
          disabled={isPending}
        />
      ))}

      {/* Hit (folded under, descending by completed_at) */}
      {hit.length > 0 && (
        <details className="forge-deadlines__hit">
          <summary>
            {hit.length} hit · click to expand
          </summary>
          {hit
            .slice()
            .sort((a, b) =>
              (b.completed_at ?? b.due_at).localeCompare(a.completed_at ?? a.due_at),
            )
            .map((d) => (
              <DeadlineRow
                key={d.id}
                d={d}
                tone="hit"
                onToggle={() => toggle(d)}
                onDelete={() => remove(d)}
                disabled={isPending}
              />
            ))}
        </details>
      )}

      {/* Empty state */}
      {deadlines.length === 0 && !projectTargetAt && !composing && (
        <p
          style={{
            fontFamily: 'var(--serif)',
            fontStyle: 'italic',
            color: 'var(--ink-2)',
            fontSize: 14,
            margin: 0,
            padding: '12px 0',
          }}
        >
          No deadlines yet. Add one to keep this project on the radar.
        </p>
      )}
    </div>
  );
}

function DeadlineRow({
  d,
  tone,
  onToggle,
  onDelete,
  disabled,
}: {
  d: ProjectDeadline;
  tone: 'upcoming' | 'overdue' | 'hit';
  onToggle: () => void;
  onDelete: () => void;
  disabled: boolean;
}) {
  return (
    <div className="forge-deadlines__row" data-tone={tone}>
      <div className="forge-deadlines__date">
        <DateChip iso={d.due_at} />
      </div>
      <div className="forge-deadlines__body">
        <div className="forge-deadlines__title">{d.title}</div>
        {d.notes && <div className="forge-deadlines__notes">{d.notes}</div>}
        <div className="forge-deadlines__sub">
          {tone === 'overdue' && <span className="forge-deadlines__overdue">overdue · </span>}
          {tone === 'hit'
            ? `hit ${formatDateLabel(d.completed_at ?? d.due_at)}`
            : relativeDays(d.due_at)}
        </div>
      </div>
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        className="forge-tasks__check"
        aria-label={d.status === 'hit' ? 'Mark pending' : 'Mark hit'}
        title={d.status === 'hit' ? 'Mark pending' : 'Mark hit'}
        style={{
          background: d.status === 'hit' ? 'var(--ember-soft)' : undefined,
          borderColor: d.status === 'hit' ? 'var(--ember)' : undefined,
        }}
      >
        {d.status === 'hit' && <Check size={11} />}
      </button>
      <button
        type="button"
        onClick={onDelete}
        disabled={disabled}
        className="forge-tasks__del"
        aria-label="Delete deadline"
        title="Delete"
        style={{ opacity: 1 }}
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}

function DateChip({ iso }: { iso: string }) {
  // Render as "May 12" stacked above "Tue".
  const d = new Date(`${iso}T12:00:00Z`);
  const month = d.toLocaleDateString(undefined, { month: 'short' });
  const day = d.getUTCDate();
  const dow = d.toLocaleDateString(undefined, { weekday: 'short' });
  return (
    <div className="forge-deadlines__chip" aria-hidden>
      <Calendar size={11} className="forge-deadlines__chip-ico" />
      <div className="forge-deadlines__chip-day">{day}</div>
      <div className="forge-deadlines__chip-mon">{month} · {dow}</div>
    </div>
  );
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function defaultDueAt(): string {
  // Default = 7 days out — a sensible most-common case.
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10);
}

function formatDateLabel(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function relativeDays(iso: string): string {
  const today = new Date(todayIso() + 'T12:00:00Z');
  const target = new Date(iso + 'T12:00:00Z');
  const diff = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff > 0 && diff <= 14) return `in ${diff} days`;
  if (diff > 14) return `in ${Math.round(diff / 7)} weeks`;
  if (diff === -1) return 'yesterday';
  return `${Math.abs(diff)} days ago`;
}

function summarize(upcoming: number, overdue: number, hit: number): string {
  const parts: string[] = [];
  if (overdue > 0) parts.push(`${overdue} overdue`);
  if (upcoming > 0) parts.push(`${upcoming} coming up`);
  if (hit > 0) parts.push(`${hit} hit`);
  if (parts.length === 0) return 'nothing on the calendar';
  return parts.join(' · ');
}
