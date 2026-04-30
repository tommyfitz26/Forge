'use client';

import { useEffect, useState, useTransition } from 'react';
import { Plus, X } from 'lucide-react';
import { createProject } from '@/app/(app)/workshop/actions';
import { CAPTURE_KINDS, type CaptureKind } from '@/lib/capture/kinds';
import {
  COVER_GRADIENT_KEYS,
  gradientCssForKey,
  gradientKeyForKind,
  type CoverGradientKey,
} from '@/lib/types/projects';

const KIND_LABELS: Record<CaptureKind, string> = {
  idea: 'Idea',
  problem: 'Problem',
  observation: 'Observation',
  research: 'Research',
};

export function NewProjectModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [kindSeed, setKindSeed] = useState<CaptureKind>('idea');
  const [gradient, setGradient] = useState<CoverGradientKey>(gradientKeyForKind('idea'));

  // (Reset-on-open intentionally omitted to avoid the setState-in-effect rule.
  //  The modal keeps its previous values when reopened — acceptable UX, easy
  //  to add a `key={open}`-based remount later if reset becomes desired.)

  // Esc closes the modal.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  function pickKind(k: CaptureKind) {
    setKindSeed(k);
    // Auto-update the gradient default when the user changes kind, unless
    // they've already manually picked one (we lose that on next render — fine
    // for Phase 4.3.1; small QoL refinement later).
    setGradient(gradientKeyForKind(k));
  }

  function onSubmit(formData: FormData) {
    setError(null);
    formData.set('kind_seed', kindSeed);
    formData.set('cover_gradient_key', gradient);
    startTransition(async () => {
      const result = await createProject(formData);
      if (!result.ok) setError(result.error);
      // On success the server action redirects.
    });
  }

  return (
    <div className="forge-modal-bg" onClick={onClose}>
      <div
        className="forge-modal forge-capture-host"
        style={{ maxWidth: 560 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="New project"
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid var(--line)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Plus size={16} style={{ color: 'var(--ember)' }} />
            <span style={{ fontFamily: 'var(--serif)', fontSize: 19, color: 'var(--ink-0)', fontWeight: 500 }}>
              New project
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--ink-3)',
              cursor: 'pointer',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <X size={16} />
          </button>
        </header>

        <form action={onSubmit} style={{ padding: '20px 22px' }}>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="np-title">Title</label>
            <input
              id="np-title"
              name="title"
              type="text"
              required
              autoFocus
              autoComplete="off"
              placeholder="What is this project?"
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label htmlFor="np-deck">A line about it (optional)</label>
            <textarea
              id="np-deck"
              name="deck"
              rows={2}
              placeholder="A long essay in three parts. An album of porchlight songs. The kind of one-liner that holds the whole."
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label>Kind</label>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 6,
              }}
            >
              {CAPTURE_KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => pickKind(k)}
                  data-active={kindSeed === k ? 'true' : 'false'}
                  style={{
                    padding: '8px 6px',
                    border: '1px solid var(--line)',
                    background: kindSeed === k ? 'var(--ember-soft)' : 'var(--bg-2)',
                    color: kindSeed === k ? 'var(--ember)' : 'var(--ink-1)',
                    borderColor: kindSeed === k ? 'var(--ember)' : 'var(--line)',
                    borderRadius: 6,
                    fontSize: 12.5,
                    cursor: 'pointer',
                    fontFamily: 'var(--sans)',
                  }}
                >
                  {KIND_LABELS[k]}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 22 }}>
            <label>Cover gradient</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {COVER_GRADIENT_KEYS.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGradient(g)}
                  aria-label={`Cover gradient: ${g}`}
                  style={{
                    width: 44,
                    height: 30,
                    borderRadius: 6,
                    background: gradientCssForKey(g),
                    border: gradient === g ? '2px solid var(--ember)' : '1px solid var(--line)',
                    cursor: 'pointer',
                  }}
                />
              ))}
            </div>
          </div>

          {error && (
            <p style={{ color: 'var(--hot)', fontSize: 13, marginBottom: 12 }}>{error}</p>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'none',
                color: 'var(--ink-2)',
                border: 'none',
                fontSize: 13,
                cursor: 'pointer',
                fontFamily: 'var(--sans)',
              }}
            >
              Cancel
            </button>
            <button type="submit" disabled={isPending}>
              {isPending ? 'Creating…' : 'Create project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
