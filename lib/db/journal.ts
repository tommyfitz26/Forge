// Journal query helpers (Phase 4.3.4).
// Untyped escape hatch — drop after `pnpm db:types`.

import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import type { JournalEntry } from '@/lib/types/journal';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function untypedSupabase(): Promise<any> {
  return createClient();
}

type ListOptions = {
  limit?: number;
  /** Filter to entries containing this tag slug. */
  tag?: string;
};

export async function listJournalEntries(opts: ListOptions = {}): Promise<JournalEntry[]> {
  const supabase = await untypedSupabase();
  const limit = opts.limit ?? 200;

  let query = supabase
    .from('journal_entries')
    .select('*')
    .is('deleted_at', null)
    .order('written_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (opts.tag) {
    query = query.contains('tags', [opts.tag]);
  }

  const { data, error } = await query;
  if (error) {
    logger.error('journal.list.failed', { err: error.message });
    return [];
  }
  return (data ?? []) as JournalEntry[];
}

export async function getJournalEntry(id: string): Promise<JournalEntry | null> {
  const supabase = await untypedSupabase();
  const { data, error } = await supabase
    .from('journal_entries')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) {
    logger.error('journal.get.failed', { id, err: error.message });
    return null;
  }
  return (data ?? null) as JournalEntry | null;
}

export async function journalCounts(): Promise<{
  total: number;
  thisMonth: number;
  dayStreak: number;
}> {
  const supabase = await untypedSupabase();
  // Pull just the dates — small volume, fine to do client-side counting.
  const { data, error } = await supabase
    .from('journal_entries')
    .select('written_at')
    .is('deleted_at', null)
    .order('written_at', { ascending: false })
    .limit(400);
  if (error) {
    logger.error('journal.counts.failed', { err: error.message });
    return { total: 0, thisMonth: 0, dayStreak: 0 };
  }
  const rows = (data ?? []) as Array<{ written_at: string }>;
  const total = rows.length;

  const now = new Date();
  const thisMonthIso = now.toISOString().slice(0, 7);
  const thisMonth = rows.filter((r) => r.written_at.startsWith(thisMonthIso)).length;

  // Day streak: count consecutive days going back from today that have at
  // least one entry. (Same logic Phase 4.3.5 will use for streak_days; for
  // 4.3.4 a simple in-memory pass is fine at v1 volumes.)
  const days = new Set<string>(rows.map((r) => r.written_at));
  let streak = 0;
  const cursor = new Date(now);
  for (;;) {
    const iso = cursor.toISOString().slice(0, 10);
    if (!days.has(iso)) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return { total, thisMonth, dayStreak: streak };
}
