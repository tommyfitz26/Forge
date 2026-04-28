'use client';

import { useEffect, useState } from 'react';
import { Bell, BellOff, Send } from 'lucide-react';
import { urlBase64ToUint8Array } from '@/lib/push/encoding';

type Props = {
  vapidPublicKey: string | null;
};

type Status =
  | 'loading'
  | 'unsupported'
  | 'not_configured'
  | 'denied'
  | 'prompt'
  | 'subscribed'
  | 'busy';

// Sits in the (app) layout. Self-hides once push is on or impossible. The only
// time it shouts at the user is the very first signed-in load on a device that
// supports push but hasn't been subscribed yet.
export function EnableNudges({ vapidPublicKey }: Props) {
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);
  const [testFlash, setTestFlash] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!vapidPublicKey) {
        if (!cancelled) setStatus('not_configured');
        return;
      }
      if (typeof window === 'undefined') return;
      const supported =
        'serviceWorker' in navigator &&
        'PushManager' in window &&
        'Notification' in window;
      if (!supported) {
        if (!cancelled) setStatus('unsupported');
        return;
      }
      try {
        const reg = await navigator.serviceWorker.register('/sw.js');
        await navigator.serviceWorker.ready;
        const existing = await reg.pushManager.getSubscription();
        if (cancelled) return;
        if (existing) {
          setStatus('subscribed');
          return;
        }
        if (Notification.permission === 'denied') setStatus('denied');
        else setStatus('prompt');
      } catch (err) {
        if (cancelled) return;
        setStatus('unsupported');
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [vapidPublicKey]);

  async function enable() {
    if (!vapidPublicKey) return;
    setStatus('busy');
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setStatus(permission === 'denied' ? 'denied' : 'prompt');
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      // applicationServerKey wants a BufferSource backed by ArrayBuffer.
      // Uint8Array<ArrayBufferLike> (post-TS 5.7) trips the overload, so hand
      // the ArrayBuffer directly.
      const keyBytes = urlBase64ToUint8Array(vapidPublicKey);
      const keyBuffer = keyBytes.buffer.slice(
        keyBytes.byteOffset,
        keyBytes.byteOffset + keyBytes.byteLength,
      ) as ArrayBuffer;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyBuffer,
      });
      const json = sub.toJSON();
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          subscription: {
            endpoint: json.endpoint,
            keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
          },
          userAgent: navigator.userAgent,
        }),
      });
      if (!res.ok) {
        // Roll back the browser-side subscription so the next attempt can
        // re-subscribe cleanly. Otherwise getSubscription() would return the
        // unsynced one and we'd think we're "subscribed."
        try {
          await sub.unsubscribe();
        } catch {
          // best effort
        }
        const text = await res.text();
        throw new Error(`subscribe_failed: ${res.status} ${text}`);
      }
      setStatus('subscribed');
    } catch (err) {
      setStatus('prompt');
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function sendTest() {
    setTestFlash(null);
    try {
      const res = await fetch('/api/push/test', { method: 'POST' });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        sent?: number;
        expired?: number;
        failed?: number;
        error?: string;
      };
      if (!res.ok || !body.ok) {
        setTestFlash(`Test push failed: ${body.error ?? res.status}`);
        return;
      }
      setTestFlash(`Sent to ${body.sent} device${body.sent === 1 ? '' : 's'}.`);
    } catch (err) {
      setTestFlash(`Test push failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (status === 'loading' || status === 'not_configured' || status === 'unsupported') {
    return null;
  }

  if (status === 'denied') {
    return (
      <div className="flex items-center gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-600 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-400">
        <BellOff className="h-3.5 w-3.5" />
        <span>Notifications are blocked. Enable them in iOS Settings → Notifications → Forge.</span>
      </div>
    );
  }

  if (status === 'subscribed') {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-600 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-400">
        <Bell className="h-3.5 w-3.5" />
        <span>Nudges on for this device.</span>
        <button
          type="button"
          onClick={sendTest}
          className="ml-auto inline-flex items-center gap-1 rounded-md border border-neutral-300 px-2 py-0.5 text-[11px] font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
        >
          <Send className="h-3 w-3" />
          Send test
        </button>
        {testFlash && <span className="basis-full text-neutral-500">{testFlash}</span>}
      </div>
    );
  }

  // status === 'prompt' | 'busy'
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-600 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-400">
      <Bell className="h-3.5 w-3.5" />
      <span>Turn on daily nudges so Forge can prompt you at 10am and 5pm.</span>
      <button
        type="button"
        onClick={enable}
        disabled={status === 'busy'}
        className="ml-auto rounded-md bg-neutral-900 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-neutral-800 disabled:opacity-60 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
      >
        {status === 'busy' ? 'Subscribing…' : 'Turn on nudges'}
      </button>
      {error && <span className="basis-full text-rose-600 dark:text-rose-400">{error}</span>}
    </div>
  );
}
