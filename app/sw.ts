/// <reference lib="webworker" />

// Service worker source. Compiled to public/sw.js by @serwist/next on build.
// Do NOT edit public/sw.js — it is generated and gitignored.

import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { Serwist } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST ?? [],
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
});

type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

function parsePushData(event: PushEvent): PushPayload | null {
  if (!event.data) return null;
  try {
    const parsed = event.data.json() as Partial<PushPayload>;
    if (typeof parsed.title === 'string' && typeof parsed.body === 'string') {
      const out: PushPayload = { title: parsed.title, body: parsed.body };
      if (typeof parsed.url === 'string') out.url = parsed.url;
      if (typeof parsed.tag === 'string') out.tag = parsed.tag;
      return out;
    }
  } catch {
    // Fall through to text-only fallback below.
  }
  const text = event.data.text();
  return text ? { title: 'Forge', body: text } : null;
}

self.addEventListener('push', (event) => {
  const payload = parsePushData(event);
  if (!payload) return;
  const options: NotificationOptions = {
    body: payload.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: payload.url ?? '/' },
  };
  if (payload.tag) options.tag = payload.tag;
  event.waitUntil(self.registration.showNotification(payload.title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target =
    typeof event.notification.data === 'object' &&
    event.notification.data !== null &&
    typeof (event.notification.data as { url?: unknown }).url === 'string'
      ? (event.notification.data as { url: string }).url
      : '/';
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of all) {
        try {
          const url = new URL(client.url);
          if (url.pathname === target.split('?')[0] && 'focus' in client) {
            await client.focus();
            if ('navigate' in client && client.url !== new URL(target, url).toString()) {
              await (client as WindowClient).navigate(target);
            }
            return;
          }
        } catch {
          // ignore unparseable client urls
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});

serwist.addEventListeners();
