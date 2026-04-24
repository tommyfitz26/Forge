import 'server-only';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/db';
import { env } from '@/lib/env';

// Service-role client for background jobs (/api/jobs/*) and operational pages.
// BYPASSES RLS — never instantiate from user-facing code paths. Use `@/lib/supabase/server`
// for anything that should respect RLS (SPEC §6.2, §10.9).
export function createServiceClient() {
  return createSupabaseClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
