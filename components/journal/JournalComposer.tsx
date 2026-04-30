'use client';

import { useRef, useState, useTransition } from 'react';
import { createJournalEntry } from '@/app/(app)/journal/actions';

export function JournalComposer({ defaultDate }: { defaultDate: string }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createJournalEntry(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      formRef.current?.reset();
    });
  }

  return (
    <form ref={formRef} action={onSubmit} className="forge-journal-composer">
      <div className="forge-journal-composer__label">New entry</div>
      <textarea
        name="body"
        required
        rows={5}
        placeholder={"Three lines is enough. The serif is intentional — write here like you're writing a letter to a future you."}
      />
      <div className="forge-journal-composer__row">
        <input
          name="tags_raw"
          type="text"
          className="forge-journal-composer__tags"
          placeholder="tags · #process #walking (space or comma separated)"
          autoComplete="off"
        />
        <input
          name="written_at"
          type="date"
          className="forge-journal-composer__date"
          defaultValue={defaultDate}
          aria-label="Entry date"
        />
        <button
          type="submit"
          className="forge-journal-composer__submit"
          disabled={isPending}
        >
          {isPending ? 'Saving…' : 'Save entry'}
        </button>
      </div>
      {error && (
        <p style={{ color: 'var(--hot)', fontSize: 13, marginTop: 10 }}>{error}</p>
      )}
    </form>
  );
}
