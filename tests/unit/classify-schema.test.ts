import { describe, it, expect } from 'vitest';
import { ClassifyCaptureSchema } from '@/lib/ai/tasks';

describe('ClassifyCaptureSchema', () => {
  it('accepts a real Haiku-shaped response', () => {
    const result = ClassifyCaptureSchema.safeParse({
      kind: 'idea',
      title: 'Voice First Standup Bot',
    });
    expect(result.success).toBe(true);
  });

  it('accepts every valid kind', () => {
    for (const kind of ['problem', 'idea', 'observation', 'research'] as const) {
      const result = ClassifyCaptureSchema.safeParse({ kind, title: 'Test Title Here' });
      expect(result.success).toBe(true);
    }
  });

  it('rejects an unknown kind', () => {
    const result = ClassifyCaptureSchema.safeParse({
      kind: 'feature',
      title: 'Some Title',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty title', () => {
    const result = ClassifyCaptureSchema.safeParse({ kind: 'idea', title: '' });
    expect(result.success).toBe(false);
  });

  it('rejects a title over 80 chars', () => {
    const result = ClassifyCaptureSchema.safeParse({
      kind: 'idea',
      title: 'x'.repeat(81),
    });
    expect(result.success).toBe(false);
  });
});
