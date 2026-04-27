// NOTE: intentionally no `server-only` import — this module is pulled in by
// proxy.ts, which Next.js resolves outside the `react-server` export
// condition, so `server-only`'s default export would throw at module load.
// Non-NEXT_PUBLIC_ vars won't reach the client bundle regardless of this
// file's markers; the Next.js bundler only inlines NEXT_PUBLIC_* into client JS.
import { z } from 'zod';

const EnvSchema = z.object({
  // Supabase
  // URL + anon key are NEXT_PUBLIC_ because the browser client needs them bundled into
  // client JS. The anon key is public by design — RLS is the security boundary.
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // Owner
  OWNER_EMAIL: z.string().email(),

  // Anthropic
  ANTHROPIC_API_KEY: z.string().min(1),

  // OpenAI (Whisper only)
  OPENAI_API_KEY: z.string().min(1),

  // Resend (Phase 3; optional until then)
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_ADDRESS: z.string().optional(),

  // QStash (Phase 2; optional until then)
  QSTASH_TOKEN: z.string().optional(),
  QSTASH_CURRENT_SIGNING_KEY: z.string().optional(),
  QSTASH_NEXT_SIGNING_KEY: z.string().optional(),

  // Web Push (Phase 3; optional until then)
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().optional(),

  // Shortcut auth — long-lived Bearer for POST /api/capture?source=shortcut.
  // 64 hex chars (32 random bytes); generate with:
  //   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  SHORTCUT_API_TOKEN: z.string().min(32),

  // Dev escape hatch for /api/jobs/* — when NODE_ENV !== 'production', the
  // QStash signature verifier also accepts `Authorization: Bearer <token>`
  // matching this value. Lets you curl jobs locally without ngrok. Optional;
  // when unset, all dev requests must still be QStash-signed.
  JOB_DEV_BEARER: z.string().optional(),

  // App
  NEXT_PUBLIC_APP_URL: z.string().url(),
  SENTRY_DSN: z.string().optional(),

  // Scheduling (§4.4) — single constant, no per-user timezone in v1
  APP_SCHEDULE_TZ: z.string().default('America/New_York'),

  // Budgets (§11.2, §4.3)
  MAX_MONTHLY_COST_USD: z.coerce.number().positive().default(25),
  MAX_RESEARCH_COST_USD: z.coerce.number().positive().default(0.25),

  // Node env
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  throw new Error(`Invalid environment variables:\n${issues}`);
}

export const env = parsed.data;
