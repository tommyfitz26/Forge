import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// sendPush has two important guarantees:
//   1. on 404/410 it deletes the subscription row (browser revoked the endpoint)
//   2. on success it bumps last_used_at on the row
// Both branches are mocked here — we don't want a real network call or DB hit.

const sendNotification = vi.fn();
const setVapidDetails = vi.fn();

vi.mock('web-push', () => ({
  default: {
    sendNotification: (...args: unknown[]) => sendNotification(...args),
    setVapidDetails: (...args: unknown[]) => setVapidDetails(...args),
  },
}));

const deleteEq = vi.fn().mockResolvedValue({ error: null });
const updateEq = vi.fn().mockResolvedValue({ error: null });

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: (_table: string) => ({
      delete: () => ({ eq: deleteEq }),
      update: (_payload: unknown) => ({ eq: updateEq }),
    }),
  }),
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
  VAPID_PUBLIC_KEY: 'pub',
  VAPID_PRIVATE_KEY: 'priv',
  VAPID_SUBJECT: 'mailto:me@example.com',
};

const originalEnv = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  sendNotification.mockReset();
  setVapidDetails.mockReset();
  deleteEq.mockClear();
  updateEq.mockClear();
  for (const key of Object.keys(baseEnv)) delete process.env[key];
  Object.assign(process.env, baseEnv);
});

afterEach(() => {
  process.env = { ...originalEnv };
});

const sub = {
  id: 'sub-1',
  endpoint: 'https://push.example.com/sub/abc',
  p256dhKey: 'p256dh',
  authKey: 'auth',
};

describe('sendPush', () => {
  it('returns ok and bumps last_used_at on success', async () => {
    sendNotification.mockResolvedValueOnce({ statusCode: 201, body: '', headers: {} });
    const { sendPush } = await import('@/lib/push/send');
    const result = await sendPush(sub, { title: 't', body: 'b' });
    expect(result).toEqual({ ok: true, statusCode: 201 });
    expect(setVapidDetails).toHaveBeenCalledOnce();
    expect(updateEq).toHaveBeenCalledWith('id', 'sub-1');
    expect(deleteEq).not.toHaveBeenCalled();
  });

  it('deletes the subscription row on 410 Gone', async () => {
    sendNotification.mockRejectedValueOnce(Object.assign(new Error('gone'), { statusCode: 410 }));
    const { sendPush } = await import('@/lib/push/send');
    const result = await sendPush(sub, { title: 't', body: 'b' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.expired).toBe(true);
      expect(result.statusCode).toBe(410);
    }
    expect(deleteEq).toHaveBeenCalledWith('endpoint', sub.endpoint);
    expect(updateEq).not.toHaveBeenCalled();
  });

  it('deletes the subscription row on 404 Not Found', async () => {
    sendNotification.mockRejectedValueOnce(
      Object.assign(new Error('not found'), { statusCode: 404 }),
    );
    const { sendPush } = await import('@/lib/push/send');
    const result = await sendPush(sub, { title: 't', body: 'b' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.expired).toBe(true);
    }
    expect(deleteEq).toHaveBeenCalledWith('endpoint', sub.endpoint);
  });

  it('does NOT delete the row on transient (5xx) failures', async () => {
    sendNotification.mockRejectedValueOnce(
      Object.assign(new Error('temporarily unavailable'), { statusCode: 503 }),
    );
    const { sendPush } = await import('@/lib/push/send');
    const result = await sendPush(sub, { title: 't', body: 'b' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.expired).toBe(false);
      expect(result.statusCode).toBe(503);
    }
    expect(deleteEq).not.toHaveBeenCalled();
  });
});
