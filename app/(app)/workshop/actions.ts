'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { CAPTURE_KINDS, type CaptureKind } from '@/lib/capture/kinds';
import {
  COVER_GRADIENT_KEYS,
  gradientKeyForKind,
  type CoverGradientKey,
} from '@/lib/types/projects';

/**
 * Untyped escape hatch for the projects table. See lib/db/projects.ts for
 * context. Drop these casts after `pnpm db:types` regenerates lib/types/db.ts.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function untypedSupabase(): Promise<any> {
  return createClient();
}

const KindSeedSchema = z.enum(CAPTURE_KINDS);
const GradientSchema = z.enum(COVER_GRADIENT_KEYS);

const CreateProjectSchema = z.object({
  title: z.string().trim().min(1, 'Give the project a title.').max(160),
  deck: z.string().trim().max(400).optional().default(''),
  kind_seed: KindSeedSchema.optional(),
  cover_gradient_key: GradientSchema.optional(),
});

export type CreateResult = { ok: true; id: string } | { ok: false; error: string };

/**
 * Create a project explicitly (the "+ New project" button). Promotion-from-
 * capture is the more common flow but lands in Phase 4.3.2 as
 * `promoteToProject`.
 */
export async function createProject(formData: FormData): Promise<CreateResult> {
  const parsed = CreateProjectSchema.safeParse({
    title: formData.get('title'),
    deck: formData.get('deck') ?? '',
    kind_seed: formData.get('kind_seed') ?? undefined,
    cover_gradient_key: formData.get('cover_gradient_key') ?? undefined,
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
  const slug = await uniqueSlugForOwner(supabase, user.id, parsed.data.title);
  const gradient: CoverGradientKey =
    parsed.data.cover_gradient_key ??
    gradientKeyForKind(parsed.data.kind_seed ?? null);

  const { data, error } = await supabase
    .from('projects')
    .insert({
      owner_id: user.id,
      slug,
      title: parsed.data.title,
      deck: parsed.data.deck.length > 0 ? parsed.data.deck : null,
      kind_seed: parsed.data.kind_seed ?? null,
      cover_kind: 'gradient',
      cover_gradient_key: gradient,
      status: 'active',
    })
    .select('id, slug')
    .single();

  if (error || !data) {
    logger.error('projects.create.failed', { err: error?.message, ownerId: user.id });
    return { ok: false, error: 'Could not create project.' };
  }

  logger.info('projects.created', { projectId: data.id, ownerId: user.id, kindSeed: parsed.data.kind_seed ?? null });
  revalidatePath('/workshop');
  redirect(`/projects/${data.id}`);
}

const IdSchema = z.object({ id: z.string().uuid() });

export async function archiveProject(id: string) {
  const { id: validId } = IdSchema.parse({ id });
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) throw new Error('Not signed in.');

  const supabase = await untypedSupabase();
  const { error } = await supabase
    .from('projects')
    .update({ status: 'archived', updated_at: new Date().toISOString() })
    .eq('id', validId);
  if (error) {
    logger.error('projects.archive.failed', { id: validId, err: error.message });
    throw new Error('Could not archive project.');
  }

  revalidatePath('/workshop');
  revalidatePath(`/projects/${validId}`);
}

/**
 * Phase 4.3.2 — promote a capture into a project.
 *
 * Behavior:
 *   1. Validates input + auth.
 *   2. If the capture is already is_project=true, returns the existing
 *      project's id (idempotent — clicking "Make this a project" twice
 *      doesn't create duplicates).
 *   3. Otherwise: creates a projects row with seed_capture_id pointing back
 *      to the capture; updates the capture so is_project=true,
 *      project_id=<new>, state advances 'raw'→'developed'.
 *   4. Redirects to /projects/[new id].
 */
const PromoteToProjectSchema = z.object({
  capture_id: z.string().uuid(),
  title: z.string().trim().min(1, 'Title cannot be empty.').max(160),
  deck: z.string().trim().max(400).optional().default(''),
  cover_gradient_key: GradientSchema.optional(),
});

export async function promoteToProject(formData: FormData): Promise<CreateResult> {
  const parsed = PromoteToProjectSchema.safeParse({
    capture_id: formData.get('capture_id'),
    title: formData.get('title'),
    deck: formData.get('deck') ?? '',
    cover_gradient_key: formData.get('cover_gradient_key') ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  // Read the source capture — kind drives the project's kind_seed and the
  // gradient default if the user didn't pick one.
  const { data: capture, error: fetchErr } = await authClient
    .from('captures')
    .select('id, kind, state, user_id, title, project_id, is_project')
    .eq('id', parsed.data.capture_id)
    .single();
  if (fetchErr || !capture) {
    return { ok: false, error: 'Capture not found.' };
  }
  if (capture.user_id !== user.id) {
    // RLS would catch this too, but explicit error is clearer.
    return { ok: false, error: 'Not your capture.' };
  }

  const supabase = await untypedSupabase();

  // Idempotent: if the capture is already promoted, redirect to that project.
  if (capture.is_project && capture.project_id) {
    redirect(`/projects/${capture.project_id}`);
  }

  const slug = await uniqueSlugForOwner(supabase, user.id, parsed.data.title);
  // captures.kind is text in Postgres; the four-value union lives in
  // lib/capture/kinds.ts. Cast the row value to the typed union.
  const captureKind = (capture.kind ?? null) as CaptureKind | null;
  const gradient: CoverGradientKey =
    parsed.data.cover_gradient_key ?? gradientKeyForKind(captureKind);

  // 1. Insert the project.
  const { data: project, error: insertErr } = await supabase
    .from('projects')
    .insert({
      owner_id: user.id,
      seed_capture_id: capture.id,
      slug,
      title: parsed.data.title,
      deck: parsed.data.deck.length > 0 ? parsed.data.deck : null,
      kind_seed: capture.kind,
      cover_kind: 'gradient',
      cover_gradient_key: gradient,
      status: 'active',
    })
    .select('id')
    .single();

  if (insertErr || !project) {
    logger.error('projects.promote.insert_failed', {
      err: insertErr?.message,
      captureId: capture.id,
      ownerId: user.id,
    });
    return { ok: false, error: 'Could not create project.' };
  }

  // 2. Update the capture to point at the new project + flip is_project +
  // advance raw→developed.
  const nextState = capture.state === 'raw' ? 'developed' : capture.state;
  const { error: updateErr } = await supabase
    .from('captures')
    .update({
      is_project: true,
      project_id: project.id,
      state: nextState,
      updated_at: new Date().toISOString(),
    })
    .eq('id', capture.id);

  if (updateErr) {
    logger.error('projects.promote.update_failed', {
      err: updateErr.message,
      captureId: capture.id,
      projectId: project.id,
    });
    // Best-effort cleanup: drop the orphan project so a retry can succeed.
    await supabase.from('projects').delete().eq('id', project.id);
    return { ok: false, error: 'Could not link capture to project.' };
  }

  // 3. Audit log on the capture.
  await authClient.from('capture_events').insert({
    capture_id: capture.id,
    event_type: 'promoted_to_project',
    payload: {
      project_id: project.id,
      from_state: capture.state,
      to_state: nextState,
    },
  });

  logger.info('projects.promoted', {
    projectId: project.id,
    captureId: capture.id,
    ownerId: user.id,
    kindSeed: capture.kind,
  });

  revalidatePath('/workshop');
  revalidatePath('/stream');
  revalidatePath(`/capture/${capture.id}`);
  redirect(`/projects/${project.id}`);
}

export async function restoreProject(id: string) {
  const { id: validId } = IdSchema.parse({ id });
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) throw new Error('Not signed in.');

  const supabase = await untypedSupabase();
  const { error } = await supabase
    .from('projects')
    .update({ status: 'active', updated_at: new Date().toISOString() })
    .eq('id', validId);
  if (error) {
    logger.error('projects.restore.failed', { id: validId, err: error.message });
    throw new Error('Could not restore project.');
  }

  revalidatePath('/workshop');
  revalidatePath(`/projects/${validId}`);
}

/* ------------------------------------------------------------ helpers ----- */

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);
}

async function uniqueSlugForOwner(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  ownerId: string,
  title: string,
): Promise<string> {
  const base = slugify(title) || 'project';
  // Try base, then base-2, base-3, … up to a safety cap.
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const { data } = await supabase
      .from('projects')
      .select('id')
      .eq('owner_id', ownerId)
      .eq('slug', candidate)
      .maybeSingle();
    if (!data) return candidate;
  }
  // Astronomically unlikely; suffix with a short random.
  return `${base}-${Math.random().toString(36).slice(2, 7)}`;
}
