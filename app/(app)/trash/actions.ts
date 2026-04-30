'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function untypedSupabase(): Promise<any> {
  return createClient();
}

const IdSchema = z.object({ id: z.string().uuid() });

// ---------------------------------------------------------------------------
// Restore — clear deleted_at
// ---------------------------------------------------------------------------

export async function untrashJournalEntry(id: string): Promise<void> {
  const { id: validId } = IdSchema.parse({ id });
  await ensureAuthed();
  const supabase = await untypedSupabase();
  const { error } = await supabase
    .from('journal_entries')
    .update({ deleted_at: null, updated_at: new Date().toISOString() })
    .eq('id', validId);
  if (error) {
    logger.error('trash.untrashJournal.failed', { id: validId, err: error.message });
    throw new Error('Could not restore entry.');
  }
  revalidatePath('/trash');
  revalidatePath('/journal');
}

export async function untrashThread(id: string): Promise<void> {
  const { id: validId } = IdSchema.parse({ id });
  await ensureAuthed();
  const supabase = await untypedSupabase();
  const { error } = await supabase
    .from('threads')
    .update({ deleted_at: null, updated_at: new Date().toISOString() })
    .eq('id', validId);
  if (error) {
    logger.error('trash.untrashThread.failed', { id: validId, err: error.message });
    throw new Error('Could not restore thread.');
  }
  revalidatePath('/trash');
  revalidatePath('/threads');
  revalidatePath(`/threads/${validId}`);
}

export async function untrashProject(id: string): Promise<void> {
  const { id: validId } = IdSchema.parse({ id });
  await ensureAuthed();
  const supabase = await untypedSupabase();
  const { error } = await supabase
    .from('projects')
    .update({ deleted_at: null, updated_at: new Date().toISOString() })
    .eq('id', validId);
  if (error) {
    logger.error('trash.untrashProject.failed', { id: validId, err: error.message });
    throw new Error('Could not restore project.');
  }
  revalidatePath('/trash');
  revalidatePath('/workshop');
  revalidatePath(`/projects/${validId}`);
}

// ---------------------------------------------------------------------------
// Purge — hard delete
// ---------------------------------------------------------------------------

export async function purgeJournalEntry(id: string): Promise<void> {
  const { id: validId } = IdSchema.parse({ id });
  await ensureAuthed();
  const supabase = await untypedSupabase();
  const { error } = await supabase.from('journal_entries').delete().eq('id', validId);
  if (error) {
    logger.error('trash.purgeJournal.failed', { id: validId, err: error.message });
    throw new Error('Could not delete entry.');
  }
  revalidatePath('/trash');
}

export async function purgeThread(id: string): Promise<void> {
  const { id: validId } = IdSchema.parse({ id });
  await ensureAuthed();
  const supabase = await untypedSupabase();
  const { error } = await supabase.from('threads').delete().eq('id', validId);
  if (error) {
    logger.error('trash.purgeThread.failed', { id: validId, err: error.message });
    throw new Error('Could not delete thread.');
  }
  revalidatePath('/trash');
}

export async function purgeProject(id: string): Promise<void> {
  const { id: validId } = IdSchema.parse({ id });
  await ensureAuthed();
  const supabase = await untypedSupabase();
  const { error } = await supabase.from('projects').delete().eq('id', validId);
  if (error) {
    logger.error('trash.purgeProject.failed', { id: validId, err: error.message });
    throw new Error('Could not delete project.');
  }
  revalidatePath('/trash');
  revalidatePath('/workshop');
}

// ---------------------------------------------------------------------------
// Soft-delete (move to trash) — used by future 4.6 context menus.
// Defined here so the wiring is in place before the menus call them.
// ---------------------------------------------------------------------------

export async function trashThread(id: string): Promise<void> {
  const { id: validId } = IdSchema.parse({ id });
  await ensureAuthed();
  const supabase = await untypedSupabase();
  const { error } = await supabase
    .from('threads')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', validId);
  if (error) {
    logger.error('trash.trashThread.failed', { id: validId, err: error.message });
    throw new Error('Could not move thread to trash.');
  }
  revalidatePath('/threads');
  revalidatePath(`/threads/${validId}`);
  revalidatePath('/trash');
}

export async function trashProject(id: string): Promise<void> {
  const { id: validId } = IdSchema.parse({ id });
  await ensureAuthed();
  const supabase = await untypedSupabase();
  const { error } = await supabase
    .from('projects')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', validId);
  if (error) {
    logger.error('trash.trashProject.failed', { id: validId, err: error.message });
    throw new Error('Could not move project to trash.');
  }
  revalidatePath('/workshop');
  revalidatePath(`/projects/${validId}`);
  revalidatePath('/trash');
}

async function ensureAuthed(): Promise<void> {
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) throw new Error('Not signed in.');
}
