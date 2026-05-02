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
  Library as LibraryIcon,
  Compass,
  Network,
  Hash,
  Lightbulb,
  CircleAlert,
  Eye,
  Search,
  Archive,
  Trash2,
  Settings,
  Flame,
  ChevronDown,
  type LucideIcon,
} from 'lucide-react';
import {
  gradientCssForKey,
  gradientKeyForKind,
  type CoverGradientKey,
} from '@/lib/types/projects';
import type { TagSummary } from '@/lib/types/tags';
import type { StreakSummary } from '@/lib/types/intentions';
import type { CaptureKind } from '@/lib/capture/kinds';

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
];

const WORKSHOP_FOOTER: Bucket[] = [
  { label: 'Journal', href: '/journal', icon: PenLine },
  { label: 'Threads', href: '/threads', icon: AlignLeft },
  { label: 'Library', href: '/library', icon: LibraryIcon },
  { label: 'Atlas', href: '/atlas', icon: Compass },
  { label: 'Map', href: '/map', icon: Network },
  { label: 'Scraps', href: '/scraps', icon: ScrollText },
];

const KIND_GROUP: Group = {
  label: 'Kinds',
  items: [
    { label: 'idea', href: '/kinds/idea', icon: Lightbulb },
    { label: 'problem', href: '/kinds/problem', icon: CircleAlert },
    { label: 'observation', href: '/kinds/observation', icon: Eye },
    { label: 'research', href: '/kinds/research', icon: Search },
  ],
};

const STORAGE_GROUP: Group = {
  label: 'Storage',
  items: [
    { label: 'Archive', href: '/archive', icon: Archive },
    { label: 'Trash', href: '/trash', icon: Trash2 },
    { label: 'Settings', href: '/settings', icon: Settings },
  ],
};

export type SidebarProject = {
  id: string;
  title: string;
  kind_seed: CaptureKind | null;
  cover_gradient_key: CoverGradientKey | null;
};

export function Sidebar({
  projects = [],
  tags = [],
  streak,
}: {
  projects?: SidebarProject[];
  tags?: TagSummary[];
  streak?: StreakSummary;
}) {
  const pathname = usePathname();
  const streakDays = streak?.current ?? 0;
  // Build a 28-cell grid (4 rows × 7 cols) representing the trailing 28
  // days, oldest-left → newest-right. Lit cells are days the user counted.
  const lit = new Set(streak?.recentActiveDays ?? []);
  const grid: boolean[] = [];
  const cursor = new Date();
  cursor.setDate(cursor.getDate() - 27);
  for (let i = 0; i < 28; i++) {
    grid.push(lit.has(cursor.toISOString().slice(0, 10)));
    cursor.setDate(cursor.getDate() + 1);
  }

  return (
    <aside className="forge-sidebar">
      <Link href="/today" className="forge-workspace">
        <div className="forge-seal">
          <Flame className="h-3.5 w-3.5" strokeWidth={2.5} />
        </div>
        <div className="forge-workspace__name">Forge</div>
        <ChevronDown className="forge-workspace__chev" size={12} />
      </Link>

      {/* Top group — Today / This week / Stream / Top of mind */}
      {GROUPS.map((group, idx) => (
        <div key={group.label ?? idx} className="forge-nav-group">
          {group.label && <div className="forge-nav-label">{group.label}</div>}
          {group.items.map((item) => {
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
          })}
        </div>
      ))}

      {/* Workshop — All projects + project list (real data) + Journal/Threads/Scraps */}
      <div className="forge-nav-group">
        <div className="forge-nav-label">Workshop</div>
        <Link
          href="/workshop"
          className="forge-nav-item"
          data-active={pathname === '/workshop' ? 'true' : 'false'}
        >
          <Hammer size={14} className="forge-nav-item__ico" />
          <span>All projects</span>
          {projects.length > 0 && (
            <span className="forge-nav-item__count">{projects.length}</span>
          )}
        </Link>

        {projects.map((p) => {
          const gradient = (p.cover_gradient_key ?? gradientKeyForKind(p.kind_seed)) as CoverGradientKey;
          const href = `/projects/${p.id}`;
          const active = pathname === href || pathname.startsWith(href + '/');
          return (
            <Link
              key={p.id}
              href={href}
              className="forge-nav-item"
              data-active={active ? 'true' : 'false'}
              style={{ paddingLeft: 26 }}
            >
              <span
                aria-hidden
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: gradientCssForKey(gradient),
                  flexShrink: 0,
                }}
              />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {p.title}
              </span>
            </Link>
          );
        })}

        {WORKSHOP_FOOTER.map((item) => {
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
            </Link>
          );
        })}
      </div>

      {/* Kinds */}
      <div className="forge-nav-group">
        <div className="forge-nav-label">{KIND_GROUP.label}</div>
        {KIND_GROUP.items.map((item) => {
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
            </Link>
          );
        })}
      </div>

      {/* Tags — populated from real tag usage in Phase 4.3.4. */}
      <div className="forge-nav-group">
        <div className="forge-nav-label">Tags</div>
        {tags.length === 0 ? (
          <div className="forge-nav-empty">
            <Hash size={12} />
            <span>Tag a journal entry to seed</span>
          </div>
        ) : (
          tags.map((t) => {
            const href = `/tags/${encodeURIComponent(t.slug)}`;
            const active = pathname === href;
            return (
              <Link
                key={t.slug}
                href={href}
                className="forge-nav-item"
                data-active={active ? 'true' : 'false'}
              >
                <Hash size={14} className="forge-nav-item__ico" />
                <span>{t.slug}</span>
                {t.count > 0 && <span className="forge-nav-item__count">{t.count}</span>}
              </Link>
            );
          })
        )}
      </div>

      {/* Storage */}
      <div className="forge-nav-group">
        <div className="forge-nav-label">{STORAGE_GROUP.label}</div>
        {STORAGE_GROUP.items.map((item) => {
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
            </Link>
          );
        })}
      </div>

      <div className="forge-nav-group">
        <div className="forge-nav-label">Practice</div>
        <div className="forge-practice">
          <div className="forge-practice__lbl">Day streak</div>
          <div className="forge-practice__num">{streakDays}</div>
          <div className="forge-practice__sub">
            {streakDays === 1 ? 'day in a row' : 'days in a row'}
          </div>
          <div className="forge-practice__grid" aria-label="Last 28 days">
            {grid.map((on, i) => (
              <div key={i} data-on={on ? 'true' : 'false'} />
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}
