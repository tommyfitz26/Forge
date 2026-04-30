// /this-week aggregator (Phase 4.4).
//
// Pulls captures + intentions + journal entries for a Monday-anchored 7-day
// window and buckets them by ISO day, plus computes weekly aggregates for
// the inspector panel and footer strip.
//
// This page is read-only and derives entirely from existing tables — no
// migration. Calendar sync (Google) lands as a follow-up.
//
// Day boundaries: capture `created_at` is `timestamptz`; we slice the ISO
// string at character 10 to bucket by UTC date, matching how
// `lib/db/streak.ts` does it. This means a late-evening ET capture
// (21:00–23:59 ET = 01:00–03:59 UTC next day) shows up on the next column.
// Acceptable trade-off for v1; tz-correct bucketing is a follow-up across
// streak + this-week + journal counts.

import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import type { CaptureKind } from '@/lib/capture/kinds';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function untypedSupabase(): Promise<any> {
  return createClient();
}

export type DayCapture = {
  id: string;
  title: string;
  kind: CaptureKind;
  created_at: string;
};

export type DayJournalEntry = {
  id: string;
  written_at: string;
  preview: string;
};

export type WeekDay = {
  /** ISO 'YYYY-MM-DD'. */
  iso: string;
  /** Mon..Sun. */
  dayName: string;
  /** Numeric day; the first column of the week + Mondays show "Apr 27". */
  label: string;
  isToday: boolean;
  isFuture: boolean;
  /** Today's-focus body for this date, if set. */
  focus: string | null;
  captures: DayCapture[];
  journal: DayJournalEntry[];
};

export type WeekAggregates = {
  captureTotal: number;
  byKind: Record<CaptureKind, number>;
  focusSetDays: number;
  journalDays: number;
  /** Day with the most captures (ISO date) — null if no captures. */
  busiestDay: string | null;
};

export type WeekData = {
  /** Monday of the week, ISO. */
  weekStart: string;
  /** Sunday of the week, ISO. */
  weekEnd: string;
  /** True if `weekStart` matches today's containing week. */
  isCurrentWeek: boolean;
  /** Mon-anchored 7-day grid. */
  days: WeekDay[];
  aggregates: WeekAggregates;
};

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

/**
 * Snap any date to the Monday of its week (ISO 8601 — Monday start).
 */
export function mondayOf(d: Date): Date {
  const day = d.getUTCDay(); // 0..6, Sun..Sat
  const out = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  // Steps to step back to Monday. day=0 (Sun)→6, day=1 (Mon)→0, day=2→1, etc.
  const back = (day + 6) % 7;
  out.setUTCDate(out.getUTCDate() - back);
  return out;
}

function isoOf(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Format a Mon-anchored date range like "Apr 27 – May 3, 2026".
 */
export function formatWeekRange(weekStartIso: string, weekEndIso: string): string {
  const a = new Date(`${weekStartIso}T12:00:00Z`);
  const b = new Date(`${weekEndIso}T12:00:00Z`);
  const am = MONTH_SHORT[a.getUTCMonth()];
  const bm = MONTH_SHORT[b.getUTCMonth()];
  return `${am} ${a.getUTCDate()} – ${bm} ${b.getUTCDate()}, ${b.getUTCFullYear()}`;
}

/**
 * Resolve a `?week=YYYY-MM-DD` query param to a Monday. Returns this week's
 * Monday for invalid / missing input.
 */
export function resolveWeekStart(weekParam: string | null | undefined): Date {
  const today = new Date();
  if (!weekParam || !/^\d{4}-\d{2}-\d{2}$/.test(weekParam)) {
    return mondayOf(today);
  }
  const parsed = new Date(`${weekParam}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return mondayOf(today);
  return mondayOf(parsed);
}

const ZERO_KIND_COUNTS: Record<CaptureKind, number> = {
  idea: 0,
  problem: 0,
  observation: 0,
  research: 0,
};

function previewLine(s: string | null | undefined): string {
  if (!s) return '';
  const oneLine = s.replace(/\s+/g, ' ').trim();
  return oneLine.length > 100 ? oneLine.slice(0, 100) + '…' : oneLine;
}

/**
 * Fetch the week's data for the signed-in user.
 */
export async function getWeekData(weekStart: Date): Promise<WeekData> {
  const supabase = await untypedSupabase();

  // 7-day window: Mon..Sun inclusive.
  const startIso = isoOf(weekStart);
  const end = new Date(weekStart);
  end.setUTCDate(end.getUTCDate() + 6);
  const endIso = isoOf(end);

  // Capture filter: created_at >= Mon 00:00 UTC, < Mon-next 00:00 UTC.
  const tomorrowOfEnd = new Date(end);
  tomorrowOfEnd.setUTCDate(tomorrowOfEnd.getUTCDate() + 1);
  const endExclusiveIso = isoOf(tomorrowOfEnd);

  const today = new Date();
  const todayIso = isoOf(today);
  const currentWeekStart = mondayOf(today);
  const isCurrentWeek = isoOf(currentWeekStart) === startIso;

  const [capturesRes, intentionsRes, journalRes] = await Promise.all([
    supabase
      .from('captures')
      .select('id, title, kind, created_at, state')
      .neq('state', 'archived')
      .gte('created_at', `${startIso}T00:00:00Z`)
      .lt('created_at', `${endExclusiveIso}T00:00:00Z`)
      .order('created_at', { ascending: true })
      .limit(500),
    supabase
      .from('intentions')
      .select('day, body')
      .gte('day', startIso)
      .lte('day', endIso)
      .limit(7),
    supabase
      .from('journal_entries')
      .select('id, written_at, body')
      .is('deleted_at', null)
      .gte('written_at', startIso)
      .lte('written_at', endIso)
      .order('written_at', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(200),
  ]);

  if (capturesRes.error) {
    logger.error('thisWeek.captures.failed', { err: capturesRes.error.message });
  }
  if (intentionsRes.error) {
    logger.error('thisWeek.intentions.failed', { err: intentionsRes.error.message });
  }
  if (journalRes.error) {
    logger.error('thisWeek.journal.failed', { err: journalRes.error.message });
  }

  const captures = (capturesRes.data ?? []) as Array<{
    id: string;
    title: string;
    kind: string;
    created_at: string;
  }>;
  const intentions = (intentionsRes.data ?? []) as Array<{
    day: string;
    body: string;
  }>;
  const journal = (journalRes.data ?? []) as Array<{
    id: string;
    written_at: string;
    body: string;
  }>;

  // Bucket by ISO day.
  const dayMap = new Map<
    string,
    { captures: DayCapture[]; journal: DayJournalEntry[]; focus: string | null }
  >();
  const focusByDay = new Map(intentions.map((i) => [i.day, i.body]));
  const byKind: Record<CaptureKind, number> = { ...ZERO_KIND_COUNTS };

  for (const c of captures) {
    const dayIso = c.created_at.slice(0, 10);
    let bucket = dayMap.get(dayIso);
    if (!bucket) {
      bucket = { captures: [], journal: [], focus: focusByDay.get(dayIso) ?? null };
      dayMap.set(dayIso, bucket);
    }
    const kind = c.kind as CaptureKind;
    bucket.captures.push({
      id: c.id,
      title: c.title,
      kind,
      created_at: c.created_at,
    });
    if (kind in byKind) byKind[kind] += 1;
  }
  for (const j of journal) {
    let bucket = dayMap.get(j.written_at);
    if (!bucket) {
      bucket = { captures: [], journal: [], focus: focusByDay.get(j.written_at) ?? null };
      dayMap.set(j.written_at, bucket);
    }
    bucket.journal.push({
      id: j.id,
      written_at: j.written_at,
      preview: previewLine(j.body),
    });
  }

  // Build the 7-cell grid.
  const days: WeekDay[] = [];
  for (let i = 0; i < 7; i++) {
    const cellDate = new Date(weekStart);
    cellDate.setUTCDate(weekStart.getUTCDate() + i);
    const iso = isoOf(cellDate);
    const bucket = dayMap.get(iso);
    days.push({
      iso,
      dayName: DAY_NAMES[i] ?? '',
      label:
        i === 0 || cellDate.getUTCDate() === 1
          ? `${MONTH_SHORT[cellDate.getUTCMonth()]} ${cellDate.getUTCDate()}`
          : String(cellDate.getUTCDate()),
      isToday: iso === todayIso,
      isFuture: iso > todayIso,
      focus: bucket?.focus ?? focusByDay.get(iso) ?? null,
      captures: bucket?.captures ?? [],
      journal: bucket?.journal ?? [],
    });
  }

  // Aggregates.
  const captureTotal = captures.length;
  const focusSetDays = intentions.length;
  const journalDayIsos = new Set(journal.map((j) => j.written_at));
  const journalDays = journalDayIsos.size;

  let busiestDay: string | null = null;
  let busiestCount = 0;
  for (const d of days) {
    if (d.captures.length > busiestCount) {
      busiestCount = d.captures.length;
      busiestDay = d.iso;
    }
  }

  return {
    weekStart: startIso,
    weekEnd: endIso,
    isCurrentWeek,
    days,
    aggregates: {
      captureTotal,
      byKind,
      focusSetDays,
      journalDays,
      busiestDay,
    },
  };
}

/**
 * Cheap variant that only returns this week's aggregates — used by the
 * inspector panel without reading day-bucketed details.
 */
export async function thisWeekAggregates(): Promise<WeekAggregates> {
  const today = new Date();
  const data = await getWeekData(mondayOf(today));
  return data.aggregates;
}
