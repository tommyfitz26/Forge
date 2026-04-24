import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('logger', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    vi.resetModules();
  });

  it('emits pretty output in dev', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const { logger } = await import('@/lib/logger');

    logger.info('test.event', { captureId: 'abc-123' });
    expect(consoleSpy).toHaveBeenCalledOnce();
    const line = consoleSpy.mock.calls[0]?.[0];
    expect(line).toContain('[info]');
    expect(line).toContain('test.event');
    expect(line).toContain('captureId');
    expect(line).toContain('abc-123');
  });

  it('serializes Error instances with name/message/stack', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const { logger } = await import('@/lib/logger');

    const err = new Error('boom');
    logger.error('research.failed', { err });
    const line = consoleSpy.mock.calls[0]?.[0];
    expect(line).toContain('boom');
    expect(line).toContain('"name":"Error"');
  });

  it('emits JSON in prod', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const { logger } = await import('@/lib/logger');

    logger.warn('nudge.skipped', { reason: 'no_eligible' });
    expect(writeSpy).toHaveBeenCalledOnce();
    const line = writeSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(line);
    expect(parsed.level).toBe('warn');
    expect(parsed.event).toBe('nudge.skipped');
    expect(parsed.reason).toBe('no_eligible');
    expect(typeof parsed.ts).toBe('string');

    writeSpy.mockRestore();
  });
});
