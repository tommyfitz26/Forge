'use client';

import { useEffect, useState, useTransition } from 'react';
import { ArrowUpRight, X } from 'lucide-react';
import { promoteToProject } from '@/app/(app)/workshop/actions';
import type { CaptureKind } from '@/lib/capture/kinds';
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

export function PromoteToProjectModal({
  open,
  onClose,
  capture,
}: {
  open: boolean;
  onClose: () => void;
  capture: {
    id: string;
    title: string;
    kind: CaptureKind;
  };
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [gradient, setGradient] = useState<CoverGradientKey>(gradientKeyForKind(capture.kind));

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

  function onSubmit(formData: FormData) {
    setError(null);
    formData.set('capture_id', capture.id);
    formData.set('cover_gradient_key', gradient);
    startTransition(async () => {
      const result = await promoteToProject(formData);
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
        aria-label="Make this a project"
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
            <ArrowUpRight size={16} style={{ color: 'var(--ember)' }} />
            <span
              style={{
                fontFamily: 'var(--serif)',
                fontSize: 19,
                color: 'var(--ink-0)',
                fontWeight: 500,
              }}
            >
              Make this a project
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
          <p
            style={{
              fontFamily: 'var(--serif)',
              fontStyle: 'italic',
              color: 'var(--ink-2)',
              fontSize: 14.5,
              margin: '0 0 18px',
              lineHeight: 1.5,
            }}
          >
            This capture has weight. Promoting creates a project anchored on this thought —
            future captures, threads, and references can be filed against it.
          </p>

          <div style={{ marginBottom: 14 }}>
            <label htmlFor="ptp-title">Project title</label>
            <input
              id="ptp-title"
              name="title"
              type="text"
              required
              autoFocus
              autoComplete="off"
              defaultValue={capture.title}
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label htmlFor="ptp-deck">A line about it (optional)</label>
            <textarea
              id="ptp-deck"
              name="deck"
              rows={2}
              placeholder="What's the project, said in one breath?"
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label>Kind (locked from capture)</label>
            <div
              style={{
                padding: '8px 12px',
                background: 'var(--bg-2)',
                border: '1px solid var(--line)',
                borderRadius: 6,
                color: 'var(--ink-1)',
                fontSize: 13.5,
                fontFamily: 'var(--mono)',
              }}
            >
              {KIND_LABELS[capture.kind]} ·{' '}
              <span style={{ color: 'var(--ink-3)' }}>seeds the project&apos;s kind</span>
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
              {isPending ? 'Promoting…' : 'Make it a project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
