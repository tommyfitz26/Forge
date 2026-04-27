'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { enqueueResearch } from '@/lib/research/enqueue';
import { logger } from '@/lib/logger';

const IdSchema = z.object({ id: z.string().uuid() });

async function requireAuthedSupabase() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in.');
  return { supabase, user };
}

// Manual retry from the detail page when the auto-research path failed
// (or when the user wants to trigger research on a problem/observation).
// Layer A in /api/jobs/research short-circuits if a research row already
// exists, so duplicate clicks are safe.
export async function retryResearch(id: string) {
  const { id: validId } = IdSchema.parse({ id });
  const { supabase } = await requireAuthedSupabase();

  const { error } = await supabase
    .from('captures')
    .update({ research_status: 'pending', updated_at: new Date().toISOString() })
    .eq('id', validId);
  if (error) {
    logger.error('capture.retry_research.failed', {
      captureId: validId,
      err: error.message,
    });
    throw new Error(error.message);
  }

  await enqueueResearch(validId);
  revalidatePath(`/capture/${validId}`);
}

export async function promoteToSerious(id: string) {
  const { id: validId } = IdSchema.parse({ id });
  const { supabase } = await requireAuthedSupabase();

  const { error } = await supabase
    .from('captures')
    .update({ state: 'serious', updated_at: new Date().toISOString() })
    .eq('id', validId);

  if (error) {
    logger.error('capture.promote.failed', { captureId: validId, err: error.message });
    throw new Error(error.message);
  }

  logger.info('capture.state_change', { captureId: validId, to: 'serious' });
  revalidatePath('/');
  revalidatePath(`/capture/${validId}`);
}

export async function archiveCapture(formData: FormData) {
  const id = formData.get('id');
  const reason = formData.get('reason');
  const validId = IdSchema.parse({ id }).id;
  const reasonStr = typeof reason === 'string' && reason.trim() ? reason.trim() : null;

  const { supabase } = await requireAuthedSupabase();
  const { error } = await supabase
    .from('captures')
    .update({
      state: 'archived',
      archive_reason: reasonStr,
      updated_at: new Date().toISOString(),
    })
    .eq('id', validId);

  if (error) {
    logger.error('capture.archive.failed', { captureId: validId, err: error.message });
    throw new Error(error.message);
  }

  logger.info('capture.state_change', { captureId: validId, to: 'archived' });
  revalidatePath('/');
  revalidatePath('/archive');
  revalidatePath(`/capture/${validId}`);
}

export async function unarchiveCapture(id: string) {
  const { id: validId } = IdSchema.parse({ id });
  const { supabase } = await requireAuthedSupabase();

  const { error } = await supabase
    .from('captures')
    .update({
      state: 'raw',
      archive_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', validId);

  if (error) {
    logger.error('capture.unarchive.failed', { captureId: validId, err: error.message });
    throw new Error(error.message);
  }

  logger.info('capture.state_change', { captureId: validId, to: 'raw', via: 'unarchive' });
  revalidatePath('/');
  revalidatePath('/archive');
  revalidatePath(`/capture/${validId}`);
}

// SPEC §4.8: hard delete only from archived state (two-step protection).
// The FK cascades take care of research, conversations, nudges, attachments,
// capture_events, and links. Storage objects are deleted separately once
// attachments are introduced in Phase 1e.
export async function deleteCaptureForever(id: string) {
  const { id: validId } = IdSchema.parse({ id });
  const { supabase } = await requireAuthedSupabase();

  const { data: capture, error: fetchErr } = await supabase
    .from('captures')
    .select('state')
    .eq('id', validId)
    .single();

  if (fetchErr || !capture) {
    throw new Error('Capture not found.');
  }
  if (capture.state !== 'archived') {
    throw new Error('Archive before deleting.');
  }

  const { error } = await supabase.from('captures').delete().eq('id', validId);
  if (error) {
    logger.error('capture.delete.failed', { captureId: validId, err: error.message });
    throw new Error(error.message);
  }

  logger.info('capture.deleted', { captureId: validId });
  revalidatePath('/');
  revalidatePath('/archive');
  redirect('/archive');
}
