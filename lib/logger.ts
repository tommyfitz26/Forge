import 'server-only';

// Structured logger per SPEC §10.8.
// - dev: pretty, single-line, colored prefix
// - prod: JSON lines on stdout (Vercel log drain collects them)
//
// Usage:
//   logger.info('capture.created', { captureId, kind });
//   logger.error('research.failed', { captureId, err: err.message });
//
// Key events the app should emit (keep names stable — logs become queries):
//   capture.created · classify.result · research.start · research.end
//   nudge.sent · push.sent · weekly.sent · job.start · job.end

type Level = 'debug' | 'info' | 'warn' | 'error';
type Context = Record<string, unknown>;

const isProd = process.env.NODE_ENV === 'production';

function serialize(value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  return value;
}

function emit(level: Level, event: string, context: Context | undefined) {
  const payload: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    event,
  };
  if (context) {
    for (const [k, v] of Object.entries(context)) {
      payload[k] = serialize(v);
    }
  }

  if (isProd) {
    // JSON line — Vercel collects stdout automatically.
    process.stdout.write(`${JSON.stringify(payload)}\n`);
    return;
  }

  // Pretty dev output. Keep it one-line so grep works. Strip ts/level/event
  // from the serialized context since they're already in the prefix.
  const color = level === 'error' ? '\x1b[31m' : level === 'warn' ? '\x1b[33m' : level === 'debug' ? '\x1b[90m' : '\x1b[36m';
  const reset = '\x1b[0m';
  const { ts: _ts, level: _level, event: _event, ...rest } = payload;
  const hasContext = Object.keys(rest).length > 0;
  const ctxStr = hasContext ? ' ' + JSON.stringify(rest) : '';
  console.log(`${color}[${level}]${reset} ${event}${ctxStr}`);
}

export const logger = {
  debug: (event: string, context?: Context) => emit('debug', event, context),
  info: (event: string, context?: Context) => emit('info', event, context),
  warn: (event: string, context?: Context) => emit('warn', event, context),
  error: (event: string, context?: Context) => emit('error', event, context),
};
