import { describe, it, expect } from 'vitest';
import { WeeklySummarySchema } from '@/lib/ai/weekly-summary-schema';

const ID_A = '11111111-1111-4111-8111-111111111111';
const ID_B = '22222222-2222-4222-8222-222222222222';
const ID_C = '33333333-3333-4333-8333-333333333333';

const fixture = {
  captures: [
    {
      id: ID_A,
      summary:
        'User keeps double-booking despite Calendly. The wedge they keep returning to: tools never see real availability across multiple calendars + offline commitments.',
      research_distilled:
        'Calendly and Reclaim already serve power-users; market is saturated. Recent: Reclaim shipped multi-calendar conflict detection in March.',
    },
    {
      id: ID_B,
      summary: 'A voice-first standup tool that records, transcribes, and produces a daily digest. Geekbot is the obvious incumbent.',
      research_distilled: '',
    },
  ],
  patterns_summary:
    'You logged calendar friction twice this week — Tuesday and Saturday. Worth deciding whether these are one idea before opening a develop conversation.',
  ready_to_develop_ids: [ID_A, ID_B],
};

describe('WeeklySummarySchema', () => {
  it('accepts a typical Sonnet-shaped fixture', () => {
    const result = WeeklySummarySchema.safeParse(fixture);
    expect(result.success).toBe(true);
  });

  it('accepts an empty patterns_summary and empty ready_to_develop_ids', () => {
    const result = WeeklySummarySchema.safeParse({
      ...fixture,
      patterns_summary: '',
      ready_to_develop_ids: [],
    });
    expect(result.success).toBe(true);
  });

  it('accepts an empty research_distilled (capture has no research)', () => {
    const result = WeeklySummarySchema.safeParse({
      ...fixture,
      captures: [
        { id: ID_C, summary: 'Thin observation about ATM UX.', research_distilled: '' },
      ],
      ready_to_develop_ids: [],
    });
    expect(result.success).toBe(true);
  });

  it('rejects non-UUID capture id', () => {
    const result = WeeklySummarySchema.safeParse({
      ...fixture,
      captures: [{ id: 'not-a-uuid', summary: 'x', research_distilled: '' }],
      ready_to_develop_ids: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty per-capture summary', () => {
    const result = WeeklySummarySchema.safeParse({
      ...fixture,
      captures: [{ id: ID_A, summary: '', research_distilled: '' }],
      ready_to_develop_ids: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-UUID entries in ready_to_develop_ids', () => {
    const result = WeeklySummarySchema.safeParse({
      ...fixture,
      ready_to_develop_ids: ['nope'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing required fields', () => {
    expect(
      WeeklySummarySchema.safeParse({
        captures: [],
        ready_to_develop_ids: [],
      }).success,
    ).toBe(false);
    expect(
      WeeklySummarySchema.safeParse({
        captures: [],
        patterns_summary: '',
      }).success,
    ).toBe(false);
  });
});
