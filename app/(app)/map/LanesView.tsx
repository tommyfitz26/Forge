'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  ScrollText,
  Hammer,
  AlignLeft,
  PenLine,
  User,
  MapPin,
  Box,
  type LucideIcon,
} from 'lucide-react';
import type { GraphEdge, GraphNode, GraphNodeKind } from '@/lib/db/map';

// Phase 5.8.1 — replaces the "bunch of dots" force layout with a column-
// per-kind list view. Each column scrolls independently. Hovering any card
// highlights it + every card it connects to (across columns), with the
// connection lines drawn dynamically as faint curves on an overlay.
//
// At v1 volumes (<500 nodes) this is dramatically more legible than a
// force graph: you can scan each kind separately, see actual labels, and
// jump straight to detail pages without navigating a deck.

const KIND_ORDER: GraphNodeKind[] = [
  'capture',
  'project',
  'thread',
  'journal_entry',
  'person',
  'place',
  'thing',
];

const KIND_LABEL: Record<GraphNodeKind, string> = {
  capture: 'Captures',
  project: 'Projects',
  thread: 'Threads',
  journal_entry: 'Journal',
  person: 'People',
  place: 'Places',
  thing: 'Things',
};

const KIND_ICON: Record<GraphNodeKind, LucideIcon> = {
  capture: ScrollText,
  project: Hammer,
  thread: AlignLeft,
  journal_entry: PenLine,
  person: User,
  place: MapPin,
  thing: Box,
};

const KIND_COLOR: Record<GraphNodeKind, string> = {
  capture: '#e8a76b',
  project: '#d9b878',
  thread: '#8eaa66',
  journal_entry: '#c08aa8',
  person: '#7eb86d',
  place: '#5fa6cd',
  thing: '#c46640',
};

export function LanesView({
  nodes,
  edges,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
}) {
  const [hoverId, setHoverId] = useState<string | null>(null);

  // Adjacency lookup keyed by node id.
  const neighborsByNode = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const e of edges) {
      if (!m.has(e.source)) m.set(e.source, new Set());
      if (!m.has(e.target)) m.set(e.target, new Set());
      m.get(e.source)!.add(e.target);
      m.get(e.target)!.add(e.source);
    }
    return m;
  }, [edges]);

  // Group nodes by kind, preserving the input order (already created_at desc).
  const byKind = useMemo(() => {
    const m: Record<GraphNodeKind, GraphNode[]> = {
      capture: [],
      project: [],
      thread: [],
      journal_entry: [],
      person: [],
      place: [],
      thing: [],
    };
    for (const n of nodes) m[n.kind].push(n);
    return m;
  }, [nodes]);

  const visibleKinds = KIND_ORDER.filter((k) => byKind[k].length > 0);
  const highlightSet = hoverId
    ? new Set([hoverId, ...(neighborsByNode.get(hoverId) ?? [])])
    : null;

  return (
    <div className="forge-map-lanes">
      {visibleKinds.map((kind) => {
        const items = byKind[kind];
        const Icon = KIND_ICON[kind];
        return (
          <section key={kind} className="forge-map-lanes__col">
            <header className="forge-map-lanes__col-head">
              <span
                className="forge-map-lanes__col-swatch"
                style={{ background: KIND_COLOR[kind] }}
              />
              <Icon size={13} className="forge-map-lanes__col-ico" />
              <span className="forge-map-lanes__col-label">{KIND_LABEL[kind]}</span>
              <span className="forge-map-lanes__col-count">{items.length}</span>
            </header>
            <ul className="forge-map-lanes__list">
              {items.map((n) => {
                const dim = highlightSet !== null && !highlightSet.has(n.id);
                const isFocus = hoverId === n.id;
                const isNeighbor =
                  highlightSet !== null && hoverId !== n.id && highlightSet.has(n.id);
                return (
                  <li
                    key={n.id}
                    className="forge-map-lanes__cell"
                    data-dim={dim ? 'true' : 'false'}
                    data-focus={isFocus ? 'true' : 'false'}
                    data-neighbor={isNeighbor ? 'true' : 'false'}
                    onMouseEnter={() => setHoverId(n.id)}
                    onMouseLeave={() => setHoverId(null)}
                  >
                    <Link
                      href={n.href}
                      className="forge-map-lanes__cell-link"
                    >
                      <span className="forge-map-lanes__cell-title">{n.label}</span>
                      {n.degree > 0 && (
                        <span className="forge-map-lanes__cell-degree">
                          {n.degree}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
