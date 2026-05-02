'use client';

import { useRef, useState, useTransition } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  createProjectPart,
  updateProjectPartStatus,
  deleteProjectPart,
} from '@/app/(app)/projects/actions';
import type { PartStatus, ProjectPart } from '@/lib/types/project-extras';

const STATUS_LABEL: Record<PartStatus, string> = {
  planned: 'Planned',
  in_progress: 'In progress',
  done: 'Done',
};

const STATUS_NEXT: Record<PartStatus, PartStatus> = {
  planned: 'in_progress',
  in_progress: 'done',
  done: 'planned',
};

export function PartsList({
  projectId,
  partsKind,
  parts,
}: {
  projectId: string;
  /** The project's `parts_kind` ("chapters", "songs", "experiments"…). */
  partsKind: string;
  parts: ProjectPart[];
}) {
  const [composing, setComposing] = useState(false);
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const titleRef = useRef<HTMLInputElement>(null);

  function submit() {
    if (title.trim().length === 0) return;
    setError(null);
    const fd = new FormData();
    fd.append('project_id', projectId);
    fd.append('title', title);
    fd.append('note', note);
    startTransition(async () => {
      const result = await createProjectPart(fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setTitle('');
      setNote('');
      // Stay open so the user can keep adding.
      setTimeout(() => titleRef.current?.focus(), 0);
    });
  }

  function cycleStatus(p: ProjectPart) {
    startTransition(async () => {
      await updateProjectPartStatus({
        id: p.id,
        project_id: projectId,
        status: STATUS_NEXT[p.status],
      });
    });
  }

  function remove(p: ProjectPart) {
    startTransition(async () => {
      await deleteProjectPart({ id: p.id, project_id: projectId });
    });
  }

  // Display the parts_kind in a friendly way ("chapters" → "Chapters").
  const heading = partsKind.charAt(0).toUpperCase() + partsKind.slice(1);

  return (
    <div className="forge-parts">
      <div className="forge-parts__head">
        <h3>{heading}</h3>
        <span className="forge-parts__sub">
          {parts.length === 0 ? 'no parts yet' : `${parts.length} ${partsKind}`}
        </span>
      </div>

      {parts.length > 0 && (
        <ul className="forge-parts__list">
          {parts.map((p, i) => (
            <li key={p.id} className="forge-parts__row" data-status={p.status}>
              <span className="forge-parts__num">{String(i + 1).padStart(2, '0')}</span>
              <div className="forge-parts__body">
                <div className="forge-parts__title">{p.title}</div>
                {p.note && <div className="forge-parts__note">{p.note}</div>}
              </div>
              <button
                type="button"
                onClick={() => cycleStatus(p)}
                className="forge-parts__status"
                disabled={isPending}
                title="Click to advance status"
              >
                {STATUS_LABEL[p.status]}
              </button>
              <button
                type="button"
                onClick={() => remove(p)}
                disabled={isPending}
                className="forge-parts__del"
                aria-label="Delete part"
                title="Delete"
              >
                <Trash2 size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {composing ? (
        <div className="forge-parts__compose">
          <input
            ref={titleRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={`Title (e.g. ${samplePartTitle(partsKind)})`}
            disabled={isPending}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setComposing(false);
                setTitle('');
                setNote('');
                setError(null);
              }
            }}
          />
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note"
            rows={2}
            disabled={isPending}
          />
          {error && <p style={{ color: 'var(--hot)', fontSize: 12 }}>{error}</p>}
          <div className="forge-parts__compose-row">
            <button
              type="button"
              onClick={submit}
              disabled={isPending || title.trim().length === 0}
              className="forge-tasks__btn forge-tasks__btn--primary"
            >
              {isPending ? 'Adding…' : `Add ${singular(partsKind)}`}
            </button>
            <button
              type="button"
              onClick={() => {
                setComposing(false);
                setTitle('');
                setNote('');
                setError(null);
              }}
              className="forge-tasks__btn"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setComposing(true)}
          className="forge-tasks__add"
        >
          <Plus size={12} />
          Add a {singular(partsKind)}
        </button>
      )}
    </div>
  );
}

function singular(plural: string): string {
  if (plural.endsWith('ies')) return plural.slice(0, -3) + 'y';
  if (plural.endsWith('s')) return plural.slice(0, -1);
  return plural;
}

function samplePartTitle(kind: string): string {
  const k = singular(kind).toLowerCase();
  switch (k) {
    case 'chapter':
      return 'Chapter 1 — opening';
    case 'song':
      return 'Verse hook v3';
    case 'experiment':
      return 'A/B test — pricing tile';
    case 'milestone':
      return 'First user feedback';
    case 'episode':
      return 'Episode pilot';
    default:
      return `New ${k}`;
  }
}
