import { describe, it, expect } from 'vitest';
import { urlBase64ToUint8Array } from '@/lib/push/encoding';

describe('urlBase64ToUint8Array', () => {
  it('decodes a standard base64 string', () => {
    // "hello" → aGVsbG8=
    const bytes = urlBase64ToUint8Array('aGVsbG8=');
    expect(Array.from(bytes)).toEqual([0x68, 0x65, 0x6c, 0x6c, 0x6f]);
  });

  it('handles missing padding', () => {
    // "hello" without the trailing '='
    const bytes = urlBase64ToUint8Array('aGVsbG8');
    expect(Array.from(bytes)).toEqual([0x68, 0x65, 0x6c, 0x6c, 0x6f]);
  });

  it('translates url-safe alphabet (- and _) to + and /', () => {
    // bytes [0xfb, 0xff, 0xbf] → standard '+/+' → url-safe '-_-'
    const std = urlBase64ToUint8Array('+/+/');
    const urlSafe = urlBase64ToUint8Array('-_-_');
    expect(Array.from(std)).toEqual(Array.from(urlSafe));
  });

  it('produces a Uint8Array suitable for applicationServerKey (typical VAPID length)', () => {
    // VAPID public keys are 65 bytes uncompressed P-256 → 87 url-safe base64 chars (no padding).
    // Build a real 65-byte buffer and round-trip through encode → urlBase64ToUint8Array.
    const raw = new Uint8Array(65);
    for (let i = 0; i < raw.length; i++) raw[i] = (i * 31 + 7) & 0xff;
    const bin = String.fromCharCode(...raw);
    const urlSafe = Buffer.from(bin, 'binary')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const decoded = urlBase64ToUint8Array(urlSafe);
    expect(decoded).toBeInstanceOf(Uint8Array);
    expect(decoded.length).toBe(65);
    expect(Array.from(decoded)).toEqual(Array.from(raw));
  });
});
