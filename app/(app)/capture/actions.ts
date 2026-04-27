'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { persistCapture } from '@/lib/capture/persist';

const CreateTextSchema = z.object({
  content: z.string().trim().min(1, 'Write something first.').max(5000),
});

export type CreateResult = { ok: true; id: string } | { ok: false; error: string };

export async function createTextCapture(formData: FormData): Promise<CreateResult> {
  const parsed = CreateTextSchema.safeParse({ content: formData.get('content') });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  let id: string;
  try {
    const result = await persistCapture(supabase, {
      userId: user.id,
      content: parsed.data.content,
      source: 'web',
    });
    id = result.id;
  } catch {
    return { ok: false, error: 'Could not save capture.' };
  }

  revalidatePath('/');
  redirect(`/capture/${id}`);
}
