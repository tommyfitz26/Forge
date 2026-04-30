'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { CAPTURE_KINDS } from '@/lib/capture/kinds';
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
