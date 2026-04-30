'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Bell, Plus, PanelRight, Search, Flame, Menu } from 'lucide-react';
import { ThemePicker } from '@/components/ui/theme-picker';
import { CmdPalette } from '@/components/cmd-palette';
import { UnsyncedBadge } from './UnsyncedBadge';
import type { CaptureTab } from '@/components/capture/CaptureModal';
import type { Theme } from '@/lib/theme';

const CRUMB_MAP: Record<string, [string, string]> = {
  '/today': ['Today', ''],
  '/this-week': ['This week', ''],
  '/stream': ['Stream', ''],
  '/top-of-mind': ['Top of mind', ''],
  '/workshop': ['Workshop', ''],
  '/journal': ['Journal', ''],
  '/threads': ['Threads', ''],
  '/scraps': ['Scraps', ''],
  '/archive': ['Archive', ''],
  '/trash': ['Trash', ''],
  '/capture': ['Capture', ''],
};

function deriveCrumb(pathname: string): [string, string] {
  // Exact match first.
  const exact = CRUMB_MAP[pathname];
  if (exact) return exact;
  // Per-segment fallbacks.
  if (pathname.startsWith('/capture/')) return ['Stream', 'Capture detail'];
  if (pathname.startsWith('/review/')) return ['Workshop', 'Weekly review'];
  if (pathname.startsWith('/kinds/')) {
    const k = pathname.split('/')[2] ?? '';
    return ['Kinds', `#${k}`];
  }
  if (pathname.startsWith('/tags/')) {
    const t = pathname.split('/')[2] ?? '';
    return ['Tags', `#${t}`];
  }
  return ['Forge', ''];
}

export function Titlebar({
  email,
  theme,
  onToggleInspector,
  onToggleSidebar,
  onOpenCapture,
}: {
  email: string;
  theme: Theme;
  onToggleInspector: () => void;
  onToggleSidebar: () => void;
  onOpenCapture: (tab?: CaptureTab) => void;
}) {
  const pathname = usePathname();
  const [section, here] = deriveCrumb(pathname);
  const [cmdOpen, setCmdOpen] = useState(false);

  // ⌘K opens the cmd palette anywhere in the app.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdOpen((v) => !v);
      }
      if (e.key === 'Escape') setCmdOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <div className="forge-titlebar">
        <button
          type="button"
          className="forge-icon-btn forge-titlebar__menu"
          onClick={onToggleSidebar}
          aria-label="Open menu"
        >
          <Menu size={16} />
        </button>

        <div className="forge-traffic" data-desktop-only>
          <span /><span /><span />
        </div>

        <div className="forge-brand-mini">
          <Flame className="h-4 w-4" strokeWidth={2.4} />
          <span>Forge</span>
        </div>

        <div className="forge-crumbs">
          <span className="sep">/</span>
          <span>{section}</span>
          {here && <><span className="sep">·</span><span className="here">{here}</span></>}
        </div>

        <div className="forge-titlebar__right">
          <span data-desktop-only>
            <ThemePicker initial={theme} />
          </span>

          <button
            type="button"
            className="forge-cmdk"
            onClick={() => setCmdOpen(true)}
            title="Search or run command"
            data-desktop-only
          >
            <Search size={13} />
            <span>Find or summon…</span>
            <kbd>⌘ K</kbd>
          </button>

          <span data-desktop-only>
            <UnsyncedBadge />
          </span>

          <button
            type="button"
            className="forge-icon-btn"
            title="Quick capture (⌘N)"
            onClick={() => onOpenCapture()}
          >
            <Plus size={14} />
          </button>

          <span
            className="forge-icon-btn"
            aria-disabled
            title="Notifications (placeholder)"
            data-desktop-only
          >
            <Bell size={14} />
          </span>

          <button
            type="button"
            className="forge-icon-btn"
            onClick={onToggleInspector}
            title="Toggle inspector"
            data-desktop-only
          >
            <PanelRight size={14} />
          </button>

          <span className="forge-email">{email}</span>
        </div>
      </div>

      <CmdPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
    </>
  );
}
