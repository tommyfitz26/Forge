'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, Plus, PanelRight, Search, Flame } from 'lucide-react';
import { ThemePicker } from '@/components/ui/theme-picker';
import { CmdPalette } from '@/components/cmd-palette';
import { UnsyncedBadge } from './UnsyncedBadge';
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
}: {
  email: string;
  theme: Theme;
  onToggleInspector: () => void;
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
        <div className="forge-traffic">
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
          <ThemePicker initial={theme} />

          <button
            type="button"
            className="forge-cmdk"
            onClick={() => setCmdOpen(true)}
            title="Search or run command"
          >
            <Search size={13} />
            <span>Find or summon…</span>
            <kbd>⌘ K</kbd>
          </button>

          <UnsyncedBadge />

          <Link
            href="/capture"
            className="forge-icon-btn"
            title="Quick capture"
          >
            <Plus size={14} />
          </Link>

          <span className="forge-icon-btn" aria-disabled title="Notifications (placeholder)">
            <Bell size={14} />
          </span>

          <button
            type="button"
            className="forge-icon-btn"
            onClick={onToggleInspector}
            title="Toggle inspector"
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
