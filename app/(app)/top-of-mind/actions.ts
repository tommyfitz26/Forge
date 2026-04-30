'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { PIN_SOURCE_KINDS } from '@/lib/types/pins';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function untypedSupabase(): Promise<any> {
  return createClient();
}

const PinSchema = z.object({
  source_kind: z.enum(PIN_SOURCE_KINDS),
  source_id: z.string().uuid(),
});

function pathsToRevalidate(sourceKind: string, sourceId: string): string[] {
  const paths = ['/top-of-mind'];
  switch (sourceKind) {
    case 'capture':
      paths.push('/stream', `/capture/${sourceId}`);
      break;
    case 'project':
      paths.push('/workshop', `/projects/${sourceId}`);
      break;
    case 'thread':
      paths.push('/threads', `/threads/${sourceId}`);
      break;
    case 'journal_entry':
      paths.push('/journal');
      break;
  }
  return paths;
}

export async function pinItem(formData: FormData): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = PinSchema.safeParse({
    source_kind: formData.get('source_kind'),
    source_id: formData.get('source_id'),
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
  // Idempotent — composite primary key makes re-pinning a no-op.
  const { error } = await supabase.from('pins').upsert(
    {
      owner_id: user.id,
      source_kind: parsed.data.source_kind,
      source_id: parsed.data.source_id,
    },
    { onConflict: 'owner_id,source_kind,source_id', ignoreDuplicates: true },
  );
  if (error) {
    logger.error('pins.add.failed', {
      sourceKind: parsed.data.source_kind,
      sourceId: parsed.data.source_id,
      err: error.message,
    });
    return { ok: false, error: 'Could not pin.' };
  }

  for (const p of pathsToRevalidate(parsed.data.source_kind, parsed.data.source_id)) {
    revalidatePath(p);
  }
  return { ok: true };
}

export async function unpinItem(formData: FormData): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = PinSchema.safeParse({
    source_kind: formData.get('source_kind'),
    source_id: formData.get('source_id'),
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
  const { error } = await supabase
    .from('pins')
    .delete()
    .eq('owner_id', user.id)
    .eq('source_kind', parsed.data.source_kind)
    .eq('source_id', parsed.data.source_id);
  if (error) {
    logger.error('pins.remove.failed', {
      sourceKind: parsed.data.source_kind,
      sourceId: parsed.data.source_id,
      err: error.message,
    });
    return { ok: false, error: 'Could not unpin.' };
  }

  for (const p of pathsToRevalidate(parsed.data.source_kind, parsed.data.source_id)) {
    revalidatePath(p);
  }
  return { ok: true };
}

export async function togglePin(formData: FormData): Promise<{ ok: true; pinned: boolean } | { ok: false; error: string }> {
  const parsed = PinSchema.safeParse({
    source_kind: formData.get('source_kind'),
    source_id: formData.get('source_id'),
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

  // Read current state, then flip.
  const { data: existing } = await supabase
    .from('pins')
    .select('source_id')
    .eq('owner_id', user.id)
    .eq('source_kind', parsed.data.source_kind)
    .eq('source_id', parsed.data.source_id)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from('pins')
      .delete()
      .eq('owner_id', user.id)
      .eq('source_kind', parsed.data.source_kind)
      .eq('source_id', parsed.data.source_id);
    if (error) return { ok: false, error: 'Could not unpin.' };
    for (const p of pathsToRevalidate(parsed.data.source_kind, parsed.data.source_id)) {
      revalidatePath(p);
    }
    return { ok: true, pinned: false };
  }

  const { error } = await supabase.from('pins').insert({
    owner_id: user.id,
    source_kind: parsed.data.source_kind,
    source_id: parsed.data.source_id,
  });
  if (error) return { ok: false, error: 'Could not pin.' };
  for (const p of pathsToRevalidate(parsed.data.source_kind, parsed.data.source_id)) {
    revalidatePath(p);
  }
  return { ok: true, pinned: true };
}
