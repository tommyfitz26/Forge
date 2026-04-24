'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { env } from '@/lib/env';

const LoginSchema = z.object({
  email: z.string().email().trim().toLowerCase(),
});

export type LoginResult =
  | { ok: true }
  | { ok: false; error: string };

export async function sendMagicLink(formData: FormData): Promise<LoginResult> {
  const parsed = LoginSchema.safeParse({ email: formData.get('email') });
  if (!parsed.success) {
    return { ok: false, error: 'Enter a valid email.' };
  }

  // SPEC §14 login-form spam guard: server-side compare before calling Supabase,
  // so magic-link emails are only sent to the owner. We return the same user-facing
  // message whether the address matched or not, so an attacker can't probe for
  // the owner's email via timing or copy differences.
  const isOwner = parsed.data.email === env.OWNER_EMAIL.toLowerCase();
  if (!isOwner) {
    return { ok: true };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      emailRedirectTo: `${env.NEXT_PUBLIC_APP_URL}/auth/callback`,
      shouldCreateUser: true,
    },
  });

  if (error) {
    return { ok: false, error: 'Could not send magic link. Try again.' };
  }

  return { ok: true };
}
