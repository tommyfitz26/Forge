'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function untypedSupabase(): Promise<any> {
  return createClient();
}

/**
 * Slugify a free-form tag string so it sits cleanly in the database +
 * URL routes (`/tags/[slug]`).
 */
function slugifyTag(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/^#+/, '')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

/**
 * Parse a comma- or space-separated tags string into a deduplicated slug array.
 * Empty entries dropped. Strings prefixed with `#` accepted.
 */
function parseTags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const parts = raw
    .split(/[,\s]+/)
    .map((p) => slugifyTag(p))
    .filter((p) => p.length > 0);
  return [...new Set(parts)];
}

/**
 * Ensure each slug exists in `tags` for this owner. Idempotent — uses
 * `on conflict do nothing` semantics via Supabase upsert.
 */
async function ensureTagsExist(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  ownerId: string,
  slugs: string[],
): Promise<void> {
  if (slugs.length === 0) return;
  const rows = slugs.map((slug) => ({ owner_id: ownerId, slug }));
  const { error } = await supabase
    .from('tags')
    .upsert(rows, { onConflict: 'owner_id,slug', ignoreDuplicates: true });
  if (error) {
    logger.warn('tags.upsert.failed', { err: error.message, ownerId });
  }
}

const CreateEntrySchema = z.object({
  body: z.string().trim().min(1, 'Write something first.').max(5000),
  tags_raw: z.string().max(500).optional().default(''),
  written_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export type EntryResult = { ok: true; id: string } | { ok: false; error: string };

export async function createJournalEntry(formData: FormData): Promise<EntryResult> {
  const parsed = CreateEntrySchema.safeParse({
    body: formData.get('body'),
    tags_raw: formData.get('tags_raw') ?? '',
    written_at: formData.get('written_at') ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const tags = parseTags(parsed.data.tags_raw);
  const supabase = await untypedSupabase();
  await ensureTagsExist(supabase, user.id, tags);

  const writtenAt = parsed.data.written_at ?? new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('journal_entries')
    .insert({
      owner_id: user.id,
      written_at: writtenAt,
      body: parsed.data.body,
      tags,
    })
    .select('id')
    .single();

  if (error || !data) {
    logger.error('journal.create.failed', { err: error?.message, ownerId: user.id });
    return { ok: false, error: 'Could not save entry.' };
  }

  logger.info('journal.created', {
    entryId: data.id,
    ownerId: user.id,
    tagCount: tags.length,
    written_at: writtenAt,
  });

  revalidatePath('/journal');
  for (const t of tags) revalidatePath(`/tags/${t}`);
  return { ok: true, id: data.id };
}

const UpdateEntrySchema = z.object({
  id: z.string().uuid(),
  body: z.string().trim().min(1).max(5000),
  tags_raw: z.string().max(500).optional().default(''),
});

export async function updateJournalEntry(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = UpdateEntrySchema.safeParse({
    id: formData.get('id'),
    body: formData.get('body'),
    tags_raw: formData.get('tags_raw') ?? '',
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const tags = parseTags(parsed.data.tags_raw);
  const supabase = await untypedSupabase();
  await ensureTagsExist(supabase, user.id, tags);

  const { error } = await supabase
    .from('journal_entries')
    .update({
      body: parsed.data.body,
      tags,
      updated_at: new Date().toISOString(),
    })
    .eq('id', parsed.data.id);
  if (error) {
    logger.error('journal.update.failed', { id: parsed.data.id, err: error.message });
    return { ok: false, error: 'Could not save changes.' };
  }

  revalidatePath('/journal');
  for (const t of tags) revalidatePath(`/tags/${t}`);
  return { ok: true };
}

const DeleteEntrySchema = z.object({ id: z.string().uuid() });

export async function deleteJournalEntry(id: string): Promise<void> {
  const { id: validId } = DeleteEntrySchema.parse({ id });
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) throw new Error('Not signed in.');

  const supabase = await untypedSupabase();
  // Soft-delete; the 30-day Trash window is enforced when /trash is wired up.
  const { error } = await supabase
    .from('journal_entries')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', validId);
  if (error) {
    logger.error('journal.delete.failed', { id: validId, err: error.message });
    throw new Error('Could not delete entry.');
  }
  revalidatePath('/journal');
}
