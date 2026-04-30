'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { updateThreadSection } from '@/app/(app)/threads/actions';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const SAVED_FADE_MS = 1500;

export function ThreadSectionEditor({
  threadId,
  sectionKey,
  title,
  initialBody,
  placeholder,
}: {
  threadId: string;
  sectionKey: string;
  title: string;
  initialBody: string;
  placeholder?: string;
}) {
  const [body, setBody] = useState(initialBody);
  const [savedSnapshot, setSavedSnapshot] = useState(initialBody);
  const [state, setState] = useState<SaveState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fadeTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (fadeTimer.current != null) window.clearTimeout(fadeTimer.current);
    };
  }, []);

  function save() {
    if (body === savedSnapshot) {
      setState('idle');
      return;
    }
    setState('saving');
    setError(null);

    const fd = new FormData();
    fd.set('thread_id', threadId);
    fd.set('section_key', sectionKey);
    fd.set('body', body);

    startTransition(async () => {
      const result = await updateThreadSection(fd);
      if (result.ok) {
        setSavedSnapshot(body);
        setState('saved');
        if (fadeTimer.current != null) window.clearTimeout(fadeTimer.current);
        fadeTimer.current = window.setTimeout(() => setState('idle'), SAVED_FADE_MS);
      } else {
        setState('error');
        setError(result.error);
      }
    });
  }

  return (
    <section className="forge-section">
      <div className="forge-section__head">
        <h3 className="forge-section__title">{title}</h3>
        <span className="forge-section__status" data-state={state}>
          {state === 'saving' && 'saving…'}
          {state === 'saved' && 'saved'}
          {state === 'error' && (error ?? 'save failed')}
          {state === 'idle' && body !== savedSnapshot && 'unsaved'}
        </span>
      </div>
      <textarea
        className="forge-section__textarea"
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
          if (state === 'saved' || state === 'error') setState('idle');
        }}
        onBlur={save}
        placeholder={placeholder ?? 'Write here. Saves on blur.'}
        disabled={isPending && state === 'saving'}
      />
    </section>
  );
}
