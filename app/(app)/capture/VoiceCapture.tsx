'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { VoiceRecorder, type RecordedAudio } from '@/components/capture/VoiceRecorder';
import { saveAndUpload } from '@/lib/offline/upload';

type Status =
  | { kind: 'idle' }
  | { kind: 'uploading' }
  | { kind: 'queued'; message: string };

export function VoiceCapture() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  async function handleRecorded(audio: RecordedAudio) {
    setStatus({ kind: 'uploading' });
    // saveAndUpload: persist to IDB immediately, then upload with backoff.
    // Any capture survives a page close or network outage — the retry loop
    // resumes from the Unsynced badge on next mount.
    const result = await saveAndUpload({
      blob: audio.blob,
      mimeType: audio.mimeType,
      durationSeconds: audio.durationSeconds,
    });

    if (result.ok) {
      router.push(`/capture/${result.id}`);
      return;
    }

    // Upload failed (permanently or still retrying in the background) — the
    // blob is safe in IDB, so drop the user back to idle with a message.
    setStatus({
      kind: 'queued',
      message:
        result.status === 413
          ? 'Recording exceeded 25MB. Try a shorter one.'
          : result.status === 415
            ? "Your device's audio format isn't supported. Please report this."
            : 'Upload didn\'t go through. Saved locally — we\'ll keep trying.',
    });
  }

  return (
    <div className="space-y-4">
      <VoiceRecorder
        onRecorded={handleRecorded}
        disabled={status.kind === 'uploading'}
      />
      {status.kind === 'uploading' && (
        <p className="text-center text-sm text-neutral-500">Transcribing…</p>
      )}
      {status.kind === 'queued' && (
        <p className="text-center text-sm text-amber-600 dark:text-amber-400">
          {status.message}
        </p>
      )}
    </div>
  );
}
