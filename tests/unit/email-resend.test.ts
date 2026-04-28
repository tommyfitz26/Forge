import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Re-import the module fresh in each test so the cached client + env reads
// reflect the current process.env. vi.resetModules() clears the require cache.

const REQUIRED = ['RESEND_API_KEY', 'RESEND_FROM_ADDRESS'] as const;

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

describe('getResend / getFromAddress', () => {
  it('throws ResendNotConfiguredError listing every missing var', async () => {
    const { getResend, ResendNotConfiguredError } = await import('@/lib/email/resend');
    expect(() => getResend()).toThrowError(ResendNotConfiguredError);
    try {
      getResend();
    } catch (err) {
      expect(err).toBeInstanceOf(ResendNotConfiguredError);
      expect(
        (err as InstanceType<typeof ResendNotConfiguredError>).missing,
      ).toEqual([...REQUIRED]);
    }
  });

  it('throws when only one var is missing', async () => {
    process.env.RESEND_API_KEY = 're_test';
    // RESEND_FROM_ADDRESS intentionally absent
    const { getResend, ResendNotConfiguredError } = await import('@/lib/email/resend');
    try {
      getResend();
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ResendNotConfiguredError);
      expect(
        (err as InstanceType<typeof ResendNotConfiguredError>).missing,
      ).toEqual(['RESEND_FROM_ADDRESS']);
    }
  });

  it('returns a client and the from-address when both are set', async () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.RESEND_FROM_ADDRESS = 'forge@forge.mom';
    const { getResend, getFromAddress, isResendConfigured } = await import(
      '@/lib/email/resend'
    );
    expect(isResendConfigured()).toBe(true);
    expect(getFromAddress()).toBe('forge@forge.mom');
    // Just check we got an object with an `emails.send` callable — don't make a network call.
    const client = getResend();
    expect(typeof client.emails.send).toBe('function');
  });

  it('caches the client across calls', async () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.RESEND_FROM_ADDRESS = 'forge@forge.mom';
    const { getResend } = await import('@/lib/email/resend');
    expect(getResend()).toBe(getResend());
  });

  it('isResendConfigured returns false when either var is missing', async () => {
    const { isResendConfigured } = await import('@/lib/email/resend');
    expect(isResendConfigured()).toBe(false);
  });
});
