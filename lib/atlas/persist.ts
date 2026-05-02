import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/db';
import { logger } from '@/lib/logger';
import type { EntityKind } from '@/lib/ai/tasks';

// Phase 5.7 — given an array of (name, kind) extracted from classify_capture,
// upsert each into `entities` (deduping by owner + normalized name + kind),
// then write `mentions` rows linking each entity to the just-created
// capture. Updates the entity's mention_count + last_seen_at cache.
//
// Best-effort: errors are logged + swallowed. Entity persistence must never
// fail a capture insert.

export type ExtractedEntity = { name: string; kind: EntityKind };

/**
 * Lowercase + trim + collapse whitespace. Used as the dedupe key. Same
 * person mentioned as "Maren" / " Maren " / "maren" → one entity row.
 */
export function normalizeEntityName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

export async function persistEntitiesAndMentions(
  // The persist path uses the user's auth client, but we cast to `any` for
  // tables not in the generated Database type yet (entities + mentions).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<Database> | any,
  userId: string,
  captureId: string,
  entities: ExtractedEntity[],
): Promise<void> {
  if (entities.length === 0) return;

  // De-dupe within this single classify call (model occasionally repeats).
  const seen = new Set<string>();
  const unique: ExtractedEntity[] = [];
  for (const e of entities) {
    const key = `${e.kind}:${normalizeEntityName(e.name)}`;
    if (seen.has(key) || normalizeEntityName(e.name).length === 0) continue;
    seen.add(key);
    unique.push(e);
  }
  if (unique.length === 0) return;

  const now = new Date().toISOString();

  // Upsert each entity row. We use a single upsert with on-conflict so
  // existing entities just update last_seen_at + bump mention_count.
  // mention_count is incremented in a follow-up RPC-free read-then-write
  // since Supabase JS doesn't expose `nothing` style increments cleanly
  // without an RPC.
  for (const e of unique) {
    const normalized = normalizeEntityName(e.name);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = supabase as any;

      // 1. Upsert entity (insert if new, no-op on conflict so we can read
      // the existing row to bump the cache).
      const { error: insErr } = await client.from('entities').upsert(
        {
          owner_id: userId,
          name: e.name,
          normalized_name: normalized,
          kind: e.kind,
          updated_at: now,
        },
        {
          onConflict: 'owner_id,normalized_name,kind',
          ignoreDuplicates: true,
        },
      );
      if (insErr) {
        logger.warn('atlas.entity.upsert_failed', {
          err: insErr.message,
          name: e.name,
          kind: e.kind,
        });
        continue;
      }

      // 2. Look up the entity id (just-inserted or pre-existing).
      const { data: row, error: getErr } = await client
        .from('entities')
        .select('id, mention_count')
        .eq('owner_id', userId)
        .eq('normalized_name', normalized)
        .eq('kind', e.kind)
        .maybeSingle();
      if (getErr || !row) {
        logger.warn('atlas.entity.lookup_failed', {
          err: getErr?.message,
          name: e.name,
        });
        continue;
      }

      // 3. Insert the mention. Composite PK guards against duplicates if a
      // capture is reclassified later.
      const { error: mentionErr } = await client.from('mentions').insert({
        entity_id: row.id,
        capture_id: captureId,
        owner_id: userId,
      });
      if (mentionErr) {
        // Conflict (re-mention) is expected; only log unexpected.
        if (!mentionErr.message.includes('duplicate')) {
          logger.warn('atlas.mention.insert_failed', {
            err: mentionErr.message,
            entityId: row.id,
            captureId,
          });
        }
        continue;
      }

      // 4. Bump cache (last_seen_at + mention_count).
      await client
        .from('entities')
        .update({
          mention_count: (row.mention_count ?? 0) + 1,
          last_seen_at: now,
          updated_at: now,
        })
        .eq('id', row.id);
    } catch (err) {
      logger.warn('atlas.entity.unhandled', {
        err: err instanceof Error ? err.message : String(err),
        name: e.name,
        kind: e.kind,
      });
    }
  }

  logger.info('atlas.entities.persisted', {
    userId,
    captureId,
    extractedCount: entities.length,
    persistedCount: unique.length,
  });
}
