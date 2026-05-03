import 'server-only';
import { createServiceClient } from '@/lib/supabase/service';
import { logger } from '@/lib/logger';
import type { LinkSourceKind } from '@/lib/types/links';
import type { LinkSuggestionSourceKind } from '@/lib/types/link-suggestions';

// `links` (polymorphic) and `link_suggestions` aren't in the auto-generated
// db types yet. Cast the service client to `any` for those queries; remove
// once `pnpm db:types` is re-run.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

/**
 * Candidate selection for the suggest_links Sonnet call.
 *
 * Returns up to ~20 items the user has captured, ranked by recency-window
 * (last 60 days) and same-tag overlap when the source has tags. Excludes:
 *   - the source item itself
 *   - already-linked endpoints (in either direction, any kind)
 *   - soft-deleted items
 *   - archived captures
 *
 * Per-kind caps keep the candidate mix balanced so we don't drown the
 * model in 20 captures with no projects/threads.
 */

export type Candidate = {
  kind: LinkSourceKind;
  id: string;
  title: string;
  /** Short body preview the model uses to assess connection. */
  preview: string;
};

const RECENCY_DAYS = 60;
const PER_KIND_CAP = 6;
const TOTAL_CAP = 20;

export async function selectCandidates(args: {
  ownerId: string;
  source: { kind: LinkSuggestionSourceKind; id: string };
  /** Tag slugs on the source (only journal entries have tags today). */
  sourceTags?: string[];
}): Promise<Candidate[]> {
  const service = createServiceClient() as AnyClient;
  const cutoff = new Date(Date.now() - RECENCY_DAYS * 86_400_000).toISOString();

  // 1. Existing-link blocklist: if the source already links to X (in either
  // direction), don't propose X again.
  const blockSet = new Set<string>();
  blockSet.add(`${args.source.kind}:${args.source.id}`);

  const { data: existingLinks } = await service
    .from('links')
    .select('source_kind, source_id, target_kind, target_id')
    .eq('owner_id', args.ownerId)
    .or(
      `and(source_kind.eq.${args.source.kind},source_id.eq.${args.source.id}),and(target_kind.eq.${args.source.kind},target_id.eq.${args.source.id})`,
    );
  for (const l of (existingLinks ?? []) as Array<{
    source_kind: string;
    source_id: string;
    target_kind: string;
    target_id: string;
  }>) {
    if (l.source_kind === args.source.kind && l.source_id === args.source.id) {
      blockSet.add(`${l.target_kind}:${l.target_id}`);
    } else {
      blockSet.add(`${l.source_kind}:${l.source_id}`);
    }
  }

  // 2. Already-pending or recently-dismissed suggestions for this source: skip.
  const { data: existingSugs } = await service
    .from('link_suggestions')
    .select('target_kind, target_id, status')
    .eq('owner_id', args.ownerId)
    .eq('source_kind', args.source.kind)
    .eq('source_id', args.source.id)
    .in('status', ['pending', 'dismissed', 'accepted']);
  for (const s of (existingSugs ?? []) as Array<{
    target_kind: string;
    target_id: string;
    status: string;
  }>) {
    blockSet.add(`${s.target_kind}:${s.target_id}`);
  }

  // 3. Pull recent items per kind. Cast to `any` — `link_suggestions` and
  // `link_kinds` aren't in the generated db types yet, and we're cross-
  // referencing tables that have differing column shapes.
  const [capRes, projRes, thrRes, jourRes] = await Promise.all([
    service
      .from('captures')
      .select('id, title, content, kind, created_at, user_id')
      .eq('user_id', args.ownerId)
      .neq('state', 'archived')
      .is('deleted_at', null)
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(PER_KIND_CAP * 3),
    service
      .from('projects')
      // owner_id is the projects column.
      .select('id, title, deck, created_at, owner_id')
      .eq('owner_id', args.ownerId)
      .is('deleted_at', null)
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(PER_KIND_CAP * 2),
    service
      .from('threads')
      .select('id, capture_id, sections, created_at, owner_id')
      .eq('owner_id', args.ownerId)
      .is('deleted_at', null)
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(PER_KIND_CAP * 2),
    service
      .from('journal_entries')
      .select('id, body, written_at, tags, owner_id')
      .eq('owner_id', args.ownerId)
      .is('deleted_at', null)
      .gte('written_at', isoDate(cutoff))
      .order('written_at', { ascending: false })
      .limit(PER_KIND_CAP * 2),
  ]);

  if (capRes.error) logger.warn('candidates.captures.failed', { err: capRes.error.message });
  if (projRes.error) logger.warn('candidates.projects.failed', { err: projRes.error.message });
  if (thrRes.error) logger.warn('candidates.threads.failed', { err: thrRes.error.message });
  if (jourRes.error) logger.warn('candidates.journal.failed', { err: jourRes.error.message });

  // Threads need their seed-capture title.
  const thrRows = (thrRes.data ?? []) as Array<{
    id: string;
    capture_id: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sections: any;
  }>;
  const thrCapIds = thrRows.map((t) => t.capture_id);
  const { data: thrCapTitles } = thrCapIds.length
    ? await service.from('captures').select('id, title').in('id', thrCapIds)
    : { data: [] as Array<{ id: string; title: string }> };
  const titleByCapture = new Map(
    ((thrCapTitles ?? []) as Array<{ id: string; title: string }>).map((c) => [c.id, c.title]),
  );

  const candidates: Candidate[] = [];

  // Captures
  for (const c of (capRes.data ?? []) as Array<{
    id: string;
    title: string;
    content: string | null;
  }>) {
    const key = `capture:${c.id}`;
    if (blockSet.has(key)) continue;
    candidates.push({
      kind: 'capture',
      id: c.id,
      title: c.title,
      preview: previewLine(c.content ?? '', 140),
    });
    if (candidates.filter((x) => x.kind === 'capture').length >= PER_KIND_CAP) break;
  }

  // Projects
  for (const p of (projRes.data ?? []) as Array<{
    id: string;
    title: string;
    deck: string | null;
  }>) {
    const key = `project:${p.id}`;
    if (blockSet.has(key)) continue;
    candidates.push({
      kind: 'project',
      id: p.id,
      title: p.title,
      preview: previewLine(p.deck ?? '', 140),
    });
    if (candidates.filter((x) => x.kind === 'project').length >= PER_KIND_CAP) break;
  }

  // Threads — preview is concatenated section bodies.
  for (const t of thrRows) {
    const key = `thread:${t.id}`;
    if (blockSet.has(key)) continue;
    const sections = Array.isArray(t.sections)
      ? (t.sections as Array<{ body: string }>)
      : [];
    const joined = sections.map((s) => s.body).filter(Boolean).join(' ').trim();
    candidates.push({
      kind: 'thread',
      id: t.id,
      title: titleByCapture.get(t.capture_id) ?? '(untitled thread)',
      preview: previewLine(joined, 140),
    });
    if (candidates.filter((x) => x.kind === 'thread').length >= PER_KIND_CAP) break;
  }

  // Journal entries — title-equivalent is the date; preview is body.
  // Tag-overlap weighting: bring tag-matched entries to the front.
  const jourRows = (jourRes.data ?? []) as Array<{
    id: string;
    body: string;
    written_at: string;
    tags: string[];
  }>;
  if (args.sourceTags?.length) {
    const tagSet = new Set(args.sourceTags);
    jourRows.sort((a, b) => {
      const aMatch = (a.tags ?? []).some((t) => tagSet.has(t)) ? 1 : 0;
      const bMatch = (b.tags ?? []).some((t) => tagSet.has(t)) ? 1 : 0;
      return bMatch - aMatch;
    });
  }
  for (const j of jourRows) {
    const key = `journal_entry:${j.id}`;
    if (blockSet.has(key)) continue;
    candidates.push({
      kind: 'journal_entry',
      id: j.id,
      title: `Journal entry · ${formatJournalDate(j.written_at)}`,
      preview: previewLine(j.body, 140),
    });
    if (candidates.filter((x) => x.kind === 'journal_entry').length >= PER_KIND_CAP) break;
  }

  return candidates.slice(0, TOTAL_CAP);
}

/**
 * Format the candidate list as the bulleted block the prompt embeds.
 * The model gets the kind+id together so it can echo target_kind/target_id
 * back in its picks — we then validate against the candidate IDs we sent.
 */
export function formatCandidatesBlock(candidates: Candidate[]): string {
  if (candidates.length === 0) return '(none)';
  return candidates
    .map((c) => {
      const idTag = `[${c.kind}:${c.id}]`;
      return `- ${idTag} ${c.title}${c.preview ? ` — ${c.preview}` : ''}`;
    })
    .join('\n');
}

function previewLine(s: string | null | undefined, max: number): string {
  if (!s) return '';
  const oneLine = s.replace(/\s+/g, ' ').trim();
  return oneLine.length > max ? oneLine.slice(0, max) + '…' : oneLine;
}

function formatJournalDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function isoDate(timestamp: string): string {
  return timestamp.slice(0, 10);
}
