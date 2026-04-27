import { describe, it, expect } from 'vitest';
import { extractBearer, verifyBearer } from '@/lib/auth/shortcut';

const TOKEN = 'a'.repeat(64);

describe('extractBearer', () => {
  it('returns the token from a valid header', () => {
    expect(extractBearer(`Bearer ${TOKEN}`)).toBe(TOKEN);
  });

  it('is case-insensitive on the scheme', () => {
    expect(extractBearer(`bearer ${TOKEN}`)).toBe(TOKEN);
    expect(extractBearer(`BEARER ${TOKEN}`)).toBe(TOKEN);
  });

  it('strips surrounding whitespace from the token', () => {
    expect(extractBearer(`Bearer   ${TOKEN}  `)).toBe(TOKEN);
  });

  it('returns null on a missing header', () => {
    expect(extractBearer(null)).toBeNull();
  });

  it('returns null on a non-Bearer scheme', () => {
    expect(extractBearer(`Basic ${TOKEN}`)).toBeNull();
  });

  it('returns null on Bearer with no token', () => {
    expect(extractBearer('Bearer ')).toBeNull();
  });
});

describe('verifyBearer', () => {
  it('accepts a valid header', () => {
    expect(verifyBearer(`Bearer ${TOKEN}`, TOKEN)).toBe(true);
  });

  it('rejects a missing header', () => {
    expect(verifyBearer(null, TOKEN)).toBe(false);
  });

  it('rejects a wrong-length token without throwing on timingSafeEqual', () => {
    // crypto.timingSafeEqual throws on length mismatch; the helper must guard.
    expect(verifyBearer('Bearer short', TOKEN)).toBe(false);
  });

  it('rejects a wrong same-length token', () => {
    const wrong = 'b'.repeat(64);
    expect(verifyBearer(`Bearer ${wrong}`, TOKEN)).toBe(false);
  });

  it('rejects a malformed scheme', () => {
    expect(verifyBearer(TOKEN, TOKEN)).toBe(false);
  });
});
