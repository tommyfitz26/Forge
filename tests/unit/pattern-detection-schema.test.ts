import { describe, it, expect } from 'vitest';
import { PatternDetectionSchema } from '@/lib/ai/pattern-detection-schema';

const ID_A = '11111111-1111-4111-8111-111111111111';
const ID_B = '22222222-2222-4222-8222-222222222222';
const ID_C = '33333333-3333-4333-8333-333333333333';

describe('PatternDetectionSchema', () => {
  it('accepts an empty pairs array (the common case)', () => {
    const result = PatternDetectionSchema.safeParse({ pairs: [] });
    expect(result.success).toBe(true);
  });

  it('accepts a typical pair', () => {
    const result = PatternDetectionSchema.safeParse({
      pairs: [
        {
          capture_a: ID_A,
          capture_b: ID_B,
          reasoning: 'Both describe scheduling friction with multi-calendar conflicts.',
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a pair where capture_a equals capture_b', () => {
    const result = PatternDetectionSchema.safeParse({
      pairs: [
        { capture_a: ID_A, capture_b: ID_A, reasoning: 'self pair' },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.message.includes('different captures')),
      ).toBe(true);
    }
  });

  it('rejects non-UUID ids', () => {
    const result = PatternDetectionSchema.safeParse({
      pairs: [{ capture_a: 'a', capture_b: 'b', reasoning: 'r' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty reasoning', () => {
    const result = PatternDetectionSchema.safeParse({
      pairs: [{ capture_a: ID_A, capture_b: ID_B, reasoning: '' }],
    });
    expect(result.success).toBe(false);
  });

  it('caps pairs at 20', () => {
    const tooMany = Array.from({ length: 21 }, (_, i) => ({
      capture_a: ID_A,
      capture_b: i % 2 === 0 ? ID_B : ID_C,
      reasoning: 'r',
    }));
    const result = PatternDetectionSchema.safeParse({ pairs: tooMany });
    expect(result.success).toBe(false);
  });

  it('rejects missing pairs key', () => {
    expect(PatternDetectionSchema.safeParse({}).success).toBe(false);
  });
});
