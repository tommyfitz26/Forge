import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// Mirrors lib/env.ts — kept in sync to test the schema in isolation
// without importing the module (which would throw on missing env).
const EnvSchema = z.object({
  SUPABASE_URL: z.string().url(),
  OWNER_EMAIL: z.string().email(),
  MAX_MONTHLY_COST_USD: z.coerce.number().positive().default(25),
  APP_SCHEDULE_TZ: z.string().default('America/New_York'),
});

describe('env validation', () => {
  it('parses a valid env', () => {
    const result = EnvSchema.safeParse({
      SUPABASE_URL: 'https://example.supabase.co',
      OWNER_EMAIL: 'me@example.com',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.APP_SCHEDULE_TZ).toBe('America/New_York');
      expect(result.data.MAX_MONTHLY_COST_USD).toBe(25);
    }
  });

  it('rejects an invalid URL', () => {
    const result = EnvSchema.safeParse({
      SUPABASE_URL: 'not-a-url',
      OWNER_EMAIL: 'me@example.com',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a missing required var', () => {
    const result = EnvSchema.safeParse({
      OWNER_EMAIL: 'me@example.com',
    });
    expect(result.success).toBe(false);
  });
});
