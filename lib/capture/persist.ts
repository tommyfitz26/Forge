import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/db';
import { parsePrefix, heuristicTitle } from './parse';
import { initialResearchStatus, type CaptureKind } from './kinds';
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
  const kind: CaptureKind = prefix.matched ? prefix.kind : 'observation';
  const cleanedContent = prefix.matched ? prefix.stripped : raw;
  const title = heuristicTitle(cleanedContent);

  const { data, error } = await supabase
    .from('captures')
    .insert({
      user_id: input.userId,
      kind,
      state: 'raw',
      title,
      content: cleanedContent,
      original_transcript: input.originalTranscript ?? raw,
      source: input.source,
      audio_duration_seconds: input.audioDurationSeconds ?? null,
      research_status: initialResearchStatus(kind),
    })
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
    hasAudio: input.audioDurationSeconds != null,
  });

  return { id: data.id, kind };
}
