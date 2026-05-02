import Link from 'next/link';
import { Compass } from 'lucide-react';
import { getKnowledgeGraph, type MapWindow } from '@/lib/db/map';
import { LanesView } from './LanesView';
import { MapCanvas } from './MapCanvas';

type SearchParams = Promise<{ window?: string; view?: string }>;

const VIEWS = [
  { id: 'lanes', label: 'Lanes' },
  { id: 'graph', label: 'Graph' },
] as const;
type ViewId = (typeof VIEWS)[number]['id'];

const WINDOWS: Array<{ id: string; label: string; value: MapWindow }> = [
  { id: '30', label: 'Last 30d', value: 30 },
  { id: '90', label: 'Last 90d', value: 90 },
  { id: 'all', label: 'All time', value: 'all' },
];

function parseWindow(s: string | undefined): MapWindow {
  if (s === '30') return 30 as const;
  if (s === 'all') return 'all' as const;
  return 90 as const;
}

function isView(s: string | undefined): s is ViewId {
  return VIEWS.some((v) => v.id === s);
}

export default async function MapPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const win = parseWindow(sp.window);
  const view: ViewId = isView(sp.view) ? sp.view : 'lanes';
  const graph = await getKnowledgeGraph(win);

  // Preserve view + window when switching either control.
  const winQs = (w: string) => `?view=${view}&window=${w}`;
  const viewQs = (v: ViewId) => `?view=${v}&window=${graph.windowDays}`;

  return (
    <div className="forge-map">
      <div className="forge-page-header">
        <h1>Map</h1>
        <span className="forge-page-header__meta">
          {graph.nodes.length} {graph.nodes.length === 1 ? 'node' : 'nodes'} ·{' '}
          {graph.edges.length} {graph.edges.length === 1 ? 'edge' : 'edges'}
        </span>
      </div>

      <div className="forge-map__controls">
        <nav className="forge-proj-tabs forge-map__view-tabs">
          {VIEWS.map((v) => (
            <Link
              key={v.id}
              href={viewQs(v.id)}
              className="forge-proj-tab"
              data-active={view === v.id ? 'true' : 'false'}
              prefetch={false}
            >
              {v.label}
            </Link>
          ))}
        </nav>
        <div className="forge-map__windows">
          {WINDOWS.map((w) => (
            <Link
              key={w.id}
              href={winQs(w.id)}
              className="forge-map__chip"
              data-active={String(w.value) === String(graph.windowDays) ? 'true' : 'false'}
              prefetch={false}
            >
              {w.label}
            </Link>
          ))}
        </div>
      </div>

      {graph.nodes.length === 0 ? (
        <div
          className="forge-empty rounded-xl border"
          style={{ borderColor: 'var(--line)', background: 'var(--bg-2)' }}
        >
          <div className="forge-empty__glyph">
            <Compass size={32} className="mx-auto" />
          </div>
          <div className="forge-empty__msg">
            Map is empty in this window. Try widening to All time, or capture
            more material — projects, threads, journal entries, and entities
            all appear here as nodes once they exist.
          </div>
        </div>
      ) : view === 'lanes' ? (
        <LanesView nodes={graph.nodes} edges={graph.edges} />
      ) : (
        <MapCanvas
          nodes={graph.nodes}
          edges={graph.edges}
          windowDays={graph.windowDays}
        />
      )}
    </div>
  );
}
