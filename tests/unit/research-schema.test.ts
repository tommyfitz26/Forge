import { describe, it, expect } from 'vitest';
import { ResearchSchema } from '@/lib/ai/research-schema';

const fixture = {
  competitors: [
    {
      name: 'Notion AI',
      url: 'https://notion.so/ai',
      oneLiner: 'Inline LLM features inside the Notion editor.',
    },
    { name: 'Mem', oneLiner: 'AI-first notes app.' },
  ],
  market_context:
    'AI note-taking is a crowded mid-market space. Incumbents bundle the feature; standalone tools struggle on retention.',
  recent_news: [
    {
      title: 'Notion ships AI v3',
      url: 'https://example.com/notion-ai-v3',
      summary: 'New tool-using agent surface.',
      date: '2026-03-12',
    },
  ],
  angles: [
    {
      title: 'Voice-first capture',
      reasoning: 'Underserved on mobile; the others are typing-first.',
    },
    {
      title: 'Single-user, private',
      reasoning: 'Most competitors optimize for team use; quiet niche on solo.',
    },
  ],
  confidence: 'medium' as const,
  sources_count: 6,
  generated_at: '2026-04-27T15:00:00Z',
};

describe('ResearchSchema', () => {
  it('accepts a Sonnet-shaped fixture', () => {
    const result = ResearchSchema.safeParse(fixture);
    expect(result.success).toBe(true);
  });

  it('accepts empty arrays for competitors / news', () => {
    const result = ResearchSchema.safeParse({
      ...fixture,
      competitors: [],
      recent_news: [],
    });
    expect(result.success).toBe(true);
  });

  it('treats competitor.url as optional but rejects bad URLs', () => {
    const ok = ResearchSchema.safeParse({
      ...fixture,
      competitors: [{ name: 'X', oneLiner: 'no url' }],
    });
    expect(ok.success).toBe(true);

    const bad = ResearchSchema.safeParse({
      ...fixture,
      competitors: [{ name: 'X', url: 'not a url', oneLiner: 'bad' }],
    });
    expect(bad.success).toBe(false);
  });

  it('requires a recent_news item to have a real URL', () => {
    const result = ResearchSchema.safeParse({
      ...fixture,
      recent_news: [{ title: 'x', url: 'nope', summary: 'y' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown confidence level', () => {
    const result = ResearchSchema.safeParse({ ...fixture, confidence: 'extreme' });
    expect(result.success).toBe(false);
  });

  it('rejects negative sources_count', () => {
    const result = ResearchSchema.safeParse({ ...fixture, sources_count: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects empty market_context', () => {
    const result = ResearchSchema.safeParse({ ...fixture, market_context: '' });
    expect(result.success).toBe(false);
  });
});
