'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  Calendar,
  Inbox,
  Bookmark,
  Hammer,
  PenLine,
  AlignLeft,
  ScrollText,
  Hash,
  Lightbulb,
  CircleAlert,
  Eye,
  Search,
  Archive,
  Trash2,
  Flame,
  ChevronDown,
  type LucideIcon,
} from 'lucide-react';

type Bucket = {
  label: string;
  href: string;
  icon: LucideIcon;
  count?: number;
};

type Group = {
  label?: string;
  items: Bucket[];
};

// All counts are placeholders for Phase 4.1. Real counts come in Phase 4.3
// when the data model lands.
const GROUPS: Group[] = [
  {
    items: [
      { label: 'Today', href: '/today', icon: Home },
      { label: 'This week', href: '/this-week', icon: Calendar },
      { label: 'Stream', href: '/stream', icon: Inbox },
      { label: 'Top of mind', href: '/top-of-mind', icon: Bookmark },
    ],
  },
  {
    label: 'Workshop',
    items: [
      { label: 'All projects', href: '/workshop', icon: Hammer },
      { label: 'Journal', href: '/journal', icon: PenLine },
      { label: 'Threads', href: '/threads', icon: AlignLeft },
      { label: 'Scraps', href: '/scraps', icon: ScrollText },
    ],
  },
  {
    label: 'Kinds',
    items: [
      { label: 'idea', href: '/kinds/idea', icon: Lightbulb },
      { label: 'problem', href: '/kinds/problem', icon: CircleAlert },
      { label: 'observation', href: '/kinds/observation', icon: Eye },
      { label: 'research', href: '/kinds/research', icon: Search },
    ],
  },
  {
    label: 'Tags',
    items: [
      // Free-form tags appear here once tagged. Empty state for Phase 4.1.
    ],
  },
  {
    label: 'Storage',
    items: [
      { label: 'Archive', href: '/archive', icon: Archive },
      { label: 'Trash', href: '/trash', icon: Trash2 },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="forge-sidebar">
      <Link href="/today" className="forge-workspace">
        <div className="forge-seal">
          <Flame className="h-3.5 w-3.5" strokeWidth={2.5} />
        </div>
        <div className="forge-workspace__name">Forge</div>
        <ChevronDown className="forge-workspace__chev" size={12} />
      </Link>

      {GROUPS.map((group, idx) => (
        <div key={group.label ?? idx} className="forge-nav-group">
          {group.label && <div className="forge-nav-label">{group.label}</div>}
          {group.items.length === 0 && group.label === 'Tags' ? (
            <div className="forge-nav-empty">
              <Hash size={12} />
              <span>Tagging unlocks here</span>
            </div>
          ) : (
            group.items.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="forge-nav-item"
                  data-active={active ? 'true' : 'false'}
                >
                  <Icon size={14} className="forge-nav-item__ico" />
                  <span>{item.label}</span>
                  {typeof item.count === 'number' && (
                    <span className="forge-nav-item__count">{item.count}</span>
                  )}
                </Link>
              );
            })
          )}
        </div>
      ))}

      <div className="forge-nav-group">
        <div className="forge-nav-label">Practice</div>
        <div className="forge-practice">
          <div className="forge-practice__lbl">Day streak</div>
          <div className="forge-practice__num">0</div>
          <div className="forge-practice__sub">days in a row</div>
          <div className="forge-practice__grid">
            {Array.from({ length: 28 }).map((_, i) => (
              <div key={i} />
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}
