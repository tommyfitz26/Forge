import { describe, it, expect } from 'vitest';
import {
  MAX_PHOTO_BYTES,
  isAcceptedPhotoMime,
  photoMimeToExtension,
} from '@/lib/capture/photo';

describe('photo MIME helpers', () => {
  it('matches the bucket-level cap', () => {
    expect(MAX_PHOTO_BYTES).toBe(15 * 1024 * 1024);
  });

  it('accepts every supported MIME', () => {
    const supported = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
    for (const m of supported) expect(isAcceptedPhotoMime(m)).toBe(true);
  });

  it('rejects unsupported MIMEs', () => {
    expect(isAcceptedPhotoMime('image/gif')).toBe(false);
    expect(isAcceptedPhotoMime('image/avif')).toBe(false);
    expect(isAcceptedPhotoMime('application/pdf')).toBe(false);
    expect(isAcceptedPhotoMime('')).toBe(false);
  });

  it('maps each accepted MIME to a clean extension', () => {
    expect(photoMimeToExtension('image/jpeg')).toBe('jpg');
    expect(photoMimeToExtension('image/png')).toBe('png');
    expect(photoMimeToExtension('image/webp')).toBe('webp');
    expect(photoMimeToExtension('image/heic')).toBe('heic');
    expect(photoMimeToExtension('image/heif')).toBe('heif');
  });

  it('falls back to bin for unknown MIMEs', () => {
    expect(photoMimeToExtension('image/gif')).toBe('bin');
    expect(photoMimeToExtension('')).toBe('bin');
  });
});
