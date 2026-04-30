'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { CAPTURE_KINDS, type CaptureKind } from '@/lib/capture/kinds';
import { sectionsForKind, isValidSectionKey } from '@/lib/threads/templates';
import {
  snapshotContentVersion,
  serializeThreadSections,
} from '@/lib/db/content-versions';
import { scheduleLinkSuggestions } from '@/lib/ai/run-suggest-links';

/**
 * Untyped escape hatch — see lib/db/threads.ts. Drop after `pnpm db:types`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function untypedSupabase(): Promise<any> {
  return createClient();
}

export type ThreadResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

const CreateThreadSchema = z.object({
  capture_id: z.string().uuid(),
});

/**
 * Create (or fetch existing) thread for a capture. Idempotent — calling twice
 * for the same capture returns the same thread id. Sections are seeded from
 * the per-kind template at insert time.
 */
export async function createThread(formData: FormData): Promise<ThreadResult> {
  const parsed = CreateThreadSchema.safeParse({
    capture_id: formData.get('capture_id'),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  // Read the capture to get its kind for the template + verify ownership.
  const { data: capture, error: fetchErr } = await authClient
    .from('captures')
    .select('id, kind, user_id')
    .eq('id', parsed.data.capture_id)
    .single();
  if (fetchErr || !capture) return { ok: false, error: 'Capture not found.' };
  if (capture.user_id !== user.id) return { ok: false, error: 'Not your capture.' };

  const kind = capture.kind as CaptureKind;
  if (!CAPTURE_KINDS.includes(kind)) {
    return { ok: false, error: `Unknown capture kind: ${capture.kind}` };
  }

  const supabase = await untypedSupabase();

  // Idempotent — return existing thread if one already exists.
  const { data: existing } = await supabase
    .from('threads')
    .select('id')
    .eq('capture_id', capture.id)
    .is('deleted_at', null)
    .maybeSingle();
  if (existing?.id) {
    redirect(`/threads/${existing.id}`);
  }

  const { data: thread, error: insertErr } = await supabase
    .from('threads')
    .insert({
      owner_id: user.id,
      capture_id: capture.id,
      kind,
      sections: sectionsForKind(kind),
      status: 'in_progress',
      pinned: false,
    })
    .select('id')
    .single();

  if (insertErr || !thread) {
    logger.error('threads.create.insert_failed', {
      err: insertErr?.message,
      captureId: capture.id,
      ownerId: user.id,
    });
    return { ok: false, error: 'Could not create thread.' };
  }

  logger.info('threads.created', {
    threadId: thread.id,
    captureId: capture.id,
    ownerId: user.id,
    kind,
  });

  revalidatePath('/threads');
  revalidatePath(`/capture/${capture.id}`);
  redirect(`/threads/${thread.id}`);
}

/**
 * Update a single section's body. Idempotent at the row level (full sections
 * array gets re-written each call). Phase 4.3.5 will add content_versions; for
 * now, last write wins.
 */
const UpdateSectionSchema = z.object({
  thread_id: z.string().uuid(),
  section_key: z.string().min(1).max(80),
  body: z.string().max(50_000),
});

export async function updateThreadSection(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = UpdateSectionSchema.safeParse({
    thread_id: formData.get('thread_id'),
    section_key: formData.get('section_key'),
    body: formData.get('body') ?? '',
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

  // Fetch the existing thread + its sections.
  const { data: thread, error: fetchErr } = await supabase
    .from('threads')
    .select('id, kind, sections, owner_id')
    .eq('id', parsed.data.thread_id)
    .is('deleted_at', null)
    .maybeSingle();
  if (fetchErr || !thread) return { ok: false, error: 'Thread not found.' };
  if (thread.owner_id !== user.id) return { ok: false, error: 'Not your thread.' };

  const kind = thread.kind as CaptureKind;
  if (!isValidSectionKey(kind, parsed.data.section_key)) {
    return { ok: false, error: `Unknown section "${parsed.data.section_key}" for kind ${kind}.` };
  }

  // Compose the new sections array. If the section is missing (older row that
  // pre-dates the template), append it; otherwise update in place.
  const sections = Array.isArray(thread.sections)
    ? (thread.sections as Array<{ key: string; title: string; body: string }>)
    : [];
  const existingIdx = sections.findIndex((s) => s.key === parsed.data.section_key);
  const next =
    existingIdx >= 0
      ? sections.map((s, i) =>
          i === existingIdx ? { ...s, body: parsed.data.body } : s,
        )
      : [...sections, { key: parsed.data.section_key, title: parsed.data.section_key, body: parsed.data.body }];

  const { error: updateErr } = await supabase
    .from('threads')
    .update({ sections: next, updated_at: new Date().toISOString() })
    .eq('id', thread.id);
  if (updateErr) {
    logger.error('threads.updateSection.failed', {
      threadId: thread.id,
      sectionKey: parsed.data.section_key,
      err: updateErr.message,
    });
    return { ok: false, error: 'Could not save section.' };
  }

  // Phase 4.3.5 — best-effort version snapshot of the full thread.
  await snapshotContentVersion({
    ownerId: user.id,
    sourceKind: 'thread',
    sourceId: thread.id,
    body: serializeThreadSections(next),
  });

  // Phase 5.3 — schedule AI link suggestions to run after this response.
  // 24h dedupe inside scheduleLinkSuggestions guards against re-firing on
  // every blur if the body hasn't materially changed.
  after(() => scheduleLinkSuggestions(user.id, 'thread', thread.id));

  revalidatePath(`/threads/${thread.id}`);
  return { ok: true };
}

const IdSchema = z.object({ id: z.string().uuid() });

export async function archiveThread(id: string) {
  const { id: validId } = IdSchema.parse({ id });
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) throw new Error('Not signed in.');

  const supabase = await untypedSupabase();
  const { error } = await supabase
    .from('threads')
    .update({ status: 'archived', updated_at: new Date().toISOString() })
    .eq('id', validId);
  if (error) {
    logger.error('threads.archive.failed', { id: validId, err: error.message });
    throw new Error('Could not archive thread.');
  }
  revalidatePath('/threads');
  revalidatePath(`/threads/${validId}`);
}

export async function restoreThread(id: string) {
  const { id: validId } = IdSchema.parse({ id });
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) throw new Error('Not signed in.');

  const supabase = await untypedSupabase();
  const { error } = await supabase
    .from('threads')
    .update({ status: 'in_progress', updated_at: new Date().toISOString() })
    .eq('id', validId);
  if (error) {
    logger.error('threads.restore.failed', { id: validId, err: error.message });
    throw new Error('Could not restore thread.');
  }
  revalidatePath('/threads');
  revalidatePath(`/threads/${validId}`);
}

export async function markThreadComplete(id: string) {
  const { id: validId } = IdSchema.parse({ id });
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) throw new Error('Not signed in.');

  const supabase = await untypedSupabase();
  const { error } = await supabase
    .from('threads')
    .update({ status: 'complete', updated_at: new Date().toISOString() })
    .eq('id', validId);
  if (error) {
    logger.error('threads.markComplete.failed', { id: validId, err: error.message });
    throw new Error('Could not mark complete.');
  }
  revalidatePath('/threads');
  revalidatePath(`/threads/${validId}`);
}
