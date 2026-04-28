import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Re-import the module fresh in each test so the cached config + env reads
// reflect the current process.env. vi.resetModules() clears the require cache.

const REQUIRED = ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'] as const;

const baseEnv = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  OWNER_EMAIL: 'me@example.com',
  ANTHROPIC_API_KEY: 'sk-ant-x',
  OPENAI_API_KEY: 'sk-openai-x',
  SHORTCUT_API_TOKEN: 'a'.repeat(64),
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
};

const originalEnv = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  for (const key of [...REQUIRED, ...Object.keys(baseEnv)]) {
    delete process.env[key];
  }
  Object.assign(process.env, baseEnv);
});

afterEach(() => {
  for (const key of REQUIRED) delete process.env[key];
  process.env = { ...originalEnv };
});

describe('resolveVapid', () => {
  it('throws VapidNotConfiguredError listing every missing var', async () => {
    const { resolveVapid, VapidNotConfiguredError } = await import('@/lib/push/vapid');
    expect(() => resolveVapid()).toThrowError(VapidNotConfiguredError);
    try {
      resolveVapid();
    } catch (err) {
      expect(err).toBeInstanceOf(VapidNotConfiguredError);
      expect((err as InstanceType<typeof VapidNotConfiguredError>).missing).toEqual([
        ...REQUIRED,
      ]);
    }
  });

  it('throws when only one var is missing', async () => {
    process.env.VAPID_PUBLIC_KEY = 'pub';
    process.env.VAPID_PRIVATE_KEY = 'priv';
    // VAPID_SUBJECT intentionally absent
    const { resolveVapid, VapidNotConfiguredError } = await import('@/lib/push/vapid');
    try {
      resolveVapid();
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(VapidNotConfiguredError);
      expect((err as InstanceType<typeof VapidNotConfiguredError>).missing).toEqual([
        'VAPID_SUBJECT',
      ]);
    }
  });

  it('returns a config when all three are set', async () => {
    process.env.VAPID_PUBLIC_KEY = 'pub';
    process.env.VAPID_PRIVATE_KEY = 'priv';
    process.env.VAPID_SUBJECT = 'mailto:me@example.com';
    const { resolveVapid, isVapidConfigured } = await import('@/lib/push/vapid');
    expect(isVapidConfigured()).toBe(true);
    expect(resolveVapid()).toEqual({
      publicKey: 'pub',
      privateKey: 'priv',
      subject: 'mailto:me@example.com',
    });
  });
});
