import Image from 'next/image';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import {
  Headphones,
  Image as ImageIcon,
  FileText,
  Sparkles,
  ExternalLink,
  type LucideIcon,
} from 'lucide-react';
import {
  listLibraryCaptures,
  listProcessItems,
  type LibraryItem,
  type ProcessItem,
} from '@/lib/db/library';
import type { CaptureKind } from '@/lib/capture/kinds';

type ShelfId = 'audio' | 'visual' | 'text' | 'process';
type SearchParams = Promise<{ shelf?: string }>;

const SHELVES: Array<{ id: ShelfId; label: string; icon: LucideIcon }> = [
  { id: 'audio', label: 'Audio', icon: Headphones },
  { id: 'visual', label: 'Visual', icon: ImageIcon },
  { id: 'text', label: 'Text', icon: FileText },
  { id: 'process', label: 'Process', icon: Sparkles },
];

function isShelf(s: string | undefined): s is ShelfId {
  return SHELVES.some((sh) => sh.id === s);
}

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const requested: ShelfId | null = isShelf(sp.shelf) ? sp.shelf : null;

  const [items, processItems] = await Promise.all([
    listLibraryCaptures(),
    listProcessItems(),
  ]);

  const counts = {
    audio: items.filter((i) => i.shelf === 'audio').length,
    visual: items.filter((i) => i.shelf === 'visual').length,
    text: items.filter((i) => i.shelf === 'text').length,
    process: processItems.length,
  };

  // Default to first non-empty shelf so a user with only photos lands on
  // Visual instead of an empty Audio.
  const active: ShelfId =
    requested ??
    (SHELVES.find((s) => counts[s.id] > 0)?.id ?? 'audio');

  const totalAll = counts.audio + counts.visual + counts.text + counts.process;

  return (
    <div className="space-y-6">
      <div className="forge-page-header">
        <h1>Library</h1>
        <span className="forge-page-header__meta">
          {totalAll === 0
            ? 'nothing saved yet'
            : `${totalAll} ${totalAll === 1 ? 'item' : 'items'}, kept for reference`}
        </span>
      </div>

      <nav className="forge-proj-tabs">
        {SHELVES.map((s) => {
          const Icon = s.icon;
          const ct = counts[s.id];
          return (
            <Link
              key={s.id}
              href={`/library?shelf=${s.id}`}
              className="forge-proj-tab"
              data-active={active === s.id ? 'true' : 'false'}
            >
              <Icon size={13} style={{ marginRight: 6, marginBottom: -1 }} />
              {s.label}
              {ct > 0 && <span className="ct">{ct}</span>}
            </Link>
          );
        })}
      </nav>

      {active === 'audio' && (
        <ShelfList
          items={items.filter((i) => i.shelf === 'audio')}
          empty="No voice notes saved as research yet. Voice captures classified as research land here automatically."
        />
      )}

      {active === 'visual' && (
        <VisualGrid items={items.filter((i) => i.shelf === 'visual')} />
      )}

      {active === 'text' && (
        <ShelfList
          items={items.filter((i) => i.shelf === 'text')}
          empty="No web clips or research-kind text captures yet."
        />
      )}

      {active === 'process' && <ProcessList items={processItems} />}
    </div>
  );
}

function ShelfList({
  items,
  empty,
}: {
  items: LibraryItem[];
  empty: string;
}) {
  if (items.length === 0) {
    return (
      <div
        className="forge-empty rounded-xl border"
        style={{ borderColor: 'var(--line)', background: 'var(--bg-2)' }}
      >
        <div className="forge-empty__msg">{empty}</div>
      </div>
    );
  }

  return (
    <div className="forge-list-card">
      {items.map((c) => (
        <Link
          key={c.id}
          href={`/capture/${c.id}`}
          className="forge-list-row"
          style={{ textDecoration: 'none', color: 'inherit' }}
        >
          <div className="forge-list-row__icon">
            <FileText size={14} />
          </div>
          <div className="forge-list-row__body">
            <div className="forge-list-row__title">{c.title}</div>
            <div className="forge-list-row__preview">
              {previewText(c.content) || '—'}
            </div>
            {c.source_url && (
              <div
                className="forge-list-row__preview"
                style={{ marginTop: 4 }}
              >
                <ExternalLink
                  size={11}
                  style={{ marginRight: 4, marginBottom: -1 }}
                />
                <code style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>
                  {tryHostname(c.source_url)}
                </code>
              </div>
            )}
          </div>
          <div className="forge-list-row__right">
            <span className="forge-list-row__when">
              {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
            </span>
            <span className={kindPillClass(c.kind)}>#{c.kind}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}

function VisualGrid({ items }: { items: LibraryItem[] }) {
  if (items.length === 0) {
    return (
      <div
        className="forge-empty rounded-xl border"
        style={{ borderColor: 'var(--line)', background: 'var(--bg-2)' }}
      >
        <div className="forge-empty__msg">
          No photo captures yet. The Visual shelf collects every photo capture.
        </div>
      </div>
    );
  }

  return (
    <div className="forge-library__visual">
      {items.map((c) => (
        <Link
          key={c.id}
          href={`/capture/${c.id}`}
          className="forge-library__visual-cell"
          style={{ textDecoration: 'none', color: 'inherit' }}
        >
          <div className="forge-library__visual-thumb">
            {c.photoUrl ? (
              <Image
                src={c.photoUrl}
                alt={c.title}
                width={400}
                height={300}
                unoptimized
                style={{ objectFit: 'cover', width: '100%', height: '100%' }}
              />
            ) : (
              <div className="forge-library__visual-placeholder">
                <ImageIcon size={20} />
              </div>
            )}
          </div>
          <div className="forge-library__visual-meta">
            <div className="forge-library__visual-title">{c.title}</div>
            <div className="forge-library__visual-when">
              {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

function ProcessList({ items }: { items: ProcessItem[] }) {
  if (items.length === 0) {
    return (
      <div
        className="forge-empty rounded-xl border"
        style={{ borderColor: 'var(--line)', background: 'var(--bg-2)' }}
      >
        <div className="forge-empty__msg">
          No AI research outputs yet. Idea / research captures auto-research in
          the background; the result lands here when finished.
        </div>
      </div>
    );
  }

  return (
    <div className="forge-library__process">
      {items.map((p) => (
        <Link
          key={p.research_id}
          href={`/capture/${p.capture_id}`}
          className="forge-library__process-card"
          style={{ textDecoration: 'none', color: 'inherit' }}
        >
          <header className="forge-library__process-head">
            <Sparkles size={13} className="forge-library__process-ico" />
            <span className="forge-library__process-kind">{p.capture_kind}</span>
            <span className="forge-library__process-when">
              {formatDistanceToNow(new Date(p.generated_at), { addSuffix: true })}
            </span>
          </header>
          <div className="forge-library__process-title">{p.capture_title}</div>
          {p.market_context && (
            <p className="forge-library__process-deck">
              {trim(p.market_context, 220)}
            </p>
          )}
          <div className="forge-library__process-meta">
            {p.competitor_count} competitors · {p.angle_count} angles
            {p.confidence && <> · {p.confidence} confidence</>}
            {typeof p.sources_count === 'number' && (
              <> · {p.sources_count} sources</>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}

function previewText(s: string): string {
  const oneLine = s.replace(/\s+/g, ' ').trim();
  return oneLine.length > 140 ? oneLine.slice(0, 140) + '…' : oneLine;
}

function trim(s: string, max: number): string {
  const t = s.trim();
  return t.length > max ? t.slice(0, max) + '…' : t;
}

function tryHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function kindPillClass(kind: CaptureKind): string {
  switch (kind) {
    case 'idea':
      return 'forge-tag-pill';
    case 'problem':
      return 'forge-tag-pill forge-tag-pill--plum';
    case 'observation':
      return 'forge-tag-pill forge-tag-pill--sky';
    case 'research':
      return 'forge-tag-pill forge-tag-pill--gold';
  }
}
