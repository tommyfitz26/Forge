import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WeeklySummary } from '@/lib/ai/weekly-summary-schema';

const ID_A = '11111111-1111-4111-8111-111111111111';
const ID_B = '22222222-2222-4222-8222-222222222222';
const WEEK_ID = '33333333-3333-4333-8333-333333333333';

const baseEnv = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  OWNER_EMAIL: 'me@example.com',
  ANTHROPIC_API_KEY: 'sk-ant-x',
  OPENAI_API_KEY: 'sk-openai-x',
  SHORTCUT_API_TOKEN: 'a'.repeat(64),
  NEXT_PUBLIC_APP_URL: 'https://forge.mom',
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

const summary: WeeklySummary = {
  captures: [
    {
      id: ID_A,
      summary: 'A voice-first standup tool. Geekbot is the obvious incumbent.',
      research_distilled: 'Geekbot dominates async-standup. Saturated.',
    },
    {
      id: ID_B,
      summary: 'Calendar friction — scheduling tools never see real availability.',
      research_distilled: '',
    },
  ],
  patterns_summary:
    'You logged calendar friction twice this week. Worth deciding whether these are one idea.',
  ready_to_develop_ids: [ID_A],
};

const captures = [
  { id: ID_A, kind: 'idea' as const, title: 'Voice First Standup Bot' },
  { id: ID_B, kind: 'problem' as const, title: 'Calendar Keeps Double-Booking' },
];

describe('composeWeeklyReviewEmail', () => {
  it('renders the SPEC §4.5 sections + counts banner', async () => {
    const { composeWeeklyReviewEmail } = await import('@/lib/email/compose');
    const result = composeWeeklyReviewEmail({
      weekId: WEEK_ID,
      weekOf: '2026-04-27',
      summary,
      captures,
    });

    expect(result.subject).toBe('This week in Forge — 2026-04-27');
    expect(result.markdown).toContain('# This week in Forge');
    expect(result.markdown).toContain(
      '**2 captures. 1 pattern. 1 idea ready to develop.**',
    );
    expect(result.markdown).toContain('## New captures');
    expect(result.markdown).toContain('### [Idea] Voice First Standup Bot');
    expect(result.markdown).toContain('### [Problem] Calendar Keeps Double-Booking');
    expect(result.markdown).toContain('## Patterns I noticed');
    expect(result.markdown).toContain('## Ready to develop');
    expect(result.markdown).toContain(
      `[Open in Forge](https://forge.mom/review/${WEEK_ID})`,
    );
  });

  it('renders HTML via marked — headers + bold + links survive', async () => {
    const { composeWeeklyReviewEmail } = await import('@/lib/email/compose');
    const result = composeWeeklyReviewEmail({
      weekId: WEEK_ID,
      weekOf: '2026-04-27',
      summary,
      captures,
    });
    expect(result.html).toContain('<h1>This week in Forge</h1>');
    expect(result.html).toContain('<strong>');
    expect(result.html).toContain(`<a href="https://forge.mom/review/${WEEK_ID}"`);
  });

  it('omits the Patterns section when patterns_summary is empty', async () => {
    const { composeWeeklyReviewEmail } = await import('@/lib/email/compose');
    const result = composeWeeklyReviewEmail({
      weekId: WEEK_ID,
      weekOf: '2026-04-27',
      summary: { ...summary, patterns_summary: '' },
      captures,
    });
    expect(result.markdown).not.toContain('## Patterns I noticed');
    expect(result.markdown).toContain('**2 captures. 0 patterns.');
  });

  it('omits the Ready-to-develop section when no ids returned, but still links to review', async () => {
    const { composeWeeklyReviewEmail } = await import('@/lib/email/compose');
    const result = composeWeeklyReviewEmail({
      weekId: WEEK_ID,
      weekOf: '2026-04-27',
      summary: { ...summary, ready_to_develop_ids: [] },
      captures,
    });
    expect(result.markdown).not.toContain('## Ready to develop');
    expect(result.markdown).toContain('[Open the weekly review]');
  });

  it('omits the Research line when research_distilled is empty', async () => {
    const { composeWeeklyReviewEmail } = await import('@/lib/email/compose');
    const result = composeWeeklyReviewEmail({
      weekId: WEEK_ID,
      weekOf: '2026-04-27',
      summary: {
        ...summary,
        captures: [
          { id: ID_B, summary: 'plain', research_distilled: '' },
        ],
        ready_to_develop_ids: [],
      },
      captures: [{ id: ID_B, kind: 'problem', title: 'Calendar Keeps Double-Booking' }],
    });
    expect(result.markdown).not.toContain('_Research:_');
  });

  it('text fallback is identical to the markdown body', async () => {
    const { composeWeeklyReviewEmail } = await import('@/lib/email/compose');
    const result = composeWeeklyReviewEmail({
      weekId: WEEK_ID,
      weekOf: '2026-04-27',
      summary,
      captures,
    });
    expect(result.text).toBe(result.markdown);
  });

  it('falls back to (unknown title) when the lookup map is missing a capture id', async () => {
    const { composeWeeklyReviewEmail } = await import('@/lib/email/compose');
    const result = composeWeeklyReviewEmail({
      weekId: WEEK_ID,
      weekOf: '2026-04-27',
      summary,
      captures: [], // empty lookup
    });
    expect(result.markdown).toContain('(unknown title)');
  });
});

describe('composePushBody', () => {
  it('uses the SPEC §4.5 phrasing with all three counts', async () => {
    const { composePushBody } = await import('@/lib/email/compose');
    expect(composePushBody({ captureCount: 4, patternCount: 2, readyCount: 1 })).toBe(
      'Your weekly review is ready — 4 new captures, 2 patterns spotted, 1 ready to develop.',
    );
  });

  it('drops the patterns clause when zero patterns', async () => {
    const { composePushBody } = await import('@/lib/email/compose');
    expect(composePushBody({ captureCount: 1, patternCount: 0, readyCount: 0 })).toBe(
      'Your weekly review is ready — 1 new capture.',
    );
  });

  it('drops the ready-to-develop clause when zero ready', async () => {
    const { composePushBody } = await import('@/lib/email/compose');
    expect(composePushBody({ captureCount: 3, patternCount: 1, readyCount: 0 })).toBe(
      'Your weekly review is ready — 3 new captures, 1 pattern spotted.',
    );
  });

  it('singularizes capture / pattern / idea correctly at n=1', async () => {
    const { composePushBody } = await import('@/lib/email/compose');
    expect(composePushBody({ captureCount: 1, patternCount: 1, readyCount: 1 })).toBe(
      'Your weekly review is ready — 1 new capture, 1 pattern spotted, 1 ready to develop.',
    );
  });
});
