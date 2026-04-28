import 'server-only';
import { Resend } from 'resend';
import { env } from '@/lib/env';

// Resend config is optional in env.ts (so dev boots without keys), but
// resolveResend() throws if either var is missing. Stage 2 of the weekly
// review job catches and treats it as a transient send failure — the next
// QStash redelivery attempts again, gated by the Resend `Idempotency-Key`
// header so a partial send isn't duplicated.

export class ResendNotConfiguredError extends Error {
  readonly missing: string[];
  constructor(missing: string[]) {
    super(`Resend not configured — missing: ${missing.join(', ')}`);
    this.name = 'ResendNotConfiguredError';
    this.missing = missing;
  }
}

let cachedClient: Resend | null = null;

export function getResend(): Resend {
  const missing: string[] = [];
  if (!env.RESEND_API_KEY) missing.push('RESEND_API_KEY');
  if (!env.RESEND_FROM_ADDRESS) missing.push('RESEND_FROM_ADDRESS');
  if (missing.length > 0) throw new ResendNotConfiguredError(missing);
  if (!cachedClient) {
    cachedClient = new Resend(env.RESEND_API_KEY!);
  }
  return cachedClient;
}

export function getFromAddress(): string {
  if (!env.RESEND_FROM_ADDRESS) {
    throw new ResendNotConfiguredError(['RESEND_FROM_ADDRESS']);
  }
  return env.RESEND_FROM_ADDRESS;
}

export function isResendConfigured(): boolean {
  return Boolean(env.RESEND_API_KEY && env.RESEND_FROM_ADDRESS);
}
