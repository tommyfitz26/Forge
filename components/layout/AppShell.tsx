'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Titlebar } from './Titlebar';
import { InspectorRouter } from './InspectorRouter';
import { CaptureModal, type CaptureTab } from '@/components/capture/CaptureModal';
import type { Theme } from '@/lib/theme';

const INSPECTOR_KEY = 'forge_inspector_open';

export function AppShell({
  email,
  theme,
  children,
}: {
  email: string;
  theme: Theme;
  children: ReactNode;
}) {
  // Inspector is open by default; persists across sessions via localStorage.
  // Reads in an effect so SSR is stable.
  const [inspectorOpen, setInspectorOpen] = useState(true);
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

  function toggleInspector() {
    setInspectorOpen((prev) => {
      const next = !prev;
      try { localStorage.setItem(INSPECTOR_KEY, String(next)); } catch { /* private mode */ }
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

  return (
    <div className="forge-shell" data-inspector={inspectorOpen ? 'open' : 'closed'}>
      <Titlebar
        email={email}
        theme={theme}
        onToggleInspector={toggleInspector}
        onOpenCapture={openCapture}
      />
      {children}
      <InspectorRouter open={inspectorOpen} />
      <CaptureModal open={captureOpen} initialTab={captureTab} onClose={closeCapture} />
    </div>
  );
}
