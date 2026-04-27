import 'server-only';
import crypto from 'node:crypto';

const BEARER_RE = /^Bearer\s+(.+)$/i;

export function extractBearer(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(BEARER_RE);
  return match ? (match[1] ?? '').trim() || null : null;
}

/**
 * Constant-time check of an `Authorization: Bearer …` header against an
 * expected token. Length-mismatch returns early — that's fine because tokens
 * have a fixed length, so leaking length on a wrong-length attempt doesn't
 * expose anything.
 */
export function verifyBearer(authHeader: string | null, expected: string): boolean {
  const presented = extractBearer(authHeader);
  if (!presented) return false;
  if (presented.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(presented), Buffer.from(expected));
}
