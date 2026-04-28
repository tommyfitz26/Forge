import { describe, it, expect } from 'vitest';
import { summarizeResearch } from '@/lib/nudge/research-summary';
import type { Research } from '@/lib/ai/research-schema';

const FULL: Research = {
  competitors: [
    { name: 'A', oneLiner: 'a' },
    { name: 'B', oneLiner: 'b' },
    { name: 'C', oneLiner: 'c' },
    { name: 'D', oneLiner: 'd' },
    { name: 'E', oneLiner: 'e' },
    { name: 'F', oneLiner: 'f' },
  ],
  market_context: 'Async-first remote teams growing post-2024.',
  recent_news: [
    {
      title: 'Geekbot Series A',
      url: 'https://example.com/g',
      summary: 'raised',
      date: '2025-08-12',
    },
    {
      title: 'Older news',
      url: 'https://example.com/o',
      summary: 's',
      date: '2025-01-01',
    },
  ],
  angles: [],
  confidence: 'medium',
  sources_count: 4,
  generated_at: '2026-04-25T10:00:00Z',
};

describe('summarizeResearch', () => {
  it('returns "(none)" for null', () => {
    expect(summarizeResearch(null)).toBe('(none)');
  });

  it('caps competitors to 5 names by name only', () => {
    const out = summarizeResearch(FULL);
    expect(out).toContain('Competitors: A, B, C, D, E.');
    expect(out).not.toContain('F');
  });

  it('caps recent_news to 1 item with date', () => {
    const out = summarizeResearch(FULL);
    expect(out).toContain('Recent: Geekbot Series A (2025-08-12).');
    expect(out).not.toContain('Older news');
  });

  it('truncates long market_context with an ellipsis', () => {
    const long: Research = {
      ...FULL,
      market_context: 'M'.repeat(400),
    };
    const out = summarizeResearch(long);
    const marketPart = out.match(/Market: .*?(?= Recent| Confidence|$)/)?.[0] ?? '';
    expect(marketPart.length).toBeLessThanOrEqual('Market: '.length + 280);
    expect(marketPart.endsWith('…')).toBe(true);
  });

  it('omits empty sections (no competitors, no news)', () => {
    const sparse: Research = {
      ...FULL,
      competitors: [],
      recent_news: [],
    };
    const out = summarizeResearch(sparse);
    expect(out).not.toContain('Competitors:');
    expect(out).not.toContain('Recent:');
    expect(out).toContain('Market:');
    expect(out).toContain('Confidence: medium.');
  });

  it('always includes confidence', () => {
    expect(summarizeResearch(FULL)).toContain('Confidence: medium.');
  });
});
