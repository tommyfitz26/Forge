'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Titlebar } from './Titlebar';
import { InspectorRouter } from './InspectorRouter';
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

  function toggleInspector() {
    setInspectorOpen((prev) => {
      const next = !prev;
      try { localStorage.setItem(INSPECTOR_KEY, String(next)); } catch { /* private mode */ }
      return next;
    });
  }

  return (
    <div className="forge-shell" data-inspector={inspectorOpen ? 'open' : 'closed'}>
      <Titlebar
        email={email}
        theme={theme}
        onToggleInspector={toggleInspector}
      />
      {children}
      <InspectorRouter open={inspectorOpen} />
    </div>
  );
}
