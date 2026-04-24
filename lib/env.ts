import 'server-only';
import { z } from 'zod';

const EnvSchema = z.object({
  // Supabase
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
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

  // Shortcut auth (Phase 1; optional until then)
  SHORTCUT_API_TOKEN: z.string().optional(),

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
