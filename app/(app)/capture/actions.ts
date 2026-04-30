'use server';

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { persistCapture } from '@/lib/capture/persist';
import {
  MAX_PHOTO_BYTES,
  isAcceptedPhotoMime,
  photoMimeToExtension,
} from '@/lib/capture/photo';
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

// Web clip capture — Phase 4.2. Saves the URL + optional note as a normal
// text capture so the existing classifier picks it up. Phase 4.3 adds
// `source_url` and `media_kind` columns to captures and refactors this to
// stop embedding the URL in the body. Until then, the URL goes on its own
// line at the top of `content` so the classifier can see it.
const CreateWebClipSchema = z.object({
  url: z.string().trim().url('Needs a valid URL.'),
  note: z.string().trim().max(5000).optional().default(''),
});

export async function createWebClipCapture(formData: FormData): Promise<CreateResult> {
  const parsed = CreateWebClipSchema.safeParse({
    url: formData.get('url'),
    note: formData.get('note') ?? '',
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  // Compose: URL on its own line, optional note below.
  const content = parsed.data.note.length === 0
    ? parsed.data.url
    : `${parsed.data.url}\n\n${parsed.data.note}`;

  let id: string;
  try {
    const result = await persistCapture(supabase, {
      userId: user.id,
      content,
      source: 'web',
    });
    id = result.id;
  } catch {
    return { ok: false, error: 'Could not save clip.' };
  }

  revalidatePath('/');
  redirect(`/capture/${id}`);
}

const PhotoCaptionSchema = z.string().trim().max(5000);

export async function createPhotoCapture(formData: FormData): Promise<CreateResult> {
  const photo = formData.get('photo');
  if (!(photo instanceof File) || photo.size === 0) {
    return { ok: false, error: 'Pick a photo first.' };
  }
  if (photo.size > MAX_PHOTO_BYTES) {
    return { ok: false, error: 'Photo is too large (max 15MB).' };
  }
  if (!isAcceptedPhotoMime(photo.type)) {
    return { ok: false, error: 'Unsupported image format. JPEG, PNG, WebP, HEIC, or HEIF only.' };
  }

  const captionParse = PhotoCaptionSchema.safeParse(formData.get('caption') ?? '');
  if (!captionParse.success) {
    return { ok: false, error: 'Caption too long (max 5000 chars).' };
  }
  const caption = captionParse.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  // Persist the parent capture first — caption-having photos go through
  // the same prefix → classifier path as text. No-caption photos skip
  // classification (nothing to classify) and seed kind=observation /
  // title='Photo capture', mirroring the empty-transcript path in
  // app/api/capture/route.ts.
  let captureId: string;
  if (caption.length === 0) {
    const { data, error } = await supabase
      .from('captures')
      .insert({
        user_id: user.id,
        kind: 'observation',
        state: 'raw',
        title: 'Photo capture',
        content: '',
        source: 'web',
        research_status: 'skipped',
      })
      .select('id')
      .single();
    if (error || !data) {
      logger.error('photo.capture_insert.failed', { err: error?.message, userId: user.id });
      return { ok: false, error: 'Could not save capture.' };
    }
    captureId = data.id;
  } else {
    try {
      const result = await persistCapture(supabase, {
        userId: user.id,
        content: caption,
        source: 'web',
      });
      captureId = result.id;
    } catch (err) {
      logger.error('photo.persist.failed', {
        err: err instanceof Error ? err.message : String(err),
        userId: user.id,
      });
      return { ok: false, error: 'Could not save capture.' };
    }
  }

  // Upload to storage. Path is <user_id>/<capture_id>/<random>.<ext> so the
  // bucket-level RLS policy on storage.objects matches via foldername[1].
  const ext = photoMimeToExtension(photo.type);
  const objectName = `${user.id}/${captureId}/${randomUUID()}.${ext}`;
  const { error: uploadErr } = await supabase.storage
    .from('attachments')
    .upload(objectName, photo, { contentType: photo.type, upsert: false });
  if (uploadErr) {
    logger.error('photo.upload.failed', {
      err: uploadErr.message,
      userId: user.id,
      captureId,
      mime: photo.type,
      bytes: photo.size,
    });
    return { ok: false, error: 'Could not upload photo. Capture saved without image.' };
  }

  const { error: attachErr } = await supabase.from('attachments').insert({
    capture_id: captureId,
    kind: 'photo',
    storage_path: objectName,
  });
  if (attachErr) {
    // Best-effort: remove the orphaned object so the bucket doesn't grow with
    // unreferenced uploads. If this also fails, the capture row still points
    // at no attachment — recoverable from the UI.
    await supabase.storage.from('attachments').remove([objectName]);
    logger.error('photo.attachment_insert.failed', {
      err: attachErr.message,
      userId: user.id,
      captureId,
    });
    return { ok: false, error: 'Could not save attachment metadata.' };
  }

  revalidatePath('/');
  redirect(`/capture/${captureId}`);
}
