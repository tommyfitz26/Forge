'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { countPending, subscribePendingChanged } from '@/lib/offline/idb';
import { retryAllPending } from '@/lib/offline/upload';

export function UnsyncedBadge() {
  const [count, setCount] = useState(0);
  const [retrying, setRetrying] = useState(false);

  async function refresh() {
    try {
      setCount(await countPending());
    } catch {
      // IDB might be unavailable (private mode in some browsers) — hide the badge.
      setCount(0);
    }
  }

  useEffect(() => {
    // IndexedDB is async-only; we can't read it during render. An initial
    // refresh on mount is necessary to hydrate the count from storage.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    const unsub = subscribePendingChanged(refresh);
    const onFocus = () => refresh();
    const onOnline = async () => {
      await retryAllPending();
      refresh();
    };
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);
    return () => {
      unsub();
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onOnline);
    };
  }, []);

  async function onClick() {
    if (retrying || count === 0) return;
    setRetrying(true);
    try {
      await retryAllPending();
    } finally {
      setRetrying(false);
      refresh();
    }
  }

  if (count === 0) return null;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={retrying}
      className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-700 transition-opacity hover:bg-amber-500/20 disabled:opacity-60 dark:text-amber-400"
      title="Retry pending uploads"
    >
      <AlertTriangle className="h-3 w-3" />
      Unsynced ({count}){retrying ? ' · retrying…' : ''}
    </button>
  );
}
