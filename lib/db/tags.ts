// Tags query helpers (Phase 4.3.4).
//
// Tags are free-form per UI-REDESIGN-SPEC.md §15 — auto-created by the
// journal/capture actions on first use. The summary helper here aggregates
// tag usage across journal_entries for the sidebar list and inspector counts.
// Capture/thread tagging lands in a later micro-slice and will join this
// aggregation once those tables gain tag support.

import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import type { Tag, TagSummary } from '@/lib/types/tags';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function untypedSupabase(): Promise<any> {
  return createClient();
}

export async function listTags(limit = 100): Promise<Tag[]> {
  const supabase = await untypedSupabase();
  const { data, error } = await supabase
    .from('tags')
    .select('*')
    .order('slug', { ascending: true })
    .limit(limit);
  if (error) {
    logger.error('tags.list.failed', { err: error.message });
    return [];
  }
  return (data ?? []) as Tag[];
}

/**
 * Tags ranked by usage frequency (most-used first), with recency tiebreaker.
 * Used by the sidebar Tags section and the cmd palette autocomplete.
 *
 * v1 scope: counts come from journal_entries.tags only. When captures /
 * threads gain tag columns, this aggregator joins them in.
 */
export async function topTags(limit = 8): Promise<TagSummary[]> {
  const supabase = await untypedSupabase();

  const { data: tagRows } = await supabase.from('tags').select('slug, color');
  const tags = (tagRows ?? []) as Array<{ slug: string; color: string | null }>;
  if (tags.length === 0) return [];

  const { data: entryRows } = await supabase
    .from('journal_entries')
    .select('tags, written_at')
    .is('deleted_at', null);
  const entries = (entryRows ?? []) as Array<{ tags: string[]; written_at: string }>;

  const counts = new Map<string, { count: number; lastSeen: string }>();
  for (const e of entries) {
    if (!Array.isArray(e.tags)) continue;
    for (const slug of e.tags) {
      const prior = counts.get(slug);
      if (!prior) {
        counts.set(slug, { count: 1, lastSeen: e.written_at });
      } else {
        prior.count += 1;
        if (e.written_at > prior.lastSeen) prior.lastSeen = e.written_at;
      }
    }
  }

  // Tags that exist but haven't been used yet still appear with count 0.
  for (const t of tags) {
    if (!counts.has(t.slug)) counts.set(t.slug, { count: 0, lastSeen: '' });
  }

  const tagsByslug = new Map(tags.map((t) => [t.slug, t.color]));

  const summary: TagSummary[] = [...counts.entries()].map(([slug, v]) => ({
    slug,
    count: v.count,
    color: tagsByslug.get(slug) ?? null,
  }));

  summary.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    // Tiebreak by recency via the inner map's lastSeen.
    const aSeen = counts.get(a.slug)?.lastSeen ?? '';
    const bSeen = counts.get(b.slug)?.lastSeen ?? '';
    return bSeen.localeCompare(aSeen);
  });

  return summary.slice(0, limit);
}

export async function tagCounts(): Promise<{ total: number; topSlug: string | null }> {
  const top = await topTags(1);
  const supabase = await untypedSupabase();
  const { count } = await supabase
    .from('tags')
    .select('id', { count: 'exact', head: true });
  return { total: count ?? 0, topSlug: top[0]?.slug ?? null };
}
