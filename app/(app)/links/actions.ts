'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { LINK_SOURCE_KINDS, type LinkSourceKind } from '@/lib/types/links';
import { linkExists } from '@/lib/db/links';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function untypedSupabase(): Promise<any> {
  return createClient();
}

const KindSchema = z.enum(LINK_SOURCE_KINDS);

const CreateManualLinkSchema = z.object({
  source_kind: KindSchema,
  source_id: z.string().uuid(),
  target_kind: KindSchema,
  target_id: z.string().uuid(),
  reason: z.string().trim().max(280).optional().default(''),
});

export type LinkResult = { ok: true; id: string } | { ok: false; error: string };

/**
 * Write a manual link between two items. Idempotent — if a link already
 * exists in either direction, returns ok:true with the existing id.
 */
export async function createManualLink(formData: FormData): Promise<LinkResult> {
  const parsed = CreateManualLinkSchema.safeParse({
    source_kind: formData.get('source_kind'),
    source_id: formData.get('source_id'),
    target_kind: formData.get('target_kind'),
    target_id: formData.get('target_id'),
    reason: formData.get('reason') ?? '',
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  const { source_kind, source_id, target_kind, target_id, reason } = parsed.data;

  if (source_kind === target_kind && source_id === target_id) {
    return { ok: false, error: "An item can't link to itself." };
  }

  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  // Dedupe — bail with the existing id if a link in either direction exists.
  if (await linkExists(source_kind, source_id, target_kind, target_id)) {
    return { ok: false, error: 'These items are already linked.' };
  }

  const supabase = await untypedSupabase();
  const { data, error } = await supabase
    .from('links')
    .insert({
      owner_id: user.id,
      source_kind,
      source_id,
      target_kind,
      target_id,
      kind: 'manual',
      reason: reason ? reason : null,
    })
    .select('id')
    .single();

  if (error || !data) {
    logger.error('links.create.failed', { err: error?.message, ownerId: user.id });
    return { ok: false, error: 'Could not create link.' };
  }

  logger.info('links.created', {
    id: data.id,
    source_kind,
    target_kind,
    ownerId: user.id,
  });

  revalidateForKind(source_kind, source_id);
  revalidateForKind(target_kind, target_id);
  return { ok: true, id: data.id };
}

const DeleteSchema = z.object({ id: z.string().uuid() });

export async function deleteLink(id: string): Promise<void> {
  const { id: validId } = DeleteSchema.parse({ id });
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) throw new Error('Not signed in.');

  const supabase = await untypedSupabase();
  // Read the row first so we know what to revalidate.
  const { data: existing } = await supabase
    .from('links')
    .select('source_kind, source_id, target_kind, target_id')
    .eq('id', validId)
    .maybeSingle();

  const { error } = await supabase.from('links').delete().eq('id', validId);
  if (error) {
    logger.error('links.delete.failed', { id: validId, err: error.message });
    throw new Error('Could not delete link.');
  }

  if (existing) {
    revalidateForKind(
      existing.source_kind as LinkSourceKind,
      existing.source_id as string,
    );
    revalidateForKind(
      existing.target_kind as LinkSourceKind,
      existing.target_id as string,
    );
  }
}

/**
 * Search across all 4 kinds for the link palette. Returns a small grouped
 * result set: title-only ILIKE match, capped at LIMIT_PER_KIND each.
 * Excludes the anchor item itself (you can't link X to X).
 */
const SearchSchema = z.object({
  q: z.string().trim().min(1).max(80),
  exclude_kind: KindSchema.optional(),
  exclude_id: z.string().uuid().optional(),
});

export type LinkSearchHit = {
  kind: LinkSourceKind;
  id: string;
  title: string;
};

const LIMIT_PER_KIND = 8;

export async function searchLinkTargets(
  q: string,
  excludeKind?: LinkSourceKind,
  excludeId?: string,
): Promise<LinkSearchHit[]> {
  const parsed = SearchSchema.safeParse({
    q,
    exclude_kind: excludeKind,
    exclude_id: excludeId,
  });
  if (!parsed.success) return [];

  const supabase = await untypedSupabase();
  const pattern = `%${parsed.data.q}%`;

  const [capRes, projRes, thrRes, jourRes] = await Promise.all([
    supabase
      .from('captures')
      .select('id, title')
      .ilike('title', pattern)
      .neq('state', 'archived')
      .limit(LIMIT_PER_KIND),
    supabase
      .from('projects')
      .select('id, title')
      .ilike('title', pattern)
      .is('deleted_at', null)
      .limit(LIMIT_PER_KIND),
    supabase
      .from('threads')
      .select('id, capture_id')
      .is('deleted_at', null)
      .limit(LIMIT_PER_KIND * 2),
    supabase
      .from('journal_entries')
      .select('id, written_at, body')
      .ilike('body', pattern)
      .is('deleted_at', null)
      .limit(LIMIT_PER_KIND),
  ]);

  const hits: LinkSearchHit[] = [];

  for (const c of (capRes.data ?? []) as Array<{ id: string; title: string }>) {
    hits.push({ kind: 'capture', id: c.id, title: c.title });
  }
  for (const p of (projRes.data ?? []) as Array<{ id: string; title: string }>) {
    hits.push({ kind: 'project', id: p.id, title: p.title });
  }

  // Threads don't have their own title; resolve via capture title and filter.
  const threadRows = (thrRes.data ?? []) as Array<{ id: string; capture_id: string }>;
  if (threadRows.length > 0) {
    const captureIds = threadRows.map((t) => t.capture_id);
    const { data: capRows } = await supabase
      .from('captures')
      .select('id, title')
      .in('id', captureIds)
      .ilike('title', pattern);
    const capTitleMap = new Map(
      ((capRows ?? []) as Array<{ id: string; title: string }>).map((c) => [c.id, c.title]),
    );
    for (const t of threadRows) {
      const title = capTitleMap.get(t.capture_id);
      if (title) hits.push({ kind: 'thread', id: t.id, title });
      if (hits.filter((h) => h.kind === 'thread').length >= LIMIT_PER_KIND) break;
    }
  }

  for (const j of (jourRes.data ?? []) as Array<{
    id: string;
    written_at: string;
    body: string;
  }>) {
    const oneLine = j.body.replace(/\s+/g, ' ').trim();
    const preview = oneLine.length > 60 ? oneLine.slice(0, 60) + '…' : oneLine;
    hits.push({
      kind: 'journal_entry',
      id: j.id,
      title: `${formatJournalDate(j.written_at)} — ${preview}`,
    });
  }

  // Filter out the anchor item itself.
  return hits.filter(
    (h) => !(parsed.data.exclude_kind === h.kind && parsed.data.exclude_id === h.id),
  );
}

function formatJournalDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
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
