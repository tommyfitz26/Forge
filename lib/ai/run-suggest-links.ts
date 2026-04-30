import 'server-only';
import crypto from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { runTask, BudgetExceededError, TaskValidationError } from './run';
import {
  selectCandidates,
  formatCandidatesBlock,
  type Candidate,
} from './candidate-selection';
import { hasRecentSuggestion } from '@/lib/db/link-suggestions';
import { createServiceClient } from '@/lib/supabase/service';
import { logger } from '@/lib/logger';
import type { LinkSuggestionSourceKind } from '@/lib/types/link-suggestions';

/**
 * Phase 5.3 orchestrator. Called fire-and-forget after a save:
 *   - capture create (after classify_capture finishes)
 *   - thread section save
 *   - journal entry create
 *
 * Steps:
 *   1. Hash the source body (24h dedupe — skip if same hash already produced
 *      suggestions for this source).
 *   2. Pull recency-windowed candidates, excluding the source + already-linked
 *      + already-suggested items.
 *   3. Run suggest_links Sonnet 4.6 task with the candidate list.
 *   4. Validate the picks against the candidates we sent (defense-in-depth).
 *   5. Insert pending link_suggestions rows.
 *   6. Revalidate the source's detail page so the SuggestionsPanel re-renders.
 *
 * Errors are logged and swallowed — this runs in the background and a failure
 * to suggest must never affect the foreground save.
 */
export async function runSuggestLinks(args: {
  ownerId: string;
  source: {
    kind: LinkSuggestionSourceKind;
    id: string;
    title: string;
    body: string;
  };
  /** Tag slugs on the source — only journal entries have tags today. */
  sourceTags?: string[];
}): Promise<void> {
  const { ownerId, source } = args;
  const snapshotHash = sha256(source.body);

  logger.info('suggest_links.started', {
    sourceKind: source.kind,
    sourceId: source.id,
    bodyChars: source.body.length,
    titlePreview: source.title.slice(0, 60),
  });

  try {
    // 24h dedupe — short-circuit if we've already generated suggestions for
    // this exact body recently.
    if (await hasRecentSuggestion(source.kind, source.id, snapshotHash)) {
      logger.info('suggest_links.skipped_recent', {
        sourceKind: source.kind,
        sourceId: source.id,
      });
      return;
    }

    // Empty body → nothing to suggest from.
    if (source.body.trim().length === 0) return;

    const candidates = await selectCandidates({
      ownerId,
      source: { kind: source.kind, id: source.id },
      ...(args.sourceTags ? { sourceTags: args.sourceTags } : {}),
    });
    if (candidates.length === 0) {
      logger.info('suggest_links.no_candidates', {
        sourceKind: source.kind,
        sourceId: source.id,
      });
      return;
    }

    const result = await runTask(
      'suggest_links',
      {
        source_kind: source.kind,
        source_title: source.title,
        source_body: source.body.slice(0, 4000),
        candidates_block: formatCandidatesBlock(candidates),
      },
    );

    // Defense-in-depth: drop any picks whose target isn't in the candidate
    // set. Sonnet occasionally invents IDs.
    const candidateKeySet = new Set(
      candidates.map((c) => `${c.kind}:${c.id}`),
    );
    const validPicks = result.picks.filter((p) =>
      candidateKeySet.has(`${p.target_kind}:${p.target_id}`),
    );

    if (validPicks.length === 0) {
      logger.info('suggest_links.no_picks', {
        sourceKind: source.kind,
        sourceId: source.id,
        rawPickCount: result.picks.length,
      });
      return;
    }

    const service = createServiceClient();
    const rows = validPicks.map((p) => ({
      owner_id: ownerId,
      source_kind: source.kind,
      source_id: source.id,
      target_kind: p.target_kind,
      target_id: p.target_id,
      reason: p.reasoning,
      source_snapshot_hash: snapshotHash,
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (service as any).from('link_suggestions').insert(rows);
    if (error) {
      logger.error('suggest_links.insert.failed', {
        err: error.message,
        sourceKind: source.kind,
        sourceId: source.id,
      });
      return;
    }

    revalidateForSource(source.kind, source.id);

    logger.info('suggest_links.complete', {
      sourceKind: source.kind,
      sourceId: source.id,
      pickCount: validPicks.length,
      candidateCount: candidates.length,
    });
  } catch (err) {
    if (err instanceof BudgetExceededError) {
      logger.warn('suggest_links.budget_exceeded', {
        sourceKind: source.kind,
        sourceId: source.id,
      });
      return;
    }
    if (err instanceof TaskValidationError) {
      logger.warn('suggest_links.validation_failed', {
        sourceKind: source.kind,
        sourceId: source.id,
        issues: err.issues.map((i) => i.path.join('.')).join(','),
      });
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    logger.error('suggest_links.unhandled', {
      sourceKind: source.kind,
      sourceId: source.id,
      err: message,
    });
  }
}

function sha256(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}

function revalidateForSource(kind: LinkSuggestionSourceKind, id: string): void {
  switch (kind) {
    case 'capture':
      revalidatePath(`/capture/${id}`);
      break;
    case 'thread':
      revalidatePath(`/threads/${id}`);
      break;
    case 'journal_entry':
      revalidatePath('/journal');
      break;
  }
}

/**
 * Convenience wrapper: fetches the source row's title + body + tags from the
 * right table by kind, then calls runSuggestLinks. Designed to be passed to
 * Next.js `after()` from save-path actions:
 *
 *   import { after } from 'next/server';
 *   after(() => scheduleLinkSuggestions(userId, 'thread', threadId));
 */
export async function scheduleLinkSuggestions(
  ownerId: string,
  kind: LinkSuggestionSourceKind,
  id: string,
): Promise<void> {
  try {
    const service = createServiceClient();
    let title = '';
    let body = '';
    let tags: string[] | undefined;

    if (kind === 'capture') {
      const { data } = await service
        .from('captures')
        .select('title, content')
        .eq('id', id)
        .maybeSingle();
      if (!data) return;
      title = data.title ?? '';
      body = data.content ?? '';
    } else if (kind === 'thread') {
      const { data } = await (service as ReturnType<typeof createServiceClient>)
        .from('threads')
        .select('capture_id, sections')
        .eq('id', id)
        .maybeSingle() as { data: { capture_id: string; sections: unknown } | null };
      if (!data) return;
      const sections = Array.isArray(data.sections)
        ? (data.sections as Array<{ body: string }>)
        : [];
      body = sections.map((s) => s.body).filter(Boolean).join('\n\n').trim();

      // Title comes from the seed capture.
      const { data: cap } = await service
        .from('captures')
        .select('title')
        .eq('id', data.capture_id)
        .maybeSingle();
      title = cap?.title ?? '(thread)';
    } else if (kind === 'journal_entry') {
      const { data } = await (service as ReturnType<typeof createServiceClient>)
        .from('journal_entries')
        .select('written_at, body, tags')
        .eq('id', id)
        .maybeSingle() as {
          data: { written_at: string; body: string; tags: string[] | null } | null;
        };
      if (!data) return;
      title = `Journal entry · ${data.written_at}`;
      body = data.body ?? '';
      if (Array.isArray(data.tags) && data.tags.length > 0) tags = data.tags;
    }

    if (body.trim().length === 0) return;

    await runSuggestLinks({
      ownerId,
      source: { kind, id, title, body },
      ...(tags ? { sourceTags: tags } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('scheduleLinkSuggestions.unhandled', {
      kind, id, err: message,
    });
  }
}

// Re-exported for callers that don't want to import Candidate from the
// selection module separately.
export type { Candidate };
