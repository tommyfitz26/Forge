import { Mic, PenLine, Camera, Link as LinkIcon } from 'lucide-react';
import { TextCapture } from './TextCapture';
import { VoiceCapture } from './VoiceCapture';
import { PhotoCapture } from './PhotoCapture';
import { WebClipCapture } from '@/components/capture/WebClipCapture';

type SearchParams = Promise<{ mode?: string }>;

const MODES = [
  { id: 'voice', label: 'Voice', icon: Mic },
  { id: 'note', label: 'Note', icon: PenLine },
  { id: 'photo', label: 'Photo', icon: Camera },
  { id: 'clip', label: 'Web clip', icon: LinkIcon },
] as const;

type Mode = (typeof MODES)[number]['id'];

export default async function CapturePage({ searchParams }: { searchParams: SearchParams }) {
  const { mode } = await searchParams;
  const active: Mode = isMode(mode) ? mode : 'voice';

  return (
    <div className="forge-capture-host" style={{ maxWidth: 720, margin: '0 auto' }}>
      <div className="space-y-6">
        <div>
          <h1 style={{ fontFamily: 'var(--serif)', fontSize: 28, fontWeight: 500, margin: 0 }}>
            New capture
          </h1>
          <p style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', color: 'var(--ink-2)', fontSize: 15, marginTop: 4 }}>
            Voice is fastest. The others if your hands are free.
          </p>
        </div>

        <div className="forge-mode-picker">
          {MODES.map((m) => {
            const Icon = m.icon;
            const isActive = active === m.id;
            return (
              <a
                key={m.id}
                href={`/capture?mode=${m.id}`}
                className="forge-mode-tile"
                data-active={isActive ? 'true' : 'false'}
              >
                <Icon size={20} />
                <span>{m.label}</span>
              </a>
            );
          })}
        </div>

        <div>
          {active === 'voice' && <VoiceCapture />}
          {active === 'note' && <TextCapture />}
          {active === 'photo' && <PhotoCapture />}
          {active === 'clip' && <WebClipCapture />}
        </div>
      </div>
    </div>
  );
}

function isMode(value: string | undefined): value is Mode {
  return value === 'voice' || value === 'note' || value === 'photo' || value === 'clip';
}
