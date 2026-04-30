// Streak helpers (Phase 4.3.5).
//
// v1 computes the streak by reading the source tables directly. The
// `streak_days` table exists for forward compatibility with a future daily
// cron that materializes per-day source lists; until that cron lands,
// computeStreakSummary() is the source of truth for the practice card.
//
// Sources that count toward a day (per SPEC §12):
//   - capture    — at least one capture created
//   - focus      — Today's focus set
//   - journal    — at least one journal entry written
//   - developed  — a capture marked developed
//   - promoted   — a capture promoted to project
//
// Untyped escape hatch — drop after `pnpm db:types`.

import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import type { StreakSource, StreakSummary } from '@/lib/types/intentions';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function untypedSupabase(): Promise<any> {
  return createClient();
}

/** Trailing window we scan back from today. 90 days handles the practice
 *  card UI (14-day grid) and any reasonable "current streak" without
 *  reading the entire history. */
const SCAN_DAYS = 90;

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Compute current streak, best streak in scanned window, and the most
 * recent active days, by collecting per-day source sets across the trailing
 * SCAN_DAYS window.
 */
export async function computeStreakSummary(): Promise<StreakSummary> {
  const supabase = await untypedSupabase();

  const today = new Date();
  const todayIso = isoDay(today);
  const start = new Date(today);
  start.setDate(start.getDate() - (SCAN_DAYS - 1));
  const startIso = isoDay(start);
  // Inclusive upper bound for created_at-style timestamps: tomorrow's date.
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowIso = isoDay(tomorrow);

  // Per-day source set keyed by ISO date.
  const days = new Map<string, Set<StreakSource>>();
  const add = (dayIso: string, source: StreakSource) => {
    if (dayIso < startIso || dayIso > todayIso) return;
    let set = days.get(dayIso);
    if (!set) {
      set = new Set();
      days.set(dayIso, set);
    }
    set.add(source);
  };

  // 1. captures created in window
  const capturesQ = supabase
    .from('captures')
    .select('created_at')
    .gte('created_at', `${startIso}T00:00:00Z`)
    .lt('created_at', `${tomorrowIso}T00:00:00Z`)
    .limit(1000);

  // 2. intentions in window (one row per day)
  const intentionsQ = supabase
    .from('intentions')
    .select('day')
    .gte('day', startIso)
    .lte('day', todayIso)
    .limit(SCAN_DAYS);

  // 3. journal entries in window
  const journalQ = supabase
    .from('journal_entries')
    .select('written_at')
    .is('deleted_at', null)
    .gte('written_at', startIso)
    .lte('written_at', todayIso)
    .limit(1000);

  // 4. capture_events in window — state_change → developed and promoted_to_project
  const eventsQ = supabase
    .from('capture_events')
    .select('event_type, payload, created_at')
    .in('event_type', ['state_change', 'promoted_to_project'])
    .gte('created_at', `${startIso}T00:00:00Z`)
    .lt('created_at', `${tomorrowIso}T00:00:00Z`)
    .limit(1000);

  const [captures, intentions, journal, events] = await Promise.all([
    capturesQ,
    intentionsQ,
    journalQ,
    eventsQ,
  ]);

  if (captures.error) {
    logger.error('streak.captures.failed', { err: captures.error.message });
  }
  if (intentions.error) {
    logger.error('streak.intentions.failed', { err: intentions.error.message });
  }
  if (journal.error) {
    logger.error('streak.journal.failed', { err: journal.error.message });
  }
  if (events.error) {
    logger.error('streak.events.failed', { err: events.error.message });
  }

  for (const row of (captures.data ?? []) as Array<{ created_at: string }>) {
    add(row.created_at.slice(0, 10), 'capture');
  }
  for (const row of (intentions.data ?? []) as Array<{ day: string }>) {
    add(row.day, 'focus');
  }
  for (const row of (journal.data ?? []) as Array<{ written_at: string }>) {
    add(row.written_at, 'journal');
  }
  for (const row of (events.data ?? []) as Array<{
    event_type: string;
    payload: { to?: string } | null;
    created_at: string;
  }>) {
    const dayIso = row.created_at.slice(0, 10);
    if (row.event_type === 'state_change' && row.payload?.to === 'developed') {
      add(dayIso, 'developed');
    } else if (row.event_type === 'promoted_to_project') {
      add(dayIso, 'promoted');
    }
  }

  // Current streak: walk backward from today until we hit an inactive day.
  let current = 0;
  const cursor = new Date(today);
  while (current < SCAN_DAYS) {
    const iso = isoDay(cursor);
    if (!days.has(iso)) break;
    current += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  // Best streak in window: scan all SCAN_DAYS days oldest→newest, count runs.
  let best = 0;
  let run = 0;
  const walker = new Date(start);
  for (let i = 0; i < SCAN_DAYS; i++) {
    const iso = isoDay(walker);
    if (days.has(iso)) {
      run += 1;
      if (run > best) best = run;
    } else {
      run = 0;
    }
    walker.setDate(walker.getDate() + 1);
  }

  // Recent active days: most-recent-first, the trailing 14-day grid uses these.
  const recentActiveDays: string[] = [];
  const recentCursor = new Date(today);
  for (let i = 0; i < 14; i++) {
    const iso = isoDay(recentCursor);
    if (days.has(iso)) recentActiveDays.push(iso);
    recentCursor.setDate(recentCursor.getDate() - 1);
  }

  return { current, best, recentActiveDays };
}

/**
 * Has today's focus been set? Cheap check used by the morning-nudge job.
 */
export async function isTodaysFocusSet(): Promise<boolean> {
  const supabase = await untypedSupabase();
  const today = isoDay(new Date());
  const { data, error } = await supabase
    .from('intentions')
    .select('id')
    .eq('day', today)
    .maybeSingle();
  if (error) {
    logger.error('streak.todayFocus.failed', { err: error.message });
    return false;
  }
  return Boolean(data);
}
