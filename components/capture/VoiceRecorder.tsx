'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic, Square } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export type RecordedAudio = {
  blob: Blob;
  mimeType: string;
  durationSeconds: number;
};

type Props = {
  onRecorded: (audio: RecordedAudio) => void;
  disabled?: boolean;
};

// Feature-detect per SPEC §4.1: Chromium emits audio/webm;codecs=opus;
// Safari emits audio/mp4 (Safari 18's MediaRecorder still has no webm).
// Both are accepted by Whisper.
const CANDIDATE_TYPES = ['audio/webm;codecs=opus', 'audio/mp4'];

function pickSupportedMime(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const t of CANDIDATE_TYPES) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return null;
}

// SPEC §4.1: 180s hard cap, counter turns amber at 150s, red at 170s.
const MAX_SECONDS = 180;
const AMBER_AT = 150;
const RED_AT = 170;
const COUNTDOWN_MS = 500;

type Phase = 'idle' | 'countdown' | 'recording' | 'stopping' | 'error';

export function VoiceRecorder({ onRecorded, disabled }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(0);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const startedAtRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const autoStopRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const mimeRef = useRef<string>('');

  function cleanup() {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (autoStopRef.current != null) {
      window.clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) track.stop();
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
  }

  useEffect(() => cleanup, []);

  function startVisualizer(stream: MediaStream) {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    audioCtxRef.current = ctx;
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    src.connect(analyser);
    analyserRef.current = analyser;

    const buf = new Uint8Array(analyser.frequencyBinCount);
    const loop = () => {
      analyser.getByteTimeDomainData(buf);
      // RMS from [0..255] samples centered at 128.
      let sumSq = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i]! - 128) / 128;
        sumSq += v * v;
      }
      const rms = Math.sqrt(sumSq / buf.length);
      setLevel(Math.min(1, rms * 3));
      rafRef.current = requestAnimationFrame(loop);
    };
    loop();
  }

  async function begin() {
    setError(null);
    const mime = pickSupportedMime();
    if (!mime) {
      setError('Your browser does not support audio recording.');
      setPhase('error');
      return;
    }
    mimeRef.current = mime;

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'mic access denied';
      setError(
        /denied|NotAllowedError/i.test(msg)
          ? 'Microphone permission denied. Enable it in browser settings.'
          : 'Could not access microphone.',
      );
      setPhase('error');
      return;
    }
    streamRef.current = stream;

    // Brief countdown so the user's "tap Record" syllable isn't clipped.
    setPhase('countdown');
    await new Promise((r) => setTimeout(r, COUNTDOWN_MS));

    const recorder = new MediaRecorder(stream, { mimeType: mime });
    recorderRef.current = recorder;
    chunksRef.current = [];

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const started = startedAtRef.current ?? Date.now();
      const durationSeconds = Math.max(0, (Date.now() - started) / 1000);
      const blob = new Blob(chunksRef.current, { type: mimeRef.current });
      cleanup();
      setPhase('idle');
      setElapsed(0);
      setLevel(0);
      if (blob.size > 0) {
        onRecorded({ blob, mimeType: mimeRef.current, durationSeconds });
      } else {
        setError('No audio captured. Try again.');
        setPhase('error');
      }
    };

    startedAtRef.current = Date.now();
    recorder.start();
    setPhase('recording');
    startVisualizer(stream);

    timerRef.current = window.setInterval(() => {
      if (startedAtRef.current == null) return;
      const s = Math.floor((Date.now() - startedAtRef.current) / 1000);
      setElapsed(s);
    }, 200);

    autoStopRef.current = window.setTimeout(() => stop(), MAX_SECONDS * 1000);
  }

  function stop() {
    if (phase !== 'recording') return;
    setPhase('stopping');
    const r = recorderRef.current;
    if (r && r.state !== 'inactive') {
      try {
        r.stop();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'stop failed');
        setPhase('error');
        cleanup();
      }
    }
  }

  const timerColor =
    elapsed >= RED_AT
      ? 'text-red-600 dark:text-red-400'
      : elapsed >= AMBER_AT
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-neutral-500';

  const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const secs = String(elapsed % 60).padStart(2, '0');

  return (
    <div className="flex flex-col items-center gap-6 rounded-md border border-neutral-200 p-6 dark:border-neutral-800">
      {phase === 'idle' || phase === 'error' ? (
        <Button
          type="button"
          size="lg"
          disabled={disabled}
          onClick={begin}
          className="h-20 w-20 rounded-full bg-red-600 text-white hover:bg-red-700"
          aria-label="Start recording"
        >
          <Mic className="h-8 w-8" />
        </Button>
      ) : phase === 'countdown' ? (
        <div className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-red-600 text-sm text-neutral-500">
          …
        </div>
      ) : (
        <Button
          type="button"
          size="lg"
          onClick={stop}
          className="h-20 w-20 rounded-full bg-red-600 text-white hover:bg-red-700"
          aria-label="Stop recording"
        >
          <Square className="h-7 w-7 fill-white" />
        </Button>
      )}

      {phase === 'recording' ? (
        <>
          <Waveform level={level} />
          <div className={cn('font-mono text-sm tabular-nums', timerColor)}>
            {mins}:{secs} <span className="text-neutral-400">/ 03:00</span>
          </div>
        </>
      ) : phase === 'countdown' ? (
        <p className="text-xs text-neutral-500">Get ready…</p>
      ) : phase === 'stopping' ? (
        <p className="text-xs text-neutral-500">Processing…</p>
      ) : (
        <p className="text-xs text-neutral-500">
          Tap to record. Max 3 minutes.
        </p>
      )}

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function Waveform({ level }: { level: number }) {
  // Simple 24-bar animated level indicator. Bars nearest the center react most,
  // falling off toward the edges — enough to signal "we're hearing you."
  const bars = 24;
  return (
    <div className="flex h-10 items-center gap-[3px]">
      {Array.from({ length: bars }).map((_, i) => {
        const distFromCenter = Math.abs(i - (bars - 1) / 2);
        const rolloff = Math.max(0, 1 - distFromCenter / (bars / 2));
        const h = Math.max(4, Math.round(level * 40 * rolloff));
        return (
          <span
            key={i}
            style={{ height: `${h}px` }}
            className="w-[3px] rounded-full bg-red-500/80 transition-[height] duration-75"
          />
        );
      })}
    </div>
  );
}
