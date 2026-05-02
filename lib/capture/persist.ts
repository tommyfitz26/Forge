import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/db';
import { parsePrefix, heuristicTitle } from './parse';
import { initialResearchStatus, type CaptureKind } from './kinds';
import { runTask } from '@/lib/ai/run';
import { enqueueResearch } from '@/lib/research/enqueue';
import { persistEntitiesAndMentions, type ExtractedEntity } from '@/lib/atlas/persist';
import { logger } from '@/lib/logger';

export type CaptureSource = 'web' | 'shortcut' | 'siri' | 'widget';

export type PersistInput = {
  userId: string;
  /** Raw content. Prefix (if any) is stripped before write; original kept. */
  content: string;
  source: CaptureSource;
  audioDurationSeconds?: number | null;
  /**
   * If present, stored verbatim in `original_transcript`. Only relevant for
   * the voice path — Whisper's raw output before cleaning/prefix-stripping.
   * For text, `content` itself becomes `original_transcript`.
   */
  originalTranscript?: string;
  /**
   * Phase 5.6 — drives the Library shelf bucketing. 'note' for plain text,
   * 'voice' for audio, 'photo' for image captures, 'clip' for web clips.
   * Defaults to 'note' (the schema default) when omitted.
   */
  mediaKind?: 'note' | 'voice' | 'photo' | 'clip';
  /** Optional URL the user clipped — populated only on web-clip captures. */
  sourceUrl?: string;
  /**
   * Optional project to file the capture into at create time. Set when the
   * user picks a project in the capture modal. Skipped (NULL project_id) when
   * undefined or empty — the capture lives in the Stream/Scraps view until
   * promoted or filed later.
   */
  projectId?: string;
};

export type PersistResult = { id: string; kind: CaptureKind };

/**
 * Shared insert path for text + voice + shortcut captures. Uses the caller's
 * Supabase client so RLS runs against the authenticated user.
 *
 * SPEC §4.2 rules 1 + 5 applied here:
 *   - prefix match → set kind, strip prefix from content
 *   - no prefix → kind='observation' as a safe default (Phase 1c replaces this
 *     with the classify_capture Haiku task)
 *   - title = heuristic from cleaned content
 */
export async function persistCapture(
  supabase: SupabaseClient<Database>,
  input: PersistInput,
): Promise<PersistResult> {
  const raw = input.content;
  const prefix = parsePrefix(raw);
  const cleanedContent = prefix.matched ? prefix.stripped : raw;

  // SPEC §4.2: prefix wins (rule 1, no LLM call); otherwise classify with
  // Haiku 4.5 (rule 2). On classifier error / off-schema output, fall back
  // to observation + heuristic title (rule 4).
  let kind: CaptureKind;
  let title: string;
  let classifierUsed = false;
  // Phase 5.7 — entities surface from the same classify call.
  let extractedEntities: ExtractedEntity[] = [];
  if (prefix.matched) {
    kind = prefix.kind;
    title = heuristicTitle(cleanedContent);
  } else {
    classifierUsed = true;
    try {
      const result = await runTask('classify_capture', { content: cleanedContent });
      kind = result.kind;
      title = result.title.trim() || heuristicTitle(cleanedContent);
      extractedEntities = result.entities;
    } catch (err) {
      logger.warn('classify.fallback', {
        err: err instanceof Error ? err.message : String(err),
        userId: input.userId,
      });
      kind = 'observation';
      title = heuristicTitle(cleanedContent);
    }
  }

  // captures.audio_duration_seconds is `int` per SPEC §6.1; Whisper and the
  // client timer both return floats.
  const durationSeconds =
    input.audioDurationSeconds != null && Number.isFinite(input.audioDurationSeconds)
      ? Math.round(input.audioDurationSeconds)
      : null;

  // Phase 5.6 — media_kind drives Library shelf bucketing. Caller passes
  // explicitly when known; defaults to 'note' (the schema default).
  const baseRow = {
    user_id: input.userId,
    kind,
    state: 'raw' as const,
    title,
    content: cleanedContent,
    original_transcript: input.originalTranscript ?? raw,
    source: input.source,
    audio_duration_seconds: durationSeconds,
    research_status: initialResearchStatus(kind),
    ...(input.mediaKind ? { media_kind: input.mediaKind } : {}),
    ...(input.sourceUrl ? { source_url: input.sourceUrl } : {}),
    ...(input.projectId ? { project_id: input.projectId } : {}),
  };

  const { data, error } = await supabase
    .from('captures')
    .insert(baseRow)
    .select('id')
    .single();

  if (error || !data) {
    logger.error('capture.persist.failed', {
      err: error?.message,
      userId: input.userId,
      source: input.source,
    });
    throw new Error(error?.message ?? 'Could not save capture.');
  }

  logger.info('capture.created', {
    captureId: data.id,
    kind,
    source: input.source,
    prefixMatched: prefix.matched,
    classifierUsed,
    hasAudio: input.audioDurationSeconds != null,
    entityCount: extractedEntities.length,
  });

  // Phase 5.7 — write entities + mentions for Atlas. Awaited (cheap;
  // single-digit ms at v1 volumes) so the rows land before any caller
  // navigates to a page that might query Atlas. Errors are swallowed
  // inside the helper.
  if (extractedEntities.length > 0) {
    await persistEntitiesAndMentions(
      supabase,
      input.userId,
      data.id,
      extractedEntities,
    );
  }

  // SPEC §4.3 — auto-enqueue research for idea/research captures.
  // Awaited because Vercel can shut the function down right after the response
  // returns; enqueueResearch handles its own errors so this never throws.
  if (kind === 'idea' || kind === 'research') {
    await enqueueResearch(data.id);
  }

  return { id: data.id, kind };
}
