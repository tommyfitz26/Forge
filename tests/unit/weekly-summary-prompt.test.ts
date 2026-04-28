import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { substitute } from '@/lib/ai/prompts';

const PROMPT_PATH = path.join(
  process.cwd(),
  'lib',
  'ai',
  'prompts',
  'weekly_summary.md',
);

const raw = readFileSync(PROMPT_PATH, 'utf8');

const sampleVars = {
  week_of: '2026-04-27',
  captures_block:
    '### [Idea] Voice First Standup Bot (Tue)\nid: 11111111-1111-4111-8111-111111111111\nA bot that takes voice memos and produces a daily transcript.\n\n### [Problem] Calendar Keeps Double-Booking (Sat)\nid: 22222222-2222-4222-8222-222222222222\nMy scheduling tools never see real availability.\nResearch: Calendly, Reclaim. Saturated market.',
  patterns_block: '(none)',
};

describe('weekly_summary prompt template', () => {
  it('substitutes every documented variable', () => {
    const rendered = substitute(raw, sampleVars);
    expect(rendered).toContain('2026-04-27');
    expect(rendered).toContain('Voice First Standup Bot');
    expect(rendered).toContain('Calendar Keeps Double-Booking');
    expect(rendered).toContain('(none)');
    expect(rendered).not.toMatch(/\{\{\s*[a-zA-Z_]+\s*\}\}/);
  });

  it('throws if any required var is omitted', () => {
    const partial = { ...sampleVars };
    delete (partial as Partial<typeof sampleVars>).patterns_block;
    expect(() => substitute(raw, partial)).toThrow(/patterns_block/);
  });

  it('instructs the model on JSON-only output and forbids invented IDs', () => {
    expect(raw).toMatch(/JSON only/i);
    expect(raw).toContain('verbatim');
    expect(raw).toMatch(/captures/);
    expect(raw).toMatch(/ready_to_develop_ids/);
    expect(raw).toMatch(/patterns_summary/);
  });

  it('renders comfortably under Sonnet 4.6\'s 2048-token cache threshold for a typical week', () => {
    const rendered = substitute(raw, sampleVars);
    const approxTokens = Math.ceil(rendered.length / 4);
    // The prompt itself (without a fat captures block) should sit well under
    // the 2048-token Sonnet caching threshold so we know caching is correctly
    // SKIPPED at our expected payload sizes — same posture as classify_capture.
    expect(approxTokens).toBeLessThan(2048);
  });
});
