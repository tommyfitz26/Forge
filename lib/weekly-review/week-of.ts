import { env } from '@/lib/env';

// SPEC §4.5 — `week_of` is the canonical key for a weekly review row. It's
// the YYYY-MM-DD date of the **Monday** that begins the week containing the
// cron-fire moment, in `APP_SCHEDULE_TZ`. Sunday 5pm ET fires → week_of is
// the Monday six days ago. Anchoring to a stable date (not "rolling 7 days")
// makes the idempotency key reproducible across QStash redeliveries.

/**
 * Returns the YYYY-MM-DD date of the Monday on or before `instant`,
 * computed in `APP_SCHEDULE_TZ`. ISO-8601 week semantics: Monday is day 1.
 */
export function weekOfFor(instant: Date): string {
  const tz = env.APP_SCHEDULE_TZ;

  // Extract the local Y/M/D + weekday in TZ. Intl.DateTimeFormat is the
  // only correct way — manual offset math breaks on DST transitions.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(instant);

  const get = (type: string): string => {
    const part = parts.find((p) => p.type === type);
    if (!part) throw new Error(`Intl part missing: ${type}`);
    return part.value;
  };

  const year = Number(get('year'));
  const month = Number(get('month'));
  const day = Number(get('day'));
  const weekday = get('weekday'); // Sun, Mon, Tue, ...

  const SHIFT_BACK: Record<string, number> = {
    Mon: 0,
    Tue: 1,
    Wed: 2,
    Thu: 3,
    Fri: 4,
    Sat: 5,
    Sun: 6,
  };
  const back = SHIFT_BACK[weekday];
  if (back === undefined) {
    throw new Error(`Unexpected weekday in TZ ${tz}: ${weekday}`);
  }

  // Subtract `back` days from the local date. Use a UTC date for arithmetic
  // (year/month/day boundaries) — we never re-introduce TZ here, just count
  // calendar days. Two consecutive midnights in the same TZ are exactly 1
  // calendar day apart on a UTC clock as long as we don't cross DST inside
  // the subtraction, which we don't (we're moving 0–6 days, not jumping
  // hours).
  const utc = Date.UTC(year, month - 1, day);
  const monday = new Date(utc - back * 86_400_000);

  const yyyy = monday.getUTCFullYear();
  const mm = String(monday.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(monday.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Returns the ISO-8601 instant marking the start of the week (Monday 00:00:00
 * in `APP_SCHEDULE_TZ`). Used as the eligibility lower-bound for the captures
 * `created_at` filter.
 */
export function weekStartInstant(weekOfYmd: string): string {
  // Walk forward through hours until we land at the local-midnight instant
  // for that date. Robust against DST (the "spring forward" Sunday loses an
  // hour but Monday midnight is unaffected; weekly review never lands on a
  // DST-affected day). Loop bound is small.
  const tz = env.APP_SCHEDULE_TZ;
  const [y, m, d] = weekOfYmd.split('-').map(Number);
  if (!y || !m || !d) throw new Error(`bad weekOf: ${weekOfYmd}`);

  // Start guess: assume local timezone is UTC-5 (EST). Adjust by ±15 hours
  // looking for the instant whose TZ-local date+time equals YYYY-MM-DD 00:00.
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  for (let offsetHours = -14; offsetHours <= 14; offsetHours += 1) {
    const guess = new Date(Date.UTC(y, m - 1, d, offsetHours, 0, 0));
    const parts = fmt.formatToParts(guess);
    const get = (t: string): string => parts.find((p) => p.type === t)?.value ?? '';
    const localY = Number(get('year'));
    const localM = Number(get('month'));
    const localD = Number(get('day'));
    const localH = Number(get('hour'));
    const localMin = Number(get('minute'));
    if (
      localY === y &&
      localM === m &&
      localD === d &&
      localH === 0 &&
      localMin === 0
    ) {
      return guess.toISOString();
    }
  }
  throw new Error(`could not find local midnight for ${weekOfYmd} in ${tz}`);
}
