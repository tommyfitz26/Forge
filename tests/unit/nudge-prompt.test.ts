import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { substitute } from '@/lib/ai/prompts';

const PROMPT_PATH = path.join(
  process.cwd(),
  'lib',
  'ai',
  'prompts',
  'nudge_question.md',
);

const raw = readFileSync(PROMPT_PATH, 'utf8');

const sampleVars = {
  kind: 'idea',
  title: 'Voice-First Standup Bot',
  content: 'A bot that runs async standups by collecting voice memos and producing a transcript.',
  research_summary: 'Competitors: Geekbot, Standuply. Market context: async-first remote teams growing.',
  conversation_state: '(none)',
};

describe('nudge_question prompt template', () => {
  it('substitutes every documented variable', () => {
    const rendered = substitute(raw, sampleVars);
    expect(rendered).toContain('Voice-First Standup Bot');
    expect(rendered).toContain('A bot that runs async standups');
    expect(rendered).toContain('Geekbot, Standuply');
    expect(rendered).toContain('idea');
    // No unsubstituted braces should leak through.
    expect(rendered).not.toMatch(/\{\{\s*[a-zA-Z_]+\s*\}\}/);
  });

  it('throws if any required var is omitted', () => {
    const partial = { ...sampleVars };
    delete (partial as Partial<typeof sampleVars>).conversation_state;
    expect(() => substitute(raw, partial)).toThrow(/conversation_state/);
  });

  it('renders comfortably below Haiku 4.5\'s 4096-token cache threshold', () => {
    // Rough char-per-token heuristic: 1 token ≈ 4 chars for English. Even with
    // a fat capture (5KB), the rendered prompt should stay well under the
    // 4096-token caching threshold, so caching is correctly skipped.
    const fatCapture = 'word '.repeat(1000);
    const rendered = substitute(raw, { ...sampleVars, content: fatCapture });
    const approxTokens = Math.ceil(rendered.length / 4);
    expect(approxTokens).toBeLessThan(4096);
  });

  it('mentions all four kinds so the model can route on any input', () => {
    expect(raw).toMatch(/\bproblem\b/);
    expect(raw).toMatch(/\bidea\b/);
    expect(raw).toMatch(/\bobservation\b/);
    expect(raw).toMatch(/\bresearch\b/);
  });
});
