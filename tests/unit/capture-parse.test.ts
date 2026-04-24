import { describe, it, expect } from 'vitest';
import { parsePrefix, heuristicTitle } from '@/lib/capture/parse';

describe('parsePrefix (SPEC §4.2 rule 1)', () => {
  it('matches lowercase prefix with colon', () => {
    const r = parsePrefix('idea: a voice-first note app');
    expect(r).toEqual({ matched: true, kind: 'idea', stripped: 'a voice-first note app' });
  });

  it('matches uppercase and mixed case', () => {
    expect(parsePrefix('PROBLEM: X')).toEqual({ matched: true, kind: 'problem', stripped: 'X' });
    expect(parsePrefix('Observation: Y')).toEqual({
      matched: true,
      kind: 'observation',
      stripped: 'Y',
    });
  });

  it('accepts dash and em-dash separators', () => {
    expect(parsePrefix('research - why do X')).toEqual({
      matched: true,
      kind: 'research',
      stripped: 'why do X',
    });
    expect(parsePrefix('idea — do thing')).toEqual({
      matched: true,
      kind: 'idea',
      stripped: 'do thing',
    });
  });

  it('tolerates leading whitespace', () => {
    expect(parsePrefix('   idea: hi')).toEqual({
      matched: true,
      kind: 'idea',
      stripped: 'hi',
    });
  });

  it('does not match a prefix embedded mid-sentence', () => {
    expect(parsePrefix('I have an idea: about this')).toEqual({ matched: false });
  });

  it('does not match an unknown prefix', () => {
    expect(parsePrefix('question: what about X')).toEqual({ matched: false });
  });

  it('does not match without a separator', () => {
    expect(parsePrefix('idea something')).toEqual({ matched: false });
  });
});

describe('heuristicTitle (SPEC §4.2 rule 5)', () => {
  it('returns short content unchanged (minus trailing punct)', () => {
    expect(heuristicTitle('A short note.')).toBe('A short note');
  });

  it('falls back to placeholder for empty content', () => {
    expect(heuristicTitle('')).toBe('Untitled capture');
    expect(heuristicTitle('   ')).toBe('Untitled capture');
  });

  it('cuts at a word boundary when content exceeds 60 chars', () => {
    const long =
      'my calendar keeps double-booking me and I really want to fix this once and for all';
    const title = heuristicTitle(long);
    expect(title.length).toBeLessThanOrEqual(60);
    expect(title.endsWith(' ')).toBe(false);
    // Must cut at a space, not mid-word
    expect(long.startsWith(title)).toBe(true);
  });

  it('strips trailing punctuation and whitespace', () => {
    expect(heuristicTitle('Hello, world!!!   ')).toBe('Hello, world');
  });
});
