'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
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
  Library,
  Compass,
  Network,
  Hash,
  type LucideIcon,
} from 'lucide-react';
import {
  searchLinkTargets,
  type LinkSearchHit,
} from '@/app/(app)/links/actions';
import type { LinkSourceKind } from '@/lib/types/links';

type Row = {
  label: string;
  href?: string;
  icon: LucideIcon;
  hint?: string;
};

type Section = { label: string; rows: Row[] };

const STATIC_SECTIONS: Section[] = [
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
      { label: 'Library', href: '/library', icon: Library, hint: '→' },
      { label: 'Atlas', href: '/atlas', icon: Compass, hint: '→' },
      { label: 'Map', href: '/map', icon: Network, hint: '→' },
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

const KIND_ICON: Record<LinkSourceKind, LucideIcon> = {
  capture: ScrollText,
  project: Hammer,
  thread: AlignLeft,
  journal_entry: PenLine,
};

const KIND_LABEL: Record<LinkSourceKind, string> = {
  capture: 'Capture',
  project: 'Project',
  thread: 'Thread',
  journal_entry: 'Journal',
};

function hrefFor(hit: LinkSearchHit): string {
  switch (hit.kind) {
    case 'capture':
      return `/capture/${hit.id}`;
    case 'project':
      return `/projects/${hit.id}`;
    case 'thread':
      return `/threads/${hit.id}`;
    case 'journal_entry':
      return `/journal#${hit.id}`;
  }
}

export function CmdPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<LinkSearchHit[]>([]);
  const [, startTransition] = useTransition();

  // Filter the static rows by query so the same UI doubles as a fuzzy
  // navigation jumper (typing "stream" lands you on Stream).
  const filteredStatic = useMemo<Section[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return STATIC_SECTIONS;
    return STATIC_SECTIONS.map((s) => ({
      ...s,
      rows: s.rows.filter((r) => r.label.toLowerCase().includes(q)),
    })).filter((s) => s.rows.length > 0);
  }, [query]);

  useEffect(() => {
    if (open) {
      // Focus the search input after the modal mounts.
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
    // Reset on close.
    /* eslint-disable react-hooks/set-state-in-effect */
    setQuery('');
    setHits([]);
    /* eslint-enable react-hooks/set-state-in-effect */
    return undefined;
  }, [open]);

  // Debounced workspace search across captures + projects + threads + journal.
  useEffect(() => {
    if (!open) return undefined;
    const q = query.trim();
    if (q.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHits([]);
      return undefined;
    }
    const handle = setTimeout(() => {
      startTransition(async () => {
        const results = await searchLinkTargets(q);
        setHits(results);
      });
    }, 140);
    return () => clearTimeout(handle);
  }, [query, open]);

  if (!open) return null;

  function go(href: string) {
    onClose();
    router.push(href);
  }

  // Group hits by kind for the workspace results section.
  const hitsByKind = new Map<LinkSourceKind, LinkSearchHit[]>();
  for (const h of hits) {
    if (!hitsByKind.has(h.kind)) hitsByKind.set(h.kind, []);
    hitsByKind.get(h.kind)!.push(h);
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
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                // Pick the first workspace hit if any; otherwise the first
                // matching nav row.
                const firstHit = hits[0];
                if (firstHit) {
                  e.preventDefault();
                  go(hrefFor(firstHit));
                  return;
                }
                const firstStatic = filteredStatic[0]?.rows[0];
                if (firstStatic?.href) {
                  e.preventDefault();
                  go(firstStatic.href);
                }
              }
            }}
          />
          <kbd>esc</kbd>
        </div>

        <div className="forge-cmd-list">
          {/* Workspace search results — grouped by kind. */}
          {query.trim() && hits.length > 0 && (
            <div>
              <div className="forge-cmd-section">In your workspace</div>
              {[...hitsByKind.entries()].map(([kind, items]) => (
                <div key={kind}>
                  {items.slice(0, 5).map((h) => {
                    const Icon = KIND_ICON[h.kind];
                    return (
                      <button
                        key={`${h.kind}:${h.id}`}
                        type="button"
                        className="forge-cmd-row"
                        onClick={() => go(hrefFor(h))}
                      >
                        <Icon className="forge-cmd-row__ico" size={14} />
                        <span
                          style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            minWidth: 0,
                            flex: 1,
                          }}
                        >
                          {h.title}
                        </span>
                        <span className="forge-cmd-row__arrow">{KIND_LABEL[h.kind]}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}

          {/* Tag jump — "#walking" or "walking" with leading #. */}
          {query.trim().startsWith('#') && query.trim().length > 1 && (
            <div>
              <div className="forge-cmd-section">Tag</div>
              <button
                type="button"
                className="forge-cmd-row"
                onClick={() =>
                  go(`/tags/${encodeURIComponent(query.trim().replace(/^#+/, ''))}`)
                }
              >
                <Hash className="forge-cmd-row__ico" size={14} />
                <span>{query.trim()}</span>
                <span className="forge-cmd-row__arrow">→</span>
              </button>
            </div>
          )}

          {/* Static navigation — filtered by query, plus shown by default. */}
          {filteredStatic.map((section, sIdx) => (
            <div key={section.label}>
              <div className="forge-cmd-section">{section.label}</div>
              {section.rows.map((row, rIdx) => {
                const Icon = row.icon;
                const first = sIdx === 0 && rIdx === 0 && hits.length === 0;
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

          {/* Empty results state when query is non-empty but nothing matches. */}
          {query.trim() && hits.length === 0 && filteredStatic.length === 0 && (
            <div
              className="forge-cmd-section"
              style={{ padding: '24px 18px', textAlign: 'center' }}
            >
              No matches.
            </div>
          )}
        </div>

        <div className="forge-cmd-foot">
          <span>↵ open first match</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}
