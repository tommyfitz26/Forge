import { describe, it, expect } from 'vitest';
import {
  extractTerminalToolInput,
  type ContentBlock,
} from '@/lib/ai/extract-tool-output';

describe('extractTerminalToolInput', () => {
  it('returns the input of a single matching tool_use block', () => {
    const blocks: ContentBlock[] = [
      { type: 'text', text: 'I will search.' },
      { type: 'tool_use', name: 'submit_research', input: { ok: true } },
    ];
    expect(extractTerminalToolInput(blocks, 'submit_research')).toEqual({ ok: true });
  });

  it('returns the LAST matching tool_use when there are multiple', () => {
    const blocks: ContentBlock[] = [
      { type: 'tool_use', name: 'submit_research', input: { v: 1 } },
      { type: 'text', text: 'Refining…' },
      { type: 'tool_use', name: 'submit_research', input: { v: 2 } },
    ];
    expect(extractTerminalToolInput(blocks, 'submit_research')).toEqual({ v: 2 });
  });

  it('ignores tool_use blocks for other tool names (e.g. web_search)', () => {
    const blocks: ContentBlock[] = [
      { type: 'tool_use', name: 'web_search', input: { query: 'hi' } },
      { type: 'text', text: 'Searching.' },
    ];
    expect(extractTerminalToolInput(blocks, 'submit_research')).toBeUndefined();
  });

  it('returns undefined when no matching tool was called', () => {
    const blocks: ContentBlock[] = [{ type: 'text', text: 'nope' }];
    expect(extractTerminalToolInput(blocks, 'submit_research')).toBeUndefined();
  });

  it('returns undefined on an empty content array', () => {
    expect(extractTerminalToolInput([], 'submit_research')).toBeUndefined();
  });

  it('preserves complex input shapes (arrays, nested objects)', () => {
    const payload = {
      competitors: [{ name: 'X', oneLiner: 'y' }],
      angles: [{ title: 'A', reasoning: 'b' }],
    };
    const blocks: ContentBlock[] = [{ type: 'tool_use', name: 'submit_research', input: payload }];
    expect(extractTerminalToolInput(blocks, 'submit_research')).toEqual(payload);
  });
});
