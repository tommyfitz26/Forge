import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { substitute } from '@/lib/ai/prompts';

const PROMPT_PATH = path.join(
  process.cwd(),
  'lib',
  'ai',
  'prompts',
  'pattern_detection.md',
);

const raw = readFileSync(PROMPT_PATH, 'utf8');

const sampleVars = {
  captures_block:
    '11111111-1111-4111-8111-111111111111 [idea] Voice First Standup Bot — A bot that records voice memos.\n22222222-2222-4222-8222-222222222222 [problem] Calendar Keeps Double-Booking — Scheduling tools never see real availability.',
};

describe('pattern_detection prompt template', () => {
  it('substitutes captures_block', () => {
    const rendered = substitute(raw, sampleVars);
    expect(rendered).toContain('Voice First Standup Bot');
    expect(rendered).toContain('Calendar Keeps Double-Booking');
    expect(rendered).not.toMatch(/\{\{\s*[a-zA-Z_]+\s*\}\}/);
  });

  it('throws if captures_block is omitted', () => {
    expect(() => substitute(raw, {})).toThrow(/captures_block/);
  });

  it('encodes the strict-pairing posture so empty pairs is the default answer', () => {
    expect(raw).toMatch(/empty/i);
    expect(raw).toMatch(/strict/i);
    // Reinforce: never invent IDs, must be different captures.
    expect(raw).toContain('verbatim');
    expect(raw).toMatch(/different captures/);
  });

  it('describes the pattern categories the model should look for', () => {
    expect(raw).toMatch(/Restatement/i);
    expect(raw).toMatch(/Cause and effect/i);
    expect(raw).toMatch(/facets/i);
  });
});
