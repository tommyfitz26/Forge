import { describe, it, expect } from 'vitest';
import { NudgeQuestionSchema } from '@/lib/ai/nudge-schema';

describe('NudgeQuestionSchema', () => {
  it('accepts a typical nudge question', () => {
    const result = NudgeQuestionSchema.safeParse({
      question: 'Who is the first specific person you know who would pay for this?',
      reasoning: 'Advances idea template question 1 (specific customer).',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a question that does not end with ?', () => {
    const result = NudgeQuestionSchema.safeParse({
      question: 'Who is the first specific person you know who would pay for this',
      reasoning: 'r',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes('?'))).toBe(true);
    }
  });

  it('rejects a question that is too short (< 6 words)', () => {
    const result = NudgeQuestionSchema.safeParse({
      question: 'Why now?',
      reasoning: 'r',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes('6–30'))).toBe(true);
    }
  });

  it('rejects a question that runs over the 30-word ceiling', () => {
    const longQ =
      Array(40).fill('word').join(' ') + ' which is way too long for a push notification preview?';
    const result = NudgeQuestionSchema.safeParse({ question: longQ, reasoning: 'r' });
    expect(result.success).toBe(false);
  });

  it('accepts a 6-word lower-bound question', () => {
    const result = NudgeQuestionSchema.safeParse({
      question: 'Who is the actual first customer?',
      reasoning: 'r',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty reasoning', () => {
    const result = NudgeQuestionSchema.safeParse({
      question: 'Who is the first specific person you know who would pay for this?',
      reasoning: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing fields', () => {
    expect(NudgeQuestionSchema.safeParse({ question: 'a question with enough words?' }).success).toBe(false);
    expect(NudgeQuestionSchema.safeParse({ reasoning: 'r' }).success).toBe(false);
  });
});
