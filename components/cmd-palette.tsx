'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Home,
  Calendar,
  Inbox,
  Bookmark,
  Hammer,
  PenLine,
  AlignLeft,
  ScrollText,
  Plus,
  Lightbulb,
  CircleAlert,
  Eye,
  Search as SearchIcon,
  Archive,
  Trash2,
  type LucideIcon,
} from 'lucide-react';

type Row = {
  label: string;
  href?: string;
  icon: LucideIcon;
  hint?: string;
};

type Section = { label: string; rows: Row[] };

const SECTIONS: Section[] = [
  {
    label: 'Quick navigation',
    rows: [
      { label: 'Today', href: '/today', icon: Home, hint: '↵' },
      { label: 'This week', href: '/this-week', icon: Calendar, hint: '→' },
      { label: 'Stream', href: '/stream', icon: Inbox, hint: '→' },
      { label: 'Top of mind', href: '/top-of-mind', icon: Bookmark, hint: '→' },
      { label: 'Workshop', href: '/workshop', icon: Hammer, hint: '→' },
      { label: 'Journal', href: '/journal', icon: PenLine, hint: '→' },
      { label: 'Threads', href: '/threads', icon: AlignLeft, hint: '→' },
      { label: 'Scraps', href: '/scraps', icon: ScrollText, hint: '→' },
    ],
  },
  {
    label: 'Quick actions',
    rows: [
      { label: 'New capture', href: '/capture', icon: Plus, hint: '⌘N' },
      { label: 'Archive', href: '/archive', icon: Archive, hint: '→' },
      { label: 'Trash', href: '/trash', icon: Trash2, hint: '→' },
    ],
  },
  {
    label: 'Kinds',
    rows: [
      { label: '#idea', href: '/kinds/idea', icon: Lightbulb, hint: '→' },
      { label: '#problem', href: '/kinds/problem', icon: CircleAlert, hint: '→' },
      { label: '#observation', href: '/kinds/observation', icon: Eye, hint: '→' },
      { label: '#research', href: '/kinds/research', icon: SearchIcon, hint: '→' },
    ],
  },
];

export function CmdPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      // Focus the search input after the modal mounts.
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open]);

  if (!open) return null;

  function go(href: string) {
    onClose();
    router.push(href);
  }

  return (
    <div className="forge-modal-bg" onClick={onClose}>
      <div className="forge-modal" onClick={(e) => e.stopPropagation()}>
        <div className="forge-cmd-search">
          <SearchIcon className="forge-cmd-search__icon" size={16} />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search the workspace, or run a command…"
            autoComplete="off"
          />
          <kbd>esc</kbd>
        </div>

        <div className="forge-cmd-list">
          {SECTIONS.map((section, sIdx) => (
            <div key={section.label}>
              <div className="forge-cmd-section">{section.label}</div>
              {section.rows.map((row, rIdx) => {
                const Icon = row.icon;
                const first = sIdx === 0 && rIdx === 0;
                return (
                  <button
                    key={row.label}
                    type="button"
                    className="forge-cmd-row"
                    data-first={first ? 'true' : 'false'}
                    onClick={() => row.href && go(row.href)}
                  >
                    <Icon className="forge-cmd-row__ico" size={14} />
                    <span>{row.label}</span>
                    {row.hint && <span className="forge-cmd-row__arrow">{row.hint}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="forge-cmd-foot">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}
