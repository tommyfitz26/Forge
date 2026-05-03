// Atlas query helpers (Phase 5.7).
//
// listEntities — browse list grouped by kind for the /atlas page.
// getEntity / listMentionsFor — entity detail page.
//
// Untyped escape hatch — drop after `pnpm db:types`.

import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import type { EntityKind } from '@/lib/ai/tasks';
import type { Entity, HydratedMention } from '@/lib/types/atlas';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function untypedSupabase(): Promise<any> {
  return createClient();
}

export async function listEntities(opts: {
  kind?: EntityKind;
  limit?: number;
} = {}): Promise<Entity[]> {
  const supabase = await untypedSupabase();
  let query = supabase
    .from('entities')
    .select('*')
    .order('mention_count', { ascending: false })
    .order('last_seen_at', { ascending: false })
    .limit(opts.limit ?? 200);
  if (opts.kind) query = query.eq('kind', opts.kind);
  const { data, error } = await query;
  if (error) {
    logger.error('atlas.list.failed', { err: error.message });
    return [];
  }
  return (data ?? []) as Entity[];
}

export async function getEntity(id: string): Promise<Entity | null> {
  const supabase = await untypedSupabase();
  const { data, error } = await supabase
    .from('entities')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    logger.error('atlas.get.failed', { id, err: error.message });
    return null;
  }
  return (data ?? null) as Entity | null;
}

/** All captures mentioning the entity, hydrated with title + preview. */
export async function listMentionsFor(
  entityId: string,
): Promise<HydratedMention[]> {
  const supabase = await untypedSupabase();
  const { data: mentions, error } = await supabase
    .from('mentions')
    .select('capture_id, created_at')
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) {
    logger.error('atlas.mentions.failed', { entityId, err: error.message });
    return [];
  }
  const rows = (mentions ?? []) as Array<{ capture_id: string; created_at: string }>;
  if (rows.length === 0) return [];

  const captureIds = rows.map((r) => r.capture_id);
  const { data: caps } = await supabase
    .from('captures')
    .select('id, title, kind, state, content, created_at')
    .in('id', captureIds)
    .is('deleted_at', null);

  const capMap = new Map(
    ((caps ?? []) as Array<{
      id: string;
      title: string;
      kind: string;
      state: string;
      content: string | null;
      created_at: string;
    }>).map((c) => [c.id, c]),
  );

  return rows
    .map((m) => {
      const c = capMap.get(m.capture_id);
      if (!c) return null;
      return {
        capture_id: c.id,
        capture_title: c.title,
        capture_kind: c.kind,
        capture_state: c.state,
        capture_created_at: c.created_at,
        capture_preview: previewText(c.content),
        mention_created_at: m.created_at,
      } satisfies HydratedMention;
    })
    .filter((x): x is HydratedMention => x !== null);
}

export type AtlasCounts = {
  total: number;
  byKind: Record<EntityKind, number>;
};

export async function atlasCounts(): Promise<AtlasCounts> {
  const supabase = await untypedSupabase();
  const { data, error } = await supabase.from('entities').select('kind');
  if (error) {
    logger.warn('atlas.counts.failed', { err: error.message });
    return { total: 0, byKind: { person: 0, place: 0, thing: 0 } };
  }
  const byKind: Record<EntityKind, number> = { person: 0, place: 0, thing: 0 };
  for (const r of (data ?? []) as Array<{ kind: EntityKind }>) {
    if (r.kind in byKind) byKind[r.kind] += 1;
  }
  return { total: byKind.person + byKind.place + byKind.thing, byKind };
}

function previewText(s: string | null): string {
  if (!s) return '';
  const oneLine = s.replace(/\s+/g, ' ').trim();
  return oneLine.length > 160 ? oneLine.slice(0, 160) + '…' : oneLine;
}
