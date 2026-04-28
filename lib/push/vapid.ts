import 'server-only';
import { env } from '@/lib/env';

// VAPID config is optional in env.ts (so dev boots without keys), but
// resolveVapid() throws if any of the three is missing. Push routes catch this
// and return 503; the cron-driven nudge job will surface it as a job failure.

export type VapidConfig = {
  publicKey: string;
  privateKey: string;
  subject: string;
};

export class VapidNotConfiguredError extends Error {
  readonly missing: string[];
  constructor(missing: string[]) {
    super(`VAPID not configured — missing: ${missing.join(', ')}`);
    this.name = 'VapidNotConfiguredError';
    this.missing = missing;
  }
}

let cached: VapidConfig | null = null;

export function resolveVapid(): VapidConfig {
  if (cached) return cached;
  const missing: string[] = [];
  if (!env.VAPID_PUBLIC_KEY) missing.push('VAPID_PUBLIC_KEY');
  if (!env.VAPID_PRIVATE_KEY) missing.push('VAPID_PRIVATE_KEY');
  if (!env.VAPID_SUBJECT) missing.push('VAPID_SUBJECT');
  if (missing.length > 0) throw new VapidNotConfiguredError(missing);
  cached = {
    publicKey: env.VAPID_PUBLIC_KEY!,
    privateKey: env.VAPID_PRIVATE_KEY!,
    subject: env.VAPID_SUBJECT!,
  };
  return cached;
}

export function isVapidConfigured(): boolean {
  return Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT);
}
