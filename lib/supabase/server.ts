import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

type CookieToSet = { name: string; value: string; options?: CookieOptions };
import type { Database } from '@/lib/types/db';
import { env } from '@/lib/env';

// Server client for Server Components, Server Actions, and Route Handlers.
// Uses the signed-in user's session cookie; RLS applies as `authenticated`.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            if (options) {
              cookieStore.set(name, value, options);
            } else {
              cookieStore.set(name, value);
            }
          }
        } catch {
          // setAll called from a Server Component — cookies are read-only there.
          // proxy.ts will refresh sessions, so this is safe to ignore.
        }
      },
    },
  });
}
