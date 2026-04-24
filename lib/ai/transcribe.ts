import 'server-only';
import { toFile } from 'openai/uploads';
import { getOpenAI } from './openai';
import { createServiceClient } from '@/lib/supabase/service';
import { logger } from '@/lib/logger';

// Whisper pricing as of v1 (SPEC Appendix A): ~$0.006/minute, charged per
// second. We approximate cost from duration to avoid a second API call.
const WHISPER_USD_PER_SECOND = 0.006 / 60;

export type TranscribeResult = {
  text: string;
  durationSeconds: number | null;
  isEmpty: boolean; // true when audio was silent / inaudible per §4.2 rule 4
};

const EMPTY_MARKERS = new Set(['', '[inaudible]', '.', '?', ' ', '...', '…']);

/**
 * Transcribe an audio buffer via OpenAI Whisper. Handles the §4.2 "empty or
 * unintelligible" fallback and logs a row to api_costs.
 *
 * The caller is responsible for ensuring `bytes` is within Whisper's 25MB limit
 * and has a recognized MIME (see lib/http/read-body + /api/capture/route.ts).
 */
export async function transcribeAudio({
  bytes,
  filename,
  mimeType,
  captureId,
}: {
  bytes: Uint8Array;
  filename: string;
  mimeType: string;
  captureId?: string;
}): Promise<TranscribeResult> {
  const openai = getOpenAI();
  const file = await toFile(bytes, filename, { type: mimeType });

  const started = Date.now();
  const resp = await openai.audio.transcriptions.create({
    file,
    model: 'whisper-1',
    response_format: 'verbose_json',
  });
  const elapsedMs = Date.now() - started;

  // verbose_json returns { text, duration, segments, ... }. Cast narrowly.
  const text = (resp as { text?: string }).text ?? '';
  const duration = (resp as { duration?: number }).duration ?? null;
  const cleaned = text.trim();
  const isEmpty = cleaned.length === 0 || EMPTY_MARKERS.has(cleaned.toLowerCase());

  const costUsd = duration ? Number((duration * WHISPER_USD_PER_SECOND).toFixed(6)) : null;

  // Log to api_costs as service role (respects RLS default-deny on the table).
  try {
    const service = createServiceClient();
    await service.from('api_costs').insert({
      provider: 'openai',
      task: 'transcribe',
      capture_id: captureId ?? null,
      input_tokens: null,
      output_tokens: null,
      cost_usd: costUsd ?? 0,
    });
  } catch (err) {
    // Cost logging must not break the capture flow.
    logger.warn('transcribe.cost_log_failed', { err: err instanceof Error ? err.message : String(err) });
  }

  logger.info('transcribe.done', {
    ...(captureId !== undefined ? { captureId } : {}),
    durationSeconds: duration,
    elapsedMs,
    textLen: cleaned.length,
    isEmpty,
  });

  return {
    text: cleaned,
    durationSeconds: duration,
    isEmpty,
  };
}
