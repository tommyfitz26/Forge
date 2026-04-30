'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Mounts on a detail page; calls `router.refresh()` on a short interval for
 * the first ~30 seconds after page load so background work that fires after
 * a save (research auto-running, AI link suggestions landing) surfaces
 * without a manual refresh.
 *
 * After the budget runs out, polling stops. Re-arming requires a navigation
 * (which remounts the component).
 *
 * Also closes the loop on the visibility-change case: if the user returns
 * to the tab after several minutes, refreshes once on focus.
 */
export function PostSaveAutoRefresh({
  intervalMs = 5000,
  budgetMs = 30000,
}: {
  intervalMs?: number;
  budgetMs?: number;
}) {
  const router = useRouter();

  useEffect(() => {
    const start = Date.now();
    const tick = setInterval(() => {
      if (Date.now() - start >= budgetMs) {
        clearInterval(tick);
        return;
      }
      router.refresh();
    }, intervalMs);

    function onVisible() {
      if (document.visibilityState === 'visible') router.refresh();
    }
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(tick);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [intervalMs, budgetMs, router]);

  return null;
}
