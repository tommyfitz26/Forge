'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { Flame } from 'lucide-react';
import { setTodaysFocus, clearTodaysFocus } from '@/app/(app)/today/actions';

type Mode = 'display' | 'edit';

export function TodayFocusCard({ initialBody }: { initialBody: string | null }) {
  const [body, setBody] = useState(initialBody ?? '');
  const [mode, setMode] = useState<Mode>(initialBody ? 'display' : 'edit');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (mode === 'edit') {
      // Tiny defer so the element is mounted before we focus it.
      const t = setTimeout(() => textareaRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [mode]);

  // ⌘I / Ctrl-I anywhere on the page enters edit mode (SPEC §10).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'i') {
        // Don't steal the shortcut while typing in another field.
        const tag = (document.activeElement as HTMLElement | null)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        e.preventDefault();
        setMode('edit');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function onSave() {
    const trimmed = body.trim();
    if (!trimmed) {
      setError('Add a focus first.');
      return;
    }
    setError(null);
    const fd = new FormData();
    fd.set('body', trimmed);
    startTransition(async () => {
      const result = await setTodaysFocus(fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMode('display');
    });
  }

  function onClear() {
    if (!initialBody && !body) return;
    setError(null);
    startTransition(async () => {
      await clearTodaysFocus();
      setBody('');
      setMode('edit');
    });
  }

  function onCancel() {
    setBody(initialBody ?? '');
    setError(null);
    if (initialBody) setMode('display');
  }

  return (
    <div
      className="relative overflow-hidden rounded-xl border p-5"
      style={{
        background:
          'linear-gradient(135deg, var(--ember-soft) 0%, transparent 60%), var(--bg-2)',
        borderColor: 'var(--line)',
        boxShadow: 'var(--shadow-1)',
      }}
    >
      <div className="flex items-center gap-4">
        <div
          className="grid h-9 w-9 place-items-center rounded-full"
          style={{
            background:
              'radial-gradient(circle at 50% 60%, #f4c388 0%, #c47840 70%, transparent 95%)',
            boxShadow: '0 0 24px var(--ember-glow)',
          }}
        >
          <Flame size={16} style={{ color: '#1a0f08' }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3 mb-1">
            Today&apos;s focus
          </div>
          {mode === 'display' ? (
            <button
              type="button"
              onClick={() => setMode('edit')}
              className="w-full text-left italic"
              style={{
                fontFamily: 'var(--serif)',
                fontSize: 18,
                color: 'var(--ink-1)',
              }}
              aria-label="Edit today's focus"
            >
              {body || 'Set when ready — a morning nudge will ask if you haven’t.'}
            </button>
          ) : (
            <textarea
              ref={textareaRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault();
                  onSave();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  onCancel();
                }
              }}
              rows={2}
              maxLength={280}
              placeholder="The one thing on the bench today…"
              className="forge-focus-input w-full resize-none bg-transparent italic outline-none"
              style={{
                fontFamily: 'var(--serif)',
                fontSize: 18,
                color: 'var(--ink-1)',
              }}
            />
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          {mode === 'display' ? (
            <button
              type="button"
              className="forge-btn"
              onClick={() => setMode('edit')}
            >
              {body ? 'Edit' : 'Set focus'}
            </button>
          ) : (
            <>
              <button
                type="button"
                className="forge-btn forge-btn--primary"
                onClick={onSave}
                disabled={isPending}
              >
                {isPending ? 'Saving…' : 'Save'}
              </button>
              {initialBody && (
                <button
                  type="button"
                  className="forge-btn forge-btn--ghost"
                  onClick={onCancel}
                  disabled={isPending}
                >
                  Cancel
                </button>
              )}
              {body && (
                <button
                  type="button"
                  className="forge-btn forge-btn--ghost"
                  onClick={onClear}
                  disabled={isPending}
                  style={{ fontSize: 11, color: 'var(--ink-3)' }}
                >
                  Clear
                </button>
              )}
            </>
          )}
        </div>
      </div>
      {error && (
        <p style={{ color: 'var(--hot)', fontSize: 13, marginTop: 10 }}>{error}</p>
      )}
    </div>
  );
}
