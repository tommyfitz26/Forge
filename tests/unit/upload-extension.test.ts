import { describe, it, expect } from 'vitest';
import { extensionFromMime } from '@/lib/offline/upload';

describe('extensionFromMime', () => {
  it('strips the codec parameter from MediaRecorder MIMEs', () => {
    // Whisper sniffs format from the filename extension; `.webm;codecs=opus`
    // is rejected as "Invalid file format" even though `audio/webm` is supported.
    expect(extensionFromMime('audio/webm;codecs=opus')).toBe('webm');
  });

  it('strips x- prefix on Safari MIMEs', () => {
    expect(extensionFromMime('audio/x-m4a')).toBe('m4a');
  });

  it('returns subtype as-is for plain MIMEs', () => {
    expect(extensionFromMime('audio/mp4')).toBe('mp4');
    expect(extensionFromMime('audio/mpeg')).toBe('mpeg');
  });

  it('falls back to bin for malformed input', () => {
    expect(extensionFromMime('garbage')).toBe('bin');
    expect(extensionFromMime('')).toBe('bin');
  });
});
