'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import type { LinkSourceKind } from '@/lib/types/links';
import type { LinkSuggestionSourceKind } from '@/lib/types/link-suggestions';
import { linkExists } from '@/lib/db/links';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function untypedSupabase(): Promise<any> {
  return createClient();
}

const IdSchema = z.object({ id: z.string().uuid() });

/**
 * Accept a pending suggestion: write a `links` row with kind='inferred',
 * mark the suggestion accepted. Idempotent — if a link in either direction
 * already exists, just resolve the suggestion without duplicating.
 */
export async function acceptSuggestion(id: string): Promise<void> {
  const { id: validId } = IdSchema.parse({ id });

  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) throw new Error('Not signed in.');

  const supabase = await untypedSupabase();

  const { data: sug, error: getErr } = await supabase
    .from('link_suggestions')
    .select('source_kind, source_id, target_kind, target_id, reason, status')
    .eq('id', validId)
    .maybeSingle();
  if (getErr || !sug) {
    logger.warn('suggestion.accept.notfound', { id: validId, err: getErr?.message });
    return;
  }
  if (sug.status !== 'pending') return;

  const sourceKind = sug.source_kind as LinkSuggestionSourceKind;
  const sourceId = sug.source_id as string;
  const targetKind = sug.target_kind as LinkSourceKind;
  const targetId = sug.target_id as string;

  if (!(await linkExists(sourceKind, sourceId, targetKind, targetId))) {
    const { error: insErr } = await supabase.from('links').insert({
      owner_id: user.id,
      source_kind: sourceKind,
      source_id: sourceId,
      target_kind: targetKind,
      target_id: targetId,
      kind: 'inferred',
      reason: sug.reason,
      accepted_at: new Date().toISOString(),
    });
    if (insErr) {
      logger.error('suggestion.accept.insert_failed', {
        id: validId,
        err: insErr.message,
      });
      throw new Error('Could not accept suggestion.');
    }
  }

  await supabase
    .from('link_suggestions')
    .update({ status: 'accepted', resolved_at: new Date().toISOString() })
    .eq('id', validId);

  revalidateForKind(sourceKind, sourceId);
  revalidateForKind(targetKind, targetId);
}

/** Mark a pending suggestion as dismissed. Stays in DB for 24h dedupe. */
export async function dismissSuggestion(id: string): Promise<void> {
  const { id: validId } = IdSchema.parse({ id });

  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) throw new Error('Not signed in.');

  const supabase = await untypedSupabase();

  const { data: sug } = await supabase
    .from('link_suggestions')
    .select('source_kind, source_id, status')
    .eq('id', validId)
    .maybeSingle();

  const { error } = await supabase
    .from('link_suggestions')
    .update({ status: 'dismissed', resolved_at: new Date().toISOString() })
    .eq('id', validId);
  if (error) {
    logger.error('suggestion.dismiss.failed', { id: validId, err: error.message });
    throw new Error('Could not dismiss suggestion.');
  }

  if (sug) {
    revalidateForKind(
      sug.source_kind as LinkSuggestionSourceKind,
      sug.source_id as string,
    );
  }
}

function revalidateForKind(kind: LinkSourceKind, id: string): void {
  switch (kind) {
    case 'capture':
      revalidatePath(`/capture/${id}`);
      break;
    case 'project':
      revalidatePath(`/projects/${id}`);
      break;
    case 'thread':
      revalidatePath(`/threads/${id}`);
      break;
    case 'journal_entry':
      revalidatePath('/journal');
      break;
  }
}
