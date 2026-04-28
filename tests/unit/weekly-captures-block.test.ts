import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Research } from '@/lib/ai/research-schema';

const ID_A = '11111111-1111-4111-8111-111111111111';
const ID_B = '22222222-2222-4222-8222-222222222222';

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

const research: Research = {
  competitors: [{ name: 'Calendly', oneLiner: 'Scheduling.' }],
  market_context: 'Saturated market.',
  recent_news: [],
  angles: [{ title: 'A', reasoning: 'r' }],
  confidence: 'medium',
  sources_count: 3,
  generated_at: '2026-04-27T00:00:00Z',
};

describe('formatPatternDetectionBlock', () => {
  it('renders captures id-first with kind, title, body', async () => {
    const { formatPatternDetectionBlock } = await import(
      '@/lib/weekly-review/captures-block'
    );
    const out = formatPatternDetectionBlock([
      {
        id: ID_A,
        kind: 'idea',
        title: 'Voice First Standup Bot',
        content: 'A bot that records voice memos.',
        created_at: '2026-04-28T15:00:00Z',
      },
      {
        id: ID_B,
        kind: 'problem',
        title: 'Calendar Keeps Double-Booking',
        content: 'Scheduling tools never see real availability.',
        created_at: '2026-05-02T15:00:00Z',
      },
    ]);
    expect(out).toContain(`${ID_A} [idea] Voice First Standup Bot`);
    expect(out).toContain('A bot that records voice memos.');
    expect(out).toContain(`${ID_B} [problem] Calendar Keeps Double-Booking`);
  });

  it('returns "(none)" for an empty input', async () => {
    const { formatPatternDetectionBlock } = await import(
      '@/lib/weekly-review/captures-block'
    );
    expect(formatPatternDetectionBlock([])).toBe('(none)');
  });

  it('truncates oversized content with an ellipsis', async () => {
    const { formatPatternDetectionBlock } = await import(
      '@/lib/weekly-review/captures-block'
    );
    const huge = 'word '.repeat(5000); // 25K chars
    const out = formatPatternDetectionBlock([
      {
        id: ID_A,
        kind: 'idea',
        title: 'Big Idea',
        content: huge,
        created_at: '2026-04-28T15:00:00Z',
      },
    ]);
    // 2000-char cap on body keeps the whole block well under 25K.
    expect(out.length).toBeLessThan(2200);
    expect(out).toContain('…');
  });

  it('collapses internal whitespace so multi-line transcripts stay tidy', async () => {
    const { formatPatternDetectionBlock } = await import(
      '@/lib/weekly-review/captures-block'
    );
    const out = formatPatternDetectionBlock([
      {
        id: ID_A,
        kind: 'observation',
        title: 'Observation',
        content: 'first line\n\n\n   second line\t\twith   tabs',
        created_at: '2026-04-28T15:00:00Z',
      },
    ]);
    expect(out).toContain('first line second line with tabs');
  });
});

describe('formatWeeklySummaryCapturesBlock', () => {
  it('renders ### header with kind in TitleCase + day-of-week + id line', async () => {
    const { formatWeeklySummaryCapturesBlock } = await import(
      '@/lib/weekly-review/captures-block'
    );
    const out = formatWeeklySummaryCapturesBlock([
      {
        id: ID_A,
        kind: 'idea',
        title: 'Voice First Standup Bot',
        content: 'A bot.',
        created_at: '2026-04-28T15:00:00Z', // Tuesday in ET
        research: null,
      },
    ]);
    expect(out).toContain('### [Idea] Voice First Standup Bot (Tue)');
    expect(out).toContain(`id: ${ID_A}`);
    expect(out).toContain('A bot.');
    // No research section when research is null.
    expect(out).not.toContain('Research:');
  });

  it('appends a "Research:" summary line when research exists', async () => {
    const { formatWeeklySummaryCapturesBlock } = await import(
      '@/lib/weekly-review/captures-block'
    );
    const out = formatWeeklySummaryCapturesBlock([
      {
        id: ID_A,
        kind: 'idea',
        title: 'Idea With Research',
        content: 'body',
        created_at: '2026-04-28T15:00:00Z',
        research,
      },
    ]);
    expect(out).toContain('Research: Competitors: Calendly');
    expect(out).toContain('Confidence: medium.');
  });

  it('returns "(none)" for empty captures', async () => {
    const { formatWeeklySummaryCapturesBlock } = await import(
      '@/lib/weekly-review/captures-block'
    );
    expect(formatWeeklySummaryCapturesBlock([])).toBe('(none)');
  });
});

describe('formatPatternsBlock', () => {
  it('renders each pair with both UUIDs and titles', async () => {
    const { formatPatternsBlock } = await import('@/lib/weekly-review/captures-block');
    const lookup = new Map([
      [ID_A, { kind: 'idea' as const, title: 'Voice First Standup Bot' }],
      [ID_B, { kind: 'problem' as const, title: 'Calendar Keeps Double-Booking' }],
    ]);
    const out = formatPatternsBlock(
      [{ capture_a: ID_A, capture_b: ID_B, reasoning: 'Both about scheduling friction.' }],
      lookup,
    );
    expect(out).toContain(`${ID_A} [idea: Voice First Standup Bot]`);
    expect(out).toContain(`${ID_B} [problem: Calendar Keeps Double-Booking]`);
    expect(out).toContain('Both about scheduling friction.');
  });

  it('falls back to [unknown] when a UUID is missing from the lookup', async () => {
    const { formatPatternsBlock } = await import('@/lib/weekly-review/captures-block');
    const out = formatPatternsBlock(
      [{ capture_a: ID_A, capture_b: ID_B, reasoning: 'r' }],
      new Map(),
    );
    expect(out).toContain('[unknown]');
  });

  it('returns "(none)" for an empty pairs array', async () => {
    const { formatPatternsBlock } = await import('@/lib/weekly-review/captures-block');
    expect(formatPatternsBlock([], new Map())).toBe('(none)');
  });
});
