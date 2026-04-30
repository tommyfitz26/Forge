'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import {
  ScrollText,
  Hammer,
  AlignLeft,
  PenLine,
  Link2,
  X,
  type LucideIcon,
} from 'lucide-react';
import {
  createManualLink,
  searchLinkTargets,
  type LinkSearchHit,
} from '@/app/(app)/links/actions';
import type { LinkSourceKind } from '@/lib/types/links';

const KIND_ICON: Record<LinkSourceKind, LucideIcon> = {
  capture: ScrollText,
  project: Hammer,
  thread: AlignLeft,
  journal_entry: PenLine,
};

const KIND_LABEL: Record<LinkSourceKind, string> = {
  capture: 'Capture',
  project: 'Project',
  thread: 'Thread',
  journal_entry: 'Journal',
};

export function LinkPalette({
  open,
  onClose,
  source,
}: {
  open: boolean;
  onClose: () => void;
  source: { kind: LinkSourceKind; id: string };
}) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<LinkSearchHit[]>([]);
  const [picked, setPicked] = useState<LinkSearchHit | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the input on open + reset state. setState calls here are
  // intentional — we reset modal-local state every time the modal mounts.
  useEffect(() => {
    if (!open) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setQ('');
    setHits([]);
    setPicked(null);
    setReason('');
    setError(null);
    /* eslint-enable react-hooks/set-state-in-effect */
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);

  // Esc closes.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Debounced search. The empty-query branch resets local state; the
  // populated branch fires a network request after debounce. Both setHits
  // calls are syncing query results to state — exactly the "external system
  // → React" direction the lint rule allows when explicitly opted in.
  useEffect(() => {
    if (!open || !q.trim()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHits([]);
      return;
    }
    const handle = setTimeout(() => {
      searchLinkTargets(q, source.kind, source.id).then((results) => {
        setHits(results);
      });
    }, 160);
    return () => clearTimeout(handle);
  }, [q, open, source.kind, source.id]);

  function onSubmitLink() {
    if (!picked) return;
    setError(null);
    const fd = new FormData();
    fd.set('source_kind', source.kind);
    fd.set('source_id', source.id);
    fd.set('target_kind', picked.kind);
    fd.set('target_id', picked.id);
    if (reason.trim()) fd.set('reason', reason.trim());
    startTransition(async () => {
      const result = await createManualLink(fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onClose();
    });
  }

  if (!open) return null;

  return (
    <div className="forge-link-palette__backdrop" onClick={onClose}>
      <div
        className="forge-link-palette"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Link to another item"
      >
        <header className="forge-link-palette__head">
          <Link2 size={14} />
          <span>Link to…</span>
          <button
            type="button"
            onClick={onClose}
            className="forge-link-palette__close"
            aria-label="Close"
          >
            <X size={13} />
          </button>
        </header>

        {!picked ? (
          <>
            <input
              ref={inputRef}
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search captures, projects, threads, journal entries…"
              className="forge-link-palette__input"
            />
            <div className="forge-link-palette__results">
              {q.trim() === '' ? (
                <div className="forge-link-palette__hint">
                  Start typing to search across everything you&apos;ve captured.
                </div>
              ) : hits.length === 0 ? (
                <div className="forge-link-palette__hint">No matches.</div>
              ) : (
                <ul>
                  {hits.map((h) => {
                    const Icon = KIND_ICON[h.kind];
                    return (
                      <li key={`${h.kind}:${h.id}`}>
                        <button
                          type="button"
                          className="forge-link-palette__row"
                          onClick={() => setPicked(h)}
                        >
                          <Icon
                            size={13}
                            className="forge-link-palette__row-ico"
                          />
                          <span className="forge-link-palette__row-title">
                            {h.title}
                          </span>
                          <span className="forge-link-palette__row-kind">
                            {KIND_LABEL[h.kind]}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </>
        ) : (
          <div className="forge-link-palette__confirm">
            <div className="forge-link-palette__pick">
              <span className="forge-link-palette__pick-label">Linking to</span>
              <div className="forge-link-palette__pick-row">
                {(() => {
                  const Icon = KIND_ICON[picked.kind];
                  return <Icon size={13} className="forge-link-palette__row-ico" />;
                })()}
                <span className="forge-link-palette__row-title">{picked.title}</span>
                <button
                  type="button"
                  className="forge-link-palette__pick-clear"
                  onClick={() => setPicked(null)}
                >
                  change
                </button>
              </div>
            </div>
            <label className="forge-link-palette__note-label">
              Why? <span style={{ color: 'var(--ink-3)' }}>(optional)</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={280}
              rows={2}
              placeholder="Both touch on the marketplace pivot…"
              className="forge-link-palette__note"
              autoFocus
            />
            {error && (
              <p style={{ color: 'var(--hot)', fontSize: 13, marginTop: 4 }}>{error}</p>
            )}
            <div className="forge-link-palette__actions">
              <button
                type="button"
                className="forge-btn forge-btn--ghost"
                onClick={() => setPicked(null)}
                disabled={isPending}
              >
                Back
              </button>
              <button
                type="button"
                className="forge-btn forge-btn--primary"
                onClick={onSubmitLink}
                disabled={isPending}
              >
                {isPending ? 'Linking…' : 'Link'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
