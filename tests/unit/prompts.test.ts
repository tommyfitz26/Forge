import { describe, it, expect } from 'vitest';
import { substitute, MissingPromptVarError } from '@/lib/ai/prompts';

describe('prompt template substitution', () => {
  it('replaces a single var', () => {
    expect(substitute('Hello {{name}}', { name: 'Tommy' })).toBe('Hello Tommy');
  });

  it('replaces multiple occurrences of the same var', () => {
    expect(substitute('{{x}} and {{x}}', { x: 'A' })).toBe('A and A');
  });

  it('tolerates whitespace inside the braces', () => {
    expect(substitute('{{ name }}', { name: 'Tommy' })).toBe('Tommy');
  });

  it('preserves non-template braces', () => {
    expect(substitute('{ not a var } {{name}}', { name: 'Tommy' })).toBe(
      '{ not a var } Tommy',
    );
  });

  it('throws on missing var rather than silently emitting empty', () => {
    expect(() => substitute('Hello {{name}}', {})).toThrow(MissingPromptVarError);
  });
});
