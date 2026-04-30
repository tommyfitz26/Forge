// Intentions + streak domain types (Phase 4.3.5).
//
// Locally-typed until `pnpm db:types` is re-run after applying the
// 20260430044322 migration.

export type Intention = {
  id: string;
  owner_id: string;
  day: string;          // ISO date 'YYYY-MM-DD'
  body: string;
  created_at: string;
  updated_at: string;
};

/** A day's row in the materialized streak table. */
export type StreakDay = {
  owner_id: string;
  day: string;          // ISO date 'YYYY-MM-DD'
  sources: StreakSource[];
};

/** Source kinds that count toward the streak. See SPEC §12. */
export const STREAK_SOURCES = [
  'capture',
  'focus',
  'journal',
  'developed',
  'promoted',
] as const;
export type StreakSource = (typeof STREAK_SOURCES)[number];

/** Summary used by the sidebar practice card and inspector counts. */
export type StreakSummary = {
  /** Consecutive-day count running back from today. */
  current: number;
  /** Longest streak ever observed. */
  best: number;
  /** ISO dates (most recent first) of the trailing 14 active days, for the dot grid. */
  recentActiveDays: string[];
};
