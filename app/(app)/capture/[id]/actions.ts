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

// SPEC §4.6 (post-revision): "Mark developed" replaces the auto-flip that the
// in-app conversation loop used to trigger. The user presses this when they're
// done conversing with an external Claude session about the capture. Idempotent:
// pressing again on an already-developed capture is a no-op.
export async function markDeveloped(id: string) {
  const { id: validId } = IdSchema.parse({ id });
  const { supabase } = await requireAuthedSupabase();

  // Read first so we can write a precise capture_events row + skip the no-op.
  const { data: row, error: fetchErr } = await supabase
    .from('captures')
    .select('state')
    .eq('id', validId)
    .single();
  if (fetchErr || !row) throw new Error('Capture not found.');
  if (row.state !== 'raw') {
    // Already developed/serious/archived — nothing to do.
    return;
  }

  const { error: updateErr } = await supabase
    .from('captures')
    .update({ state: 'developed', updated_at: new Date().toISOString() })
    .eq('id', validId);
  if (updateErr) {
    logger.error('capture.mark_developed.failed', {
      captureId: validId,
      err: updateErr.message,
    });
    throw new Error(updateErr.message);
  }

  // Audit log — payload distinguishes this from the auto-flip path so future
  // analytics can tell external-Claude completions from in-app sessions if we
  // ever add them back.
  await supabase.from('capture_events').insert({
    capture_id: validId,
    event_type: 'state_change',
    payload: { from: 'raw', to: 'developed', via: 'develop_prompt_export' },
  });

  logger.info('capture.state_change', {
    captureId: validId,
    to: 'developed',
    via: 'develop_prompt_export',
  });
  revalidatePath('/');
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
