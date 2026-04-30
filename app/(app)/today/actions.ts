'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { todayIso } from '@/lib/db/intentions';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function untypedSupabase(): Promise<any> {
  return createClient();
}

const SetFocusSchema = z.object({
  body: z.string().trim().min(1, 'Add a focus first.').max(280),
  /** ISO 'YYYY-MM-DD'. Defaults to today server-local. */
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export type FocusResult = { ok: true; id: string } | { ok: false; error: string };

/**
 * Upsert today's focus. One row per (owner, day) — re-saving the same day
 * overwrites the body and bumps updated_at.
 */
export async function setTodaysFocus(formData: FormData): Promise<FocusResult> {
  const parsed = SetFocusSchema.safeParse({
    body: formData.get('body'),
    day: formData.get('day') ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const supabase = await untypedSupabase();
  const day = parsed.data.day ?? todayIso();

  // Upsert on (owner_id, day) — the unique index `intentions_one_per_day`.
  const { data, error } = await supabase
    .from('intentions')
    .upsert(
      {
        owner_id: user.id,
        day,
        body: parsed.data.body,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'owner_id,day' },
    )
    .select('id')
    .single();

  if (error || !data) {
    logger.error('intentions.upsert.failed', { day, err: error?.message, ownerId: user.id });
    return { ok: false, error: 'Could not save focus.' };
  }

  logger.info('intentions.saved', { id: data.id, day, ownerId: user.id });
  revalidatePath('/today');
  return { ok: true, id: data.id };
}

/**
 * Clear today's focus (delete the row). Used when the user wants to take
 * the lamp off the bench mid-day.
 */
export async function clearTodaysFocus(): Promise<{ ok: true } | { ok: false; error: string }> {
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const supabase = await untypedSupabase();
  const { error } = await supabase
    .from('intentions')
    .delete()
    .eq('day', todayIso());
  if (error) {
    logger.error('intentions.delete.failed', { err: error.message, ownerId: user.id });
    return { ok: false, error: 'Could not clear focus.' };
  }
  revalidatePath('/today');
  return { ok: true };
}
