import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const baseEnv = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  OWNER_EMAIL: 'me@example.com',
  ANTHROPIC_API_KEY: 'sk-ant-x',
  OPENAI_API_KEY: 'sk-openai-x',
  SHORTCUT_API_TOKEN: 'a'.repeat(64),
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  APP_SCHEDULE_TZ: 'America/New_York',
};

const originalEnv = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  for (const key of Object.keys(baseEnv)) delete process.env[key];
  Object.assign(process.env, baseEnv);
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('weekOfFor', () => {
  it('returns the same Monday when called Monday morning ET', async () => {
    const { weekOfFor } = await import('@/lib/weekly-review/week-of');
    // 2026-04-27 Monday 14:00 UTC == Monday 10:00 ET.
    expect(weekOfFor(new Date('2026-04-27T14:00:00Z'))).toBe('2026-04-27');
  });

  it('returns the previous Monday when called Sunday 5pm ET (cron fire)', async () => {
    const { weekOfFor } = await import('@/lib/weekly-review/week-of');
    // 2026-05-03 Sunday 21:00 UTC == Sunday 17:00 ET.
    expect(weekOfFor(new Date('2026-05-03T21:00:00Z'))).toBe('2026-04-27');
  });

  it('returns the same Monday for every day of that ISO week (Mon → Sun)', async () => {
    const { weekOfFor } = await import('@/lib/weekly-review/week-of');
    const expected = '2026-04-27';
    expect(weekOfFor(new Date('2026-04-27T16:00:00Z'))).toBe(expected); // Mon
    expect(weekOfFor(new Date('2026-04-28T16:00:00Z'))).toBe(expected); // Tue
    expect(weekOfFor(new Date('2026-04-30T16:00:00Z'))).toBe(expected); // Thu
    expect(weekOfFor(new Date('2026-05-02T16:00:00Z'))).toBe(expected); // Sat
    expect(weekOfFor(new Date('2026-05-03T16:00:00Z'))).toBe(expected); // Sun
  });

  it('does not let UTC day-of-week confuse it: Sunday late ET is still that week', async () => {
    const { weekOfFor } = await import('@/lib/weekly-review/week-of');
    // 2026-05-04 03:00 UTC == 2026-05-03 23:00 ET (Sunday). Naive UTC code
    // would think this is Monday and return the *current* Monday instead of
    // the previous one.
    expect(weekOfFor(new Date('2026-05-04T03:00:00Z'))).toBe('2026-04-27');
  });

  it('rolls to the next Monday once it is Monday in ET', async () => {
    const { weekOfFor } = await import('@/lib/weekly-review/week-of');
    // 2026-05-04 14:00 UTC == Monday 10:00 ET — next week's Monday.
    expect(weekOfFor(new Date('2026-05-04T14:00:00Z'))).toBe('2026-05-04');
  });

  it('handles DST spring-forward (2026-03-08 02:00 ET skipped) without drift', async () => {
    const { weekOfFor } = await import('@/lib/weekly-review/week-of');
    // 2026-03-08 is a Sunday and a DST transition day. Cron fire 5pm ET.
    // 2026-03-08 21:00 UTC == 17:00 ET.
    expect(weekOfFor(new Date('2026-03-08T21:00:00Z'))).toBe('2026-03-02');
  });

  it('handles DST fall-back (2026-11-01) without drift', async () => {
    const { weekOfFor } = await import('@/lib/weekly-review/week-of');
    // Fall back: 2026-11-01 02:00 ET happens twice. We're well past it at 5pm ET.
    expect(weekOfFor(new Date('2026-11-01T22:00:00Z'))).toBe('2026-10-26');
  });
});

describe('weekStartInstant', () => {
  it('returns the ISO instant for Monday 00:00 ET (EST window, UTC-5)', async () => {
    const { weekStartInstant } = await import('@/lib/weekly-review/week-of');
    // 2026-01-05 Monday 00:00 EST == 05:00 UTC.
    expect(weekStartInstant('2026-01-05')).toBe('2026-01-05T05:00:00.000Z');
  });

  it('returns the ISO instant for Monday 00:00 ET (EDT window, UTC-4)', async () => {
    const { weekStartInstant } = await import('@/lib/weekly-review/week-of');
    // 2026-04-27 Monday 00:00 EDT == 04:00 UTC.
    expect(weekStartInstant('2026-04-27')).toBe('2026-04-27T04:00:00.000Z');
  });

  it('throws on a malformed week_of', async () => {
    const { weekStartInstant } = await import('@/lib/weekly-review/week-of');
    expect(() => weekStartInstant('not-a-date')).toThrow();
  });
});
