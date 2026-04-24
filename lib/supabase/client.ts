import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/lib/types/db';

// Browser client for Client Components. Values come from NEXT_PUBLIC_* env vars
// because they must be bundled into client-side JS. The anon key is public by
// design — RLS is the security boundary.
export function createClient() {
  return createBrowserClient<Database>(
    process.env['NEXT_PUBLIC_SUPABASE_URL']!,
    process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY']!,
  );
}
