'use client';

import { useTransition } from 'react';
import { setThemeAction } from './theme-action';
import type { Theme } from '@/lib/theme';

export function ThemePicker({ initial }: { initial: Theme }) {
  const [pending, startTransition] = useTransition();

  function pick(theme: Theme) {
    if (theme === initial && document.documentElement.getAttribute('data-theme') === (theme === 'graphite' ? null : theme)) return;
    // Update the DOM immediately for visual responsiveness.
    if (theme === 'graphite') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
    // Mirror to localStorage as a backup if the cookie is dropped.
    try { localStorage.setItem('forge_theme', theme); } catch { /* private mode */ }
    // Persist via cookie so SSR renders the right palette next request.
    startTransition(() => {
      void setThemeAction(theme);
    });
  }

  return (
    <div className="theme-picker" title="Color scheme">
      <span className="theme-picker__label">Theme</span>
      <button
        type="button"
        className="theme-swatch"
        data-active={initial === 'graphite' ? 'true' : 'false'}
        title="Graphite — cool dark + ember (default)"
        onClick={() => pick('graphite')}
        disabled={pending}
      >
        <span style={{ background: 'linear-gradient(135deg, #e8a76b 50%, #1c1f24 50%)' }} />
      </button>
      <button
        type="button"
        className="theme-swatch"
        data-active={initial === 'light' ? 'true' : 'false'}
        title="Light — cool paper + copper"
        onClick={() => pick('light')}
        disabled={pending}
      >
        <span style={{ background: 'linear-gradient(135deg, #c66a2a 50%, #f6f7f9 50%)' }} />
      </button>
    </div>
  );
}
