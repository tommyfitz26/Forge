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
import {
  gradientCssForKey,
  gradientKeyForKind,
  type CoverGradientKey,
} from '@/lib/types/projects';
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
  ],
};

export type SidebarProject = {
  id: string;
  title: string;
  kind_seed: CaptureKind | null;
  cover_gradient_key: CoverGradientKey | null;
};

export function Sidebar({ projects = [] }: { projects?: SidebarProject[] }) {
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

      {/* Tags — empty until 4.3.4 */}
      <div className="forge-nav-group">
        <div className="forge-nav-label">Tags</div>
        <div className="forge-nav-empty">
          <Hash size={12} />
          <span>Tagging unlocks here</span>
        </div>
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
