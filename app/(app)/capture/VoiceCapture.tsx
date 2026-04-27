'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { VoiceRecorder, type RecordedAudio } from '@/components/capture/VoiceRecorder';
import { saveAndUpload } from '@/lib/offline/upload';

type Status =
  | { kind: 'idle' }
  | { kind: 'uploading'; slow: boolean }
  | { kind: 'queued'; message: string };

const SLOW_AFTER_MS = 12_000;

export function VoiceCapture() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const slowTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (slowTimerRef.current != null) window.clearTimeout(slowTimerRef.current);
    };
  }, []);

  async function handleRecorded(audio: RecordedAudio) {
    setStatus({ kind: 'uploading', slow: false });
    slowTimerRef.current = window.setTimeout(() => {
      setStatus((s) => (s.kind === 'uploading' ? { kind: 'uploading', slow: true } : s));
    }, SLOW_AFTER_MS);

    const result = await saveAndUpload({
      blob: audio.blob,
      mimeType: audio.mimeType,
      durationSeconds: audio.durationSeconds,
    });

    if (slowTimerRef.current != null) {
      window.clearTimeout(slowTimerRef.current);
      slowTimerRef.current = null;
    }

    if (result.ok) {
      router.push(`/capture/${result.id}`);
      return;
    }

    setStatus({ kind: 'queued', message: messageForFailure(result.status, result.error) });
  }

  return (
    <div className="space-y-4">
      <VoiceRecorder
        onRecorded={handleRecorded}
        disabled={status.kind === 'uploading'}
      />
      {status.kind === 'uploading' && (
        <div className="space-y-1 text-center">
          <p className="text-sm text-neutral-500">Transcribing…</p>
          {status.slow && (
            <p className="text-xs text-neutral-400">
              Still working — Whisper sometimes takes a bit on longer clips.
            </p>
          )}
        </div>
      )}
      {status.kind === 'queued' && (
        <p className="text-center text-sm text-amber-600 dark:text-amber-400">
          {status.message}
        </p>
      )}
    </div>
  );
}

function messageForFailure(status: number, error: string): string {
  switch (status) {
    case 401:
      return 'Your session expired — please sign in again.';
    case 413:
      return 'Recording exceeded 25MB. Try a shorter one.';
    case 415:
      return "Your device's audio format isn't supported. Recording is saved — please report this.";
    case 502:
      return 'Transcription failed. Saved locally — we\'ll keep trying.';
    case 0:
      return 'Network unavailable. Saved locally — we\'ll keep trying when you reconnect.';
    default:
      if (status >= 500) return 'Server error. Saved locally — we\'ll keep trying.';
      return error || 'Upload didn\'t go through. Saved locally — we\'ll keep trying.';
  }
}
