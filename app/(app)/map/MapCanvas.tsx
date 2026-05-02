'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
// windowDays is fetched at the page level and passed in only so the canvas
// can recompute when it changes (the page swaps the URL param).
import {
  forceCenter,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceCollide,
  type Simulation,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from 'd3-force';
import type { GraphEdge, GraphNode, GraphNodeKind, MapWindow } from '@/lib/db/map';

// Phase 5.8 — d3-force on canvas. Renders the user's knowledge graph with
// pan/zoom, hover highlight, click-to-select (shows a deck on the right
// with the selected node's title + link to its detail page), kind toggles,
// and a date-window slider that round-trips via ?window=.
//
// Canvas (not SVG) for perf at hundreds of nodes. d3-force only — no
// d3-selection/zoom/drag, since vanilla mouse handlers + manual transforms
// are simpler than wiring up the full d3 surface.

// Canvas-time RGB for compositing. CSS vars don't resolve in canvas
// drawImage paths, so we mirror the palette here. Keep in sync with
// app/globals.css.
const KIND_COLOR_RGB: Record<GraphNodeKind, string> = {
  capture: '#e8a76b',
  project: '#d9b878',
  thread: '#8eaa66',
  journal_entry: '#c08aa8',
  person: '#7eb86d',
  place: '#5fa6cd',
  thing: '#c46640',
};

const KIND_LABEL: Record<GraphNodeKind, string> = {
  capture: 'Captures',
  project: 'Projects',
  thread: 'Threads',
  journal_entry: 'Journal',
  person: 'People',
  place: 'Places',
  thing: 'Things',
};

const ALL_KINDS: GraphNodeKind[] = [
  'capture',
  'project',
  'thread',
  'journal_entry',
  'person',
  'place',
  'thing',
];

type SimNode = SimulationNodeDatum & GraphNode;
type SimEdge = SimulationLinkDatum<SimNode> & { kind: 'link' | 'mention' };

export function MapCanvas({
  nodes,
  edges,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Reserved — page-level window control owns the URL. */
  windowDays?: MapWindow;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<Simulation<SimNode, SimEdge> | null>(null);
  const stateRef = useRef({
    transform: { x: 0, y: 0, scale: 1 },
    hoverId: null as string | null,
    selectedId: null as string | null,
    isDragging: false,
    dragStart: { x: 0, y: 0 },
    width: 0,
    height: 0,
  });

  const [activeKinds, setActiveKinds] = useState<Set<GraphNodeKind>>(
    () => new Set(ALL_KINDS),
  );
  const [selected, setSelected] = useState<GraphNode | null>(null);

  // Memoize the filtered graph so the simulation isn't rebuilt on every render.
  const filteredGraph = useMemo(() => {
    const includedNodes = nodes.filter((n) => activeKinds.has(n.kind));
    const includedNodeIds = new Set(includedNodes.map((n) => n.id));
    const includedEdges = edges.filter(
      (e) => includedNodeIds.has(e.source) && includedNodeIds.has(e.target),
    );
    return { nodes: includedNodes, edges: includedEdges };
  }, [nodes, edges, activeKinds]);

  // Counts per kind for the filter chips (always reflect the full graph,
  // not the filtered one — so the user sees what's available to toggle).
  const kindCounts = useMemo(() => {
    const counts: Record<GraphNodeKind, number> = {
      capture: 0,
      project: 0,
      thread: 0,
      journal_entry: 0,
      person: 0,
      place: 0,
      thing: 0,
    };
    for (const n of nodes) counts[n.kind] += 1;
    return counts;
  }, [nodes]);

  // Simulation lifecycle — rebuild when the filtered set changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const resize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      stateRef.current.width = w;
      stateRef.current.height = h;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    const simNodes: SimNode[] = filteredGraph.nodes.map((n) => ({ ...n }));
    const simEdges: SimEdge[] = filteredGraph.edges.map((e) => ({
      source: e.source,
      target: e.target,
      kind: e.kind,
    }));

    const sim = forceSimulation<SimNode, SimEdge>(simNodes)
      .force(
        'link',
        forceLink<SimNode, SimEdge>(simEdges)
          .id((d) => d.id)
          .distance((d) => (d.kind === 'mention' ? 60 : 90))
          .strength(0.6),
      )
      .force('charge', forceManyBody<SimNode>().strength(-180))
      .force(
        'center',
        forceCenter<SimNode>(
          stateRef.current.width / 2,
          stateRef.current.height / 2,
        ),
      )
      .force(
        'collide',
        forceCollide<SimNode>().radius((d) => nodeRadius(d) + 4),
      );

    simRef.current = sim;

    const ctx = canvas.getContext('2d');
    if (!ctx) return () => {};

    const render = () => {
      const { width, height } = stateRef.current;
      const { x, y, scale } = stateRef.current.transform;
      ctx.clearRect(0, 0, width, height);

      ctx.save();
      ctx.translate(x, y);
      ctx.scale(scale, scale);

      // Edges
      ctx.lineWidth = 1 / scale;
      ctx.strokeStyle = 'rgba(170, 170, 170, 0.25)';
      for (const e of simEdges) {
        const s = e.source as SimNode;
        const t = e.target as SimNode;
        if (s.x == null || s.y == null || t.x == null || t.y == null) continue;
        const dim =
          stateRef.current.hoverId &&
          s.id !== stateRef.current.hoverId &&
          t.id !== stateRef.current.hoverId;
        ctx.strokeStyle = dim
          ? 'rgba(170, 170, 170, 0.07)'
          : e.kind === 'mention'
            ? 'rgba(232, 167, 107, 0.35)'
            : 'rgba(170, 170, 170, 0.35)';
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(t.x, t.y);
        ctx.stroke();
      }

      // Nodes
      for (const n of simNodes) {
        if (n.x == null || n.y == null) continue;
        const r = nodeRadius(n);
        const dim =
          stateRef.current.hoverId !== null &&
          n.id !== stateRef.current.hoverId &&
          !isNeighbor(n.id, stateRef.current.hoverId, simEdges);
        ctx.globalAlpha = dim ? 0.25 : 1;
        ctx.fillStyle = KIND_COLOR_RGB[n.kind];
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.fill();
        if (n.id === stateRef.current.selectedId) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2 / scale;
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      // Labels — only show for nodes the user is hovering or has selected,
      // or nodes with high degree (the "important" ones).
      ctx.font = `${12 / scale}px var(--serif), Georgia, serif`;
      ctx.fillStyle = '#dcdde0';
      ctx.textBaseline = 'middle';
      for (const n of simNodes) {
        if (n.x == null || n.y == null) continue;
        const isFocus = n.id === stateRef.current.hoverId || n.id === stateRef.current.selectedId;
        const isHigh = n.degree >= 3;
        if (!isFocus && !isHigh) continue;
        ctx.globalAlpha = isFocus ? 1 : 0.6;
        ctx.fillText(truncate(n.label, 32), n.x + nodeRadius(n) + 4, n.y);
        ctx.globalAlpha = 1;
      }

      ctx.restore();
    };

    sim.on('tick', render);
    render();

    // Mouse interactions
    function nodeAt(clientX: number, clientY: number): SimNode | null {
      const rect = canvas!.getBoundingClientRect();
      const { x, y, scale } = stateRef.current.transform;
      const cx = (clientX - rect.left - x) / scale;
      const cy = (clientY - rect.top - y) / scale;
      let best: SimNode | null = null;
      let bestDist = Infinity;
      for (const n of simNodes) {
        if (n.x == null || n.y == null) continue;
        const dx = cx - n.x;
        const dy = cy - n.y;
        const d2 = dx * dx + dy * dy;
        const r = nodeRadius(n) + 4;
        if (d2 < r * r && d2 < bestDist) {
          bestDist = d2;
          best = n;
        }
      }
      return best;
    }

    const onMove = (e: MouseEvent) => {
      if (stateRef.current.isDragging) {
        const dx = e.clientX - stateRef.current.dragStart.x;
        const dy = e.clientY - stateRef.current.dragStart.y;
        stateRef.current.transform.x += dx;
        stateRef.current.transform.y += dy;
        stateRef.current.dragStart = { x: e.clientX, y: e.clientY };
        render();
        return;
      }
      const hit = nodeAt(e.clientX, e.clientY);
      const newId = hit?.id ?? null;
      if (newId !== stateRef.current.hoverId) {
        stateRef.current.hoverId = newId;
        canvas!.style.cursor = newId ? 'pointer' : 'grab';
        render();
      }
    };

    const onDown = (e: MouseEvent) => {
      const hit = nodeAt(e.clientX, e.clientY);
      if (hit) return; // click handled in mouseup
      stateRef.current.isDragging = true;
      stateRef.current.dragStart = { x: e.clientX, y: e.clientY };
      canvas!.style.cursor = 'grabbing';
    };

    const onUp = (e: MouseEvent) => {
      if (stateRef.current.isDragging) {
        stateRef.current.isDragging = false;
        canvas!.style.cursor = 'grab';
        return;
      }
      const hit = nodeAt(e.clientX, e.clientY);
      stateRef.current.selectedId = hit?.id ?? null;
      setSelected(hit ?? null);
      render();
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas!.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      const t = stateRef.current.transform;
      const newScale = Math.max(0.2, Math.min(4, t.scale * factor));
      // Zoom toward the mouse pointer.
      t.x = px - (px - t.x) * (newScale / t.scale);
      t.y = py - (py - t.y) * (newScale / t.scale);
      t.scale = newScale;
      render();
    };

    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mousedown', onDown);
    window.addEventListener('mouseup', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.style.cursor = 'grab';

    return () => {
      sim.stop();
      ro.disconnect();
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mousedown', onDown);
      window.removeEventListener('mouseup', onUp);
      canvas.removeEventListener('wheel', onWheel);
    };
  }, [filteredGraph]);

  function toggleKind(k: GraphNodeKind) {
    setActiveKinds((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  return (
    <div className="forge-map__layout">
      <div className="forge-map__chip-row" data-context="graph-toggles">
        {ALL_KINDS.map((k) => (
          <button
            key={k}
            type="button"
            className="forge-map__chip"
            data-active={activeKinds.has(k) ? 'true' : 'false'}
            onClick={() => toggleKind(k)}
          >
            <span
              className="forge-map__chip-swatch"
              style={{ background: KIND_COLOR_RGB[k] }}
            />
            {KIND_LABEL[k]}
            {kindCounts[k] > 0 && (
              <span className="forge-map__chip-count">{kindCounts[k]}</span>
            )}
          </button>
        ))}
      </div>

      <div className="forge-map__stage">
        <div ref={containerRef} className="forge-map__canvas-wrap">
          <canvas ref={canvasRef} />
        </div>
        {selected && (
          <aside className="forge-map__deck">
            <div className="forge-map__deck-kind">{KIND_LABEL[selected.kind]}</div>
            <h3 className="forge-map__deck-title">{selected.label}</h3>
            <div className="forge-map__deck-meta">
              {selected.degree} {selected.degree === 1 ? 'connection' : 'connections'}
            </div>
            <Link
              href={selected.href}
              className="forge-btn forge-btn--primary"
              style={{ marginTop: 14 }}
            >
              Open
            </Link>
          </aside>
        )}
      </div>
    </div>
  );
}

function nodeRadius(n: SimNode): number {
  return 4 + Math.min(8, Math.sqrt(n.degree) * 2);
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}

function isNeighbor(id: string, otherId: string, edges: SimEdge[]): boolean {
  for (const e of edges) {
    const sId = (e.source as SimNode).id ?? (e.source as unknown as string);
    const tId = (e.target as SimNode).id ?? (e.target as unknown as string);
    if (sId === id && tId === otherId) return true;
    if (tId === id && sId === otherId) return true;
  }
  return false;
}
