import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import {
  ArrowLeft,
  ScrollText,
  User,
  MapPin,
  Box,
  type LucideIcon,
} from 'lucide-react';
import { getEntity, listMentionsFor } from '@/lib/db/atlas';
import type { EntityKind } from '@/lib/ai/tasks';
import type { CaptureKind } from '@/lib/capture/kinds';

type Params = Promise<{ id: string }>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const KIND_ICON: Record<EntityKind, LucideIcon> = {
  person: User,
  place: MapPin,
  thing: Box,
};

const KIND_LABEL: Record<EntityKind, string> = {
  person: 'Person',
  place: 'Place',
  thing: 'Thing',
};

export default async function EntityDetail({
  params,
}: {
  params: Params;
}) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const entity = await getEntity(id);
  if (!entity) notFound();

  const mentions = await listMentionsFor(id);
  const Icon = KIND_ICON[entity.kind];

  return (
    <div className="forge-atlas-detail">
      <Link href="/atlas" className="forge-detail__back">
        <ArrowLeft size={12} />
        Atlas
      </Link>

      <div className="forge-atlas-detail__head">
        <Icon size={22} className="forge-atlas-detail__head-ico" />
        <div>
          <div className="forge-atlas-detail__head-kind">
            {KIND_LABEL[entity.kind]}
          </div>
          <h1 className="forge-atlas-detail__head-name">{entity.name}</h1>
          <div className="forge-atlas-detail__head-meta">
            {entity.mention_count}{' '}
            {entity.mention_count === 1 ? 'mention' : 'mentions'} · first seen{' '}
            {formatDistanceToNow(new Date(entity.first_seen_at), { addSuffix: true })} · last{' '}
            {formatDistanceToNow(new Date(entity.last_seen_at), { addSuffix: true })}
          </div>
        </div>
      </div>

      <section className="forge-atlas-detail__mentions">
        <h2 className="forge-atlas-detail__mentions-title">Captures</h2>
        {mentions.length === 0 ? (
          <div
            className="forge-empty rounded-xl border"
            style={{ borderColor: 'var(--line)', background: 'var(--bg-2)' }}
          >
            <div className="forge-empty__msg">
              No captures reference this entity right now. Mentions of{' '}
              <strong>{entity.name}</strong> in future captures will land here.
            </div>
          </div>
        ) : (
          <div className="forge-list-card">
            {mentions.map((m) => (
              <Link
                key={m.capture_id}
                href={`/capture/${m.capture_id}`}
                className="forge-list-row"
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                <div className="forge-list-row__icon">
                  <ScrollText size={14} />
                </div>
                <div className="forge-list-row__body">
                  <div className="forge-list-row__title">{m.capture_title}</div>
                  <div className="forge-list-row__preview">
                    {m.capture_preview || '—'}
                  </div>
                </div>
                <div className="forge-list-row__right">
                  <span className="forge-list-row__when">
                    {formatDistanceToNow(new Date(m.capture_created_at), {
                      addSuffix: true,
                    })}
                  </span>
                  <span className={kindPillClass(m.capture_kind as CaptureKind)}>
                    #{m.capture_kind}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
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
