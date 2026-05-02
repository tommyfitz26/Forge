'use client';

import { useRef, useState, useTransition } from 'react';
import { Check, Plus, Trash2 } from 'lucide-react';
import {
  createProjectTask,
  toggleProjectTask,
  deleteProjectTask,
} from '@/app/(app)/projects/actions';
import type { ProjectTask } from '@/lib/types/project-extras';

/**
 * Inline checklist editor. Used by both the Overview "Next steps" panel
 * (compact, capped at 5) and the dedicated tab (full list, expanded form).
 */
export function NextStepsPanel({
  projectId,
  tasks,
  variant = 'overview',
}: {
  projectId: string;
  tasks: ProjectTask[];
  variant?: 'overview' | 'tab';
}) {
  const [composing, setComposing] = useState(false);
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function submit() {
    if (body.trim().length === 0) return;
    setError(null);
    const fd = new FormData();
    fd.append('project_id', projectId);
    fd.append('body', body);
    startTransition(async () => {
      const result = await createProjectTask(fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setBody('');
      if (variant === 'overview') setComposing(false);
      // Refocus for fast multi-add in tab variant.
      if (variant === 'tab') {
        setTimeout(() => textareaRef.current?.focus(), 0);
      }
    });
  }

  function toggle(task: ProjectTask) {
    startTransition(async () => {
      await toggleProjectTask({
        id: task.id,
        project_id: projectId,
        done: task.status !== 'done',
      });
    });
  }

  function remove(task: ProjectTask) {
    startTransition(async () => {
      await deleteProjectTask({ id: task.id, project_id: projectId });
    });
  }

  const showCompose = variant === 'tab' || composing;
  const visible = variant === 'overview' ? tasks.slice(0, 5) : tasks;

  return (
    <div className="forge-tasks">
      {visible.length === 0 && !showCompose && (
        <p
          style={{
            fontFamily: 'var(--serif)',
            fontStyle: 'italic',
            color: 'var(--ink-2)',
            fontSize: 14,
            margin: 0,
          }}
        >
          Nothing on the list yet. Add the next concrete step.
        </p>
      )}

      {visible.length > 0 && (
        <ul className="forge-tasks__list">
          {visible.map((t) => (
            <li
              key={t.id}
              className="forge-tasks__row"
              data-done={t.status === 'done' ? 'true' : 'false'}
            >
              <button
                type="button"
                className="forge-tasks__check"
                onClick={() => toggle(t)}
                disabled={isPending}
                aria-label={t.status === 'done' ? 'Mark open' : 'Mark done'}
              >
                {t.status === 'done' && <Check size={11} />}
              </button>
              <span className="forge-tasks__body">{t.body}</span>
              <button
                type="button"
                className="forge-tasks__del"
                onClick={() => remove(t)}
                disabled={isPending}
                aria-label="Delete task"
                title="Delete"
              >
                <Trash2 size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {variant === 'overview' && tasks.length > 5 && (
        <p style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 8 }}>
          +{tasks.length - 5} more — open the Next steps tab to see them all.
        </p>
      )}

      {showCompose ? (
        <div className="forge-tasks__compose">
          <textarea
            ref={textareaRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                submit();
              }
              if (e.key === 'Escape' && variant === 'overview') {
                setComposing(false);
                setBody('');
                setError(null);
              }
            }}
            placeholder="The next concrete step…"
            rows={2}
            disabled={isPending}
          />
          {error && <p style={{ color: 'var(--hot)', fontSize: 12 }}>{error}</p>}
          <div className="forge-tasks__compose-row">
            <button
              type="button"
              onClick={submit}
              disabled={isPending || body.trim().length === 0}
              className="forge-tasks__btn forge-tasks__btn--primary"
            >
              {isPending ? 'Adding…' : 'Add task'}
            </button>
            {variant === 'overview' && (
              <button
                type="button"
                onClick={() => {
                  setComposing(false);
                  setBody('');
                  setError(null);
                }}
                className="forge-tasks__btn"
              >
                Cancel
              </button>
            )}
            <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--ink-3)' }}>
              ⌘↵ to add
            </span>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setComposing(true)}
          className="forge-tasks__add"
        >
          <Plus size={12} />
          Add a next step
        </button>
      )}
    </div>
  );
}
