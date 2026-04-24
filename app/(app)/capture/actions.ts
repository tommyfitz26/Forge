'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { parsePrefix, heuristicTitle } from '@/lib/capture/parse';
import { initialResearchStatus, type CaptureKind } from '@/lib/capture/kinds';
import { logger } from '@/lib/logger';

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

  // SPEC §4.2 rule 1: prefix match runs before any LLM call. If no prefix,
  // Phase 1a defaults to 'observation' as a safe neutral kind; Phase 1c
  // will replace this with the classify_capture Haiku task.
  const prefix = parsePrefix(parsed.data.content);
  const kind: CaptureKind = prefix.matched ? prefix.kind : 'observation';
  const cleanedContent = prefix.matched ? prefix.stripped : parsed.data.content;
  const title = heuristicTitle(cleanedContent);

  const { data, error } = await supabase
    .from('captures')
    .insert({
      user_id: user.id,
      kind,
      state: 'raw',
      title,
      content: cleanedContent,
      original_transcript: parsed.data.content,
      source: 'web',
      research_status: initialResearchStatus(kind),
    })
    .select('id')
    .single();

  if (error || !data) {
    logger.error('capture.create.failed', { err: error?.message, userId: user.id });
    return { ok: false, error: 'Could not save capture.' };
  }

  logger.info('capture.created', {
    captureId: data.id,
    kind,
    source: 'web',
    prefixMatched: prefix.matched,
  });

  revalidatePath('/');
  redirect(`/capture/${data.id}`);
}
