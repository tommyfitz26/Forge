import { describe, it, expect } from 'vitest';
import { selectCapture, type NudgeCandidate } from '@/lib/nudge/select-capture';

function c(partial: Partial<NudgeCandidate> & Pick<NudgeCandidate, 'id'>): NudgeCandidate {
  return {
    kind: 'idea',
    state: 'raw',
    research_status: 'pending',
    created_at: '2026-04-01T00:00:00Z',
    ...partial,
  };
}

describe('selectCapture (SPEC §4.4 weighted strategy)', () => {
  it('returns null on an empty list', () => {
    expect(selectCapture([])).toBeNull();
  });

  it('prefers raw + research-succeeded over raw + idea-without-research', () => {
    const withResearch = c({
      id: 'a',
      research_status: 'succeeded',
      created_at: '2026-04-10T00:00:00Z',
    });
    const ideaNoResearch = c({
      id: 'b',
      research_status: 'pending',
      created_at: '2026-04-01T00:00:00Z', // older
    });
    expect(selectCapture([ideaNoResearch, withResearch])?.id).toBe('a');
  });

  it('prefers raw + idea over raw + problem when neither has research', () => {
    const idea = c({
      id: 'a',
      kind: 'idea',
      research_status: 'pending',
      created_at: '2026-04-10T00:00:00Z',
    });
    const problem = c({
      id: 'b',
      kind: 'problem',
      research_status: 'skipped',
      created_at: '2026-04-01T00:00:00Z', // older
    });
    expect(selectCapture([problem, idea])?.id).toBe('a');
  });

  it('prefers raw over developed regardless of age', () => {
    const rawNew = c({
      id: 'a',
      state: 'raw',
      research_status: 'skipped',
      created_at: '2026-04-25T00:00:00Z',
    });
    const developedOld = c({
      id: 'b',
      state: 'developed',
      research_status: 'succeeded',
      created_at: '2026-01-01T00:00:00Z',
    });
    expect(selectCapture([developedOld, rawNew])?.id).toBe('a');
  });

  it('within a tier picks the oldest by created_at', () => {
    const newer = c({
      id: 'a',
      research_status: 'succeeded',
      created_at: '2026-04-15T00:00:00Z',
    });
    const older = c({
      id: 'b',
      research_status: 'succeeded',
      created_at: '2026-03-15T00:00:00Z',
    });
    expect(selectCapture([newer, older])?.id).toBe('b');
  });

  it('breaks created_at ties by id (deterministic)', () => {
    const a = c({ id: 'aaaaaaaa-...', research_status: 'succeeded' });
    const b = c({ id: 'bbbbbbbb-...', research_status: 'succeeded' });
    expect(selectCapture([b, a])?.id).toBe(a.id);
  });

  it('filters out unsupported states (defense-in-depth)', () => {
    const archived = c({ id: 'archived', state: 'archived' as const });
    const developed = c({ id: 'good', state: 'developed' });
    expect(selectCapture([archived, developed])?.id).toBe('good');
  });

  it('full-stack precedence: research-succeeded raw > raw idea > raw other > developed', () => {
    const tier4 = c({
      id: 'tier4',
      state: 'developed',
      research_status: 'succeeded',
      created_at: '2026-01-01T00:00:00Z',
    });
    const tier3 = c({
      id: 'tier3',
      state: 'raw',
      kind: 'observation',
      research_status: 'skipped',
      created_at: '2026-01-01T00:00:00Z',
    });
    const tier2 = c({
      id: 'tier2',
      state: 'raw',
      kind: 'idea',
      research_status: 'pending',
      created_at: '2026-04-20T00:00:00Z', // newest
    });
    const tier1 = c({
      id: 'tier1',
      state: 'raw',
      kind: 'idea',
      research_status: 'succeeded',
      created_at: '2026-04-25T00:00:00Z', // newest of all
    });
    const order = [tier4, tier3, tier2, tier1];
    expect(selectCapture(order)?.id).toBe('tier1');
    expect(selectCapture([tier4, tier3, tier2])?.id).toBe('tier2');
    expect(selectCapture([tier4, tier3])?.id).toBe('tier3');
    expect(selectCapture([tier4])?.id).toBe('tier4');
  });
});
