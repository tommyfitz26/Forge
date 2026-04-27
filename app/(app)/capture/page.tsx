import { Mic, Type, Camera, Pencil } from 'lucide-react';
import { TextCapture } from './TextCapture';
import { VoiceCapture } from './VoiceCapture';
import { PhotoCapture } from './PhotoCapture';
import { cn } from '@/lib/utils';

type SearchParams = Promise<{ mode?: string }>;

const MODES = [
  { id: 'voice', label: 'Voice', icon: Mic, disabled: false },
  { id: 'text', label: 'Text', icon: Type, disabled: false },
  { id: 'photo', label: 'Photo', icon: Camera, disabled: false },
  { id: 'draw', label: 'Draw', icon: Pencil, disabled: true, note: 'Coming in Phase 4' },
] as const;

type Mode = 'voice' | 'text' | 'photo';

export default async function CapturePage({ searchParams }: { searchParams: SearchParams }) {
  const { mode } = await searchParams;
  const active: Mode =
    mode === 'text' ? 'text' : mode === 'photo' ? 'photo' : 'voice';

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New capture</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Voice is fastest. Text if typing is easier right now.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {MODES.map((m) => {
          const Icon = m.icon;
          const isActive = active === m.id;
          return (
            <a
              key={m.id}
              href={m.disabled ? '#' : `/capture?mode=${m.id}`}
              aria-disabled={m.disabled}
              title={'note' in m ? m.note : undefined}
              className={cn(
                'flex flex-col items-center justify-center gap-2 rounded-lg border p-4 transition-colors',
                m.disabled
                  ? 'cursor-not-allowed border-neutral-200 bg-neutral-50 text-neutral-400 dark:border-neutral-800 dark:bg-neutral-900/50'
                  : isActive
                    ? 'border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900'
                    : 'border-neutral-300 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900',
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="text-sm font-medium">{m.label}</span>
              {m.disabled && <span className="text-[10px]">soon</span>}
            </a>
          );
        })}
      </div>

      {active === 'voice' && <VoiceCapture />}
      {active === 'text' && <TextCapture />}
      {active === 'photo' && <PhotoCapture />}
    </div>
  );
}
