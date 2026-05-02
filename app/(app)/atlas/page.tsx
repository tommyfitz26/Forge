import Link from 'next/link';
import { User, MapPin, Box, Compass, type LucideIcon } from 'lucide-react';
import { listEntities } from '@/lib/db/atlas';
import type { Entity } from '@/lib/types/atlas';
import type { EntityKind } from '@/lib/ai/tasks';

type SearchParams = Promise<{ kind?: string }>;

const TABS: Array<{ id: EntityKind; label: string; icon: LucideIcon }> = [
  { id: 'person', label: 'People', icon: User },
  { id: 'place', label: 'Places', icon: MapPin },
  { id: 'thing', label: 'Things', icon: Box },
];

function isKind(s: string | undefined): s is EntityKind {
  return TABS.some((t) => t.id === s);
}

const KIND_ICON: Record<EntityKind, LucideIcon> = {
  person: User,
  place: MapPin,
  thing: Box,
};

export default async function AtlasPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const all = await listEntities({ limit: 500 });

  const counts = {
    person: all.filter((e) => e.kind === 'person').length,
    place: all.filter((e) => e.kind === 'place').length,
    thing: all.filter((e) => e.kind === 'thing').length,
  };

  // Default to first non-empty tab so an empty Atlas doesn't land on People.
  const requested: EntityKind | null = isKind(sp.kind) ? sp.kind : null;
  const active: EntityKind =
    requested ?? (TABS.find((t) => counts[t.id] > 0)?.id ?? 'person');
  const items = all.filter((e) => e.kind === active);

  return (
    <div className="space-y-6">
      <div className="forge-page-header">
        <h1>Atlas</h1>
        <span className="forge-page-header__meta">
          {all.length === 0
            ? 'no entities yet'
            : `${all.length} ${all.length === 1 ? 'entity' : 'entities'}, surfaced from your captures`}
        </span>
      </div>

      <nav className="forge-proj-tabs">
        {TABS.map((t) => {
          const Icon = t.icon;
          const ct = counts[t.id];
          return (
            <Link
              key={t.id}
              href={`/atlas?kind=${t.id}`}
              className="forge-proj-tab"
              data-active={active === t.id ? 'true' : 'false'}
            >
              <Icon size={13} style={{ marginRight: 6, marginBottom: -1 }} />
              {t.label}
              {ct > 0 && <span className="ct">{ct}</span>}
            </Link>
          );
        })}
      </nav>

      {items.length === 0 ? (
        <div
          className="forge-empty rounded-xl border"
          style={{ borderColor: 'var(--line)', background: 'var(--bg-2)' }}
        >
          <div className="forge-empty__glyph">
            <Compass size={32} className="mx-auto" />
          </div>
          <div className="forge-empty__msg">
            {all.length === 0 ? (
              <>
                Atlas surfaces people, places, and named things you mention in
                captures. Capture something that names a person — Atlas fills
                up automatically.
              </>
            ) : (
              <>No {labelForKind(active).toLowerCase()} mentioned yet.</>
            )}
          </div>
        </div>
      ) : (
        <ul className="forge-atlas__grid">
          {items.map((e) => (
            <EntityCard key={e.id} entity={e} />
          ))}
        </ul>
      )}
    </div>
  );
}

function EntityCard({ entity }: { entity: Entity }) {
  const Icon = KIND_ICON[entity.kind];
  return (
    <li className="forge-atlas__card">
      <Link
        href={`/atlas/${entity.id}`}
        className="forge-atlas__card-link"
      >
        <Icon size={14} className="forge-atlas__card-ico" />
        <div className="forge-atlas__card-body">
          <div className="forge-atlas__card-name">{entity.name}</div>
          <div className="forge-atlas__card-meta">
            {entity.mention_count}{' '}
            {entity.mention_count === 1 ? 'mention' : 'mentions'}
          </div>
        </div>
      </Link>
    </li>
  );
}

function labelForKind(k: EntityKind): string {
  return TABS.find((t) => t.id === k)?.label ?? k;
}
