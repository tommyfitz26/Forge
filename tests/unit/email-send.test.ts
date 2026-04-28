import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// sendWeeklyReviewEmail wraps Resend's emails.send. We mock the Resend module
// entirely so no network call happens. Three guarantees we lock in here:
//   1. The Idempotency-Key is `weekly:{weekOf}` (SPEC §4.5).
//   2. From / to / subject / html are forwarded verbatim; OWNER_EMAIL is the recipient.
//   3. Failure paths NEVER throw — they return { ok: false, error } and log.

const sendMock = vi.fn();

vi.mock('resend', () => ({
  Resend: class {
    constructor(_key?: string) {}
    readonly emails = { send: sendMock };
  },
}));

const baseEnv = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  OWNER_EMAIL: 'me@example.com',
  ANTHROPIC_API_KEY: 'sk-ant-x',
  OPENAI_API_KEY: 'sk-openai-x',
  SHORTCUT_API_TOKEN: 'a'.repeat(64),
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  RESEND_API_KEY: 're_test',
  RESEND_FROM_ADDRESS: 'forge@forge.mom',
};

const originalEnv = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  sendMock.mockReset();
  for (const key of Object.keys(baseEnv)) delete process.env[key];
  Object.assign(process.env, baseEnv);
});

afterEach(() => {
  process.env = { ...originalEnv };
});

const happyInput = {
  weekOf: '2026-04-27',
  subject: 'This week in Forge',
  html: '<h1>Hi</h1>',
};

describe('sendWeeklyReviewEmail', () => {
  it('forwards payload + attaches Idempotency-Key weekly:{weekOf}', async () => {
    sendMock.mockResolvedValueOnce({ data: { id: 'msg_123' }, error: null });
    const { sendWeeklyReviewEmail } = await import('@/lib/email/send');
    const result = await sendWeeklyReviewEmail(happyInput);

    expect(result).toEqual({ ok: true, id: 'msg_123' });
    expect(sendMock).toHaveBeenCalledOnce();
    const [payload, options] = sendMock.mock.calls[0]!;
    expect(payload).toMatchObject({
      from: 'forge@forge.mom',
      to: 'me@example.com',
      subject: happyInput.subject,
      html: happyInput.html,
    });
    expect((payload as { text?: string }).text).toBeUndefined();
    expect(options).toEqual({ idempotencyKey: 'weekly:2026-04-27' });
  });

  it('passes through the optional text body when provided', async () => {
    sendMock.mockResolvedValueOnce({ data: { id: 'msg_text' }, error: null });
    const { sendWeeklyReviewEmail } = await import('@/lib/email/send');
    await sendWeeklyReviewEmail({ ...happyInput, text: 'plain text version' });
    const [payload] = sendMock.mock.calls[0]!;
    expect((payload as { text?: string }).text).toBe('plain text version');
  });

  it('returns { ok: false } and does NOT throw when Resend returns an error', async () => {
    sendMock.mockResolvedValueOnce({
      data: null,
      error: { name: 'rate_limit_exceeded', message: 'too many requests' },
    });
    const { sendWeeklyReviewEmail } = await import('@/lib/email/send');
    const result = await sendWeeklyReviewEmail(happyInput);
    expect(result).toEqual({ ok: false, error: 'too many requests' });
  });

  it('returns { ok: false } and does NOT throw when the SDK throws', async () => {
    sendMock.mockRejectedValueOnce(new Error('network down'));
    const { sendWeeklyReviewEmail } = await import('@/lib/email/send');
    const result = await sendWeeklyReviewEmail(happyInput);
    expect(result).toEqual({ ok: false, error: 'network down' });
  });

  it('returns { ok: false } when Resend responds with no message id', async () => {
    sendMock.mockResolvedValueOnce({ data: null, error: null });
    const { sendWeeklyReviewEmail } = await import('@/lib/email/send');
    const result = await sendWeeklyReviewEmail(happyInput);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/no message id/i);
    }
  });

  it('returns { ok: false } when Resend env is missing — never throws', async () => {
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_ADDRESS;
    const { sendWeeklyReviewEmail } = await import('@/lib/email/send');
    const result = await sendWeeklyReviewEmail(happyInput);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/Resend not configured/);
    }
    expect(sendMock).not.toHaveBeenCalled();
  });
});
