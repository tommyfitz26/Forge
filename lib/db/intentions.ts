// Intentions query helpers (Phase 4.3.5).
//
// One intention per (owner, day). The Today's-focus card reads
// today's row; history is available via listIntentions for forward-
// compatibility with a "previous focuses" UI.
//
// Untyped escape hatch — drop after `pnpm db:types`.

import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import type { Intention } from '@/lib/types/intentions';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function untypedSupabase(): Promise<any> {
  return createClient();
}

/** ISO 'YYYY-MM-DD' for the user's local date. v1: server-local. */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function getTodaysIntention(): Promise<Intention | null> {
  return getIntentionForDay(todayIso());
}

export async function getIntentionForDay(day: string): Promise<Intention | null> {
  const supabase = await untypedSupabase();
  const { data, error } = await supabase
    .from('intentions')
    .select('*')
    .eq('day', day)
    .maybeSingle();
  if (error) {
    logger.error('intentions.get.failed', { day, err: error.message });
    return null;
  }
  return (data ?? null) as Intention | null;
}

export async function listIntentions(limit = 30): Promise<Intention[]> {
  const supabase = await untypedSupabase();
  const { data, error } = await supabase
    .from('intentions')
    .select('*')
    .order('day', { ascending: false })
    .limit(limit);
  if (error) {
    logger.error('intentions.list.failed', { err: error.message });
    return [];
  }
  return (data ?? []) as Intention[];
}
