'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Titlebar } from './Titlebar';
import { InspectorRouter, type InspectorContext } from './InspectorRouter';
import { CaptureModal, type CaptureTab } from '@/components/capture/CaptureModal';
import type { Theme } from '@/lib/theme';

const INSPECTOR_KEY = 'forge_inspector_open';

export function AppShell({
  email,
  theme,
  inspectorCtx,
  children,
}: {
  email: string;
  theme: Theme;
  inspectorCtx: InspectorContext;
  children: ReactNode;
}) {
  // Inspector is open by default on desktop; persists across sessions via
  // localStorage. On mobile the inspector hides entirely (CSS) regardless
  // of this flag.
  const [inspectorOpen, setInspectorOpen] = useState(true);
  // Sidebar starts closed on mobile; on desktop the CSS keeps it always
  // visible regardless of this flag.
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureTab, setCaptureTab] = useState<CaptureTab | undefined>(undefined);

  useEffect(() => {
    // localStorage is sync-only at use-site but reading it during render would
    // hydrate-mismatch. Same pattern as components/layout/UnsyncedBadge.tsx.
    try {
      const stored = localStorage.getItem(INSPECTOR_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (stored === 'false') setInspectorOpen(false);
    } catch {
      /* private mode */
    }
  }, []);

  // Global ⌘N to open the capture composer.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        setCaptureTab(undefined);
        setCaptureOpen(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Esc closes the mobile sidebar drawer.
  useEffect(() => {
    if (!sidebarOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setSidebarOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sidebarOpen]);

  function toggleInspector() {
    setInspectorOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(INSPECTOR_KEY, String(next));
      } catch {
        /* private mode */
      }
      return next;
    });
  }

  const openCapture = useCallback((tab?: CaptureTab) => {
    setCaptureTab(tab);
    setCaptureOpen(true);
  }, []);

  const closeCapture = useCallback(() => {
    setCaptureOpen(false);
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  const closeSidebar = useCallback(() => {
    setSidebarOpen(false);
  }, []);

  return (
    <div
      className="forge-shell"
      data-inspector={inspectorOpen ? 'open' : 'closed'}
      data-sidebar={sidebarOpen ? 'open' : 'closed'}
      onClickCapture={(e) => {
        // On mobile, tapping any link inside the sidebar drawer closes it.
        // We listen on capture so the link's own navigation still runs.
        if (!sidebarOpen) return;
        const target = e.target as HTMLElement | null;
        if (!target) return;
        const link = target.closest('a');
        if (link && link.closest('.forge-sidebar')) {
          setSidebarOpen(false);
        }
      }}
    >
      <Titlebar
        email={email}
        theme={theme}
        onToggleInspector={toggleInspector}
        onToggleSidebar={toggleSidebar}
        onOpenCapture={openCapture}
      />
      {children}
      <InspectorRouter open={inspectorOpen} ctx={inspectorCtx} />
      {sidebarOpen && (
        <button
          type="button"
          className="forge-shell__backdrop"
          aria-label="Close menu"
          onClick={closeSidebar}
        />
      )}
      <CaptureModal open={captureOpen} initialTab={captureTab} onClose={closeCapture} />
    </div>
  );
}
