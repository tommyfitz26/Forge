import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  readBodyWithCap,
  requestFromBuffer,
  BodyTooLargeError,
  MissingBodyError,
} from '@/lib/http/read-body';
import { transcribeAudio } from '@/lib/ai/transcribe';
import { persistCapture, type CaptureSource } from '@/lib/capture/persist';
import { logger } from '@/lib/logger';

// POST /api/capture — multipart audio upload from the web recorder (and, in
// Phase 1d, from the iOS Shortcut). Must be Node runtime (Whisper calls can
// take 20–30s; Vercel Edge has a 30s hard wall and can't accept our 25MB body).
export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_BYTES = 25 * 1024 * 1024; // Whisper hard limit (SPEC §4.1)

// Relaxed allowlist covering iOS Shortcut + MediaRecorder variants per §4.1.
const MIME_ALLOWLIST = new Set([
  'audio/webm',
  'audio/mp4',
  'audio/mpeg',
  'audio/mp3',
  'audio/m4a',
  'audio/x-m4a',
  'audio/aac',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
]);

function baseMime(contentType: string | null | undefined): string {
  if (!contentType) return '';
  const semi = contentType.indexOf(';');
  return (semi === -1 ? contentType : contentType.slice(0, semi)).trim().toLowerCase();
}

export async function POST(req: NextRequest) {
  // Auth via session cookie. (Phase 1d will add Bearer-token auth for the
  // Shortcut path behind `?source=shortcut`.)
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const source: CaptureSource = req.nextUrl.searchParams.get('source') === 'shortcut'
    ? 'shortcut'
    : 'web';

  // Read body with 25MB cap BEFORE multipart parsing. If Content-Length is
  // absent (iOS Shortcut sometimes) the stream reader aborts the moment the
  // cap is crossed.
  let bodyBytes: Uint8Array;
  try {
    bodyBytes = await readBodyWithCap(req, MAX_BYTES);
  } catch (err) {
    if (err instanceof BodyTooLargeError) {
      return NextResponse.json({ error: 'payload_too_large' }, { status: 413 });
    }
    if (err instanceof MissingBodyError) {
      return NextResponse.json({ error: 'missing_body' }, { status: 400 });
    }
    logger.error('capture.read_body.failed', { err: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  // Parse multipart by reconstructing a Request with the captured body.
  let formData: FormData;
  try {
    const reconstructed = requestFromBuffer(req, bodyBytes);
    formData = await reconstructed.formData();
  } catch (err) {
    logger.warn('capture.multipart_parse.failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'malformed_multipart' }, { status: 400 });
  }

  const audio = formData.get('audio');
  if (audio == null || typeof audio === 'string') {
    return NextResponse.json({ error: 'missing_audio_field' }, { status: 400 });
  }
  // audio is now a File-like (has .type, .size, .arrayBuffer()).

  // Allow an optional client-supplied duration (MediaRecorder's own elapsed
  // timer). Preferred over Whisper's `duration` for cost logging on short clips.
  const clientDurationRaw = formData.get('duration_seconds');
  const clientDuration =
    typeof clientDurationRaw === 'string' && clientDurationRaw.length > 0
      ? Number(clientDurationRaw)
      : null;
  const hasValidClientDuration =
    clientDuration !== null && Number.isFinite(clientDuration) && clientDuration >= 0;

  const file = audio;
  const declaredType = baseMime(file.type || req.headers.get('content-type'));
  if (!MIME_ALLOWLIST.has(declaredType)) {
    // SPEC §4.1: log unknown Content-Type so the allowlist can be extended if
    // a real device surfaces a new variant.
    logger.warn('capture.mime_rejected', {
      receivedType: file.type || '',
      headerType: req.headers.get('content-type') ?? '',
      source,
      userId: user.id,
    });
    return NextResponse.json({ error: 'unsupported_media_type' }, { status: 415 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'payload_too_large' }, { status: 413 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: 'empty_audio' }, { status: 400 });
  }

  // Transcribe.
  const bytes = new Uint8Array(await file.arrayBuffer());
  const filename =
    (file instanceof File ? file.name : '') || `audio.${declaredType.split('/')[1] ?? 'bin'}`;

  let transcript: Awaited<ReturnType<typeof transcribeAudio>>;
  try {
    transcript = await transcribeAudio({
      bytes,
      filename,
      mimeType: declaredType,
    });
  } catch (err) {
    logger.error('capture.transcribe.failed', {
      err: err instanceof Error ? err.message : String(err),
      userId: user.id,
      fileSize: file.size,
      mime: declaredType,
    });
    return NextResponse.json({ error: 'transcription_failed' }, { status: 502 });
  }

  // SPEC §4.2 rule 4: empty / unintelligible transcripts → persist as
  // observation with a placeholder title; user fixes on the detail page.
  if (transcript.isEmpty) {
    const duration = hasValidClientDuration ? clientDuration : transcript.durationSeconds;
    const { data: row, error: insertErr } = await supabase
      .from('captures')
      .insert({
        user_id: user.id,
        kind: 'observation',
        state: 'raw',
        title: 'Untitled capture',
        content: '',
        original_transcript: '',
        source,
        audio_duration_seconds: duration ?? null,
        research_status: 'skipped',
      })
      .select('id')
      .single();
    if (insertErr || !row) {
      return NextResponse.json({ error: 'persist_failed' }, { status: 500 });
    }
    return NextResponse.json({ id: row.id, empty: true }, { status: 201 });
  }

  try {
    const duration = hasValidClientDuration ? clientDuration : transcript.durationSeconds;
    const result = await persistCapture(supabase, {
      userId: user.id,
      content: transcript.text,
      source,
      audioDurationSeconds: duration,
      originalTranscript: transcript.text,
    });
    return NextResponse.json({ id: result.id }, { status: 201 });
  } catch (err) {
    logger.error('capture.persist.api_failed', {
      err: err instanceof Error ? err.message : String(err),
      userId: user.id,
    });
    return NextResponse.json({ error: 'persist_failed' }, { status: 500 });
  }
}
