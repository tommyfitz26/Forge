import * as React from 'react';
import { cn } from '@/lib/utils';
import type { CaptureKind, CaptureState, ResearchStatus } from '@/lib/capture/kinds';

const KIND_STYLES: Record<CaptureKind, string> = {
  problem: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  idea: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  observation: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  research: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
};

const STATE_STYLES: Record<CaptureState, string> = {
  raw: 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
  developed:
    'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  serious: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300',
  archived: 'bg-neutral-200 text-neutral-500 dark:bg-neutral-900 dark:text-neutral-500',
};

const base =
  'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium';

export function KindBadge({ kind, className }: { kind: CaptureKind; className?: string }) {
  return <span className={cn(base, KIND_STYLES[kind], className)}>{kind}</span>;
}

export function StateBadge({ state, className }: { state: CaptureState; className?: string }) {
  return <span className={cn(base, STATE_STYLES[state], className)}>{state}</span>;
}

const RESEARCH_STATUS_STYLES: Record<ResearchStatus, string> = {
  pending: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
  running: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  succeeded:
    'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  failed: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  skipped: 'bg-neutral-100 text-neutral-500 dark:bg-neutral-900 dark:text-neutral-500',
};

const RESEARCH_STATUS_LABELS: Record<ResearchStatus, string> = {
  pending: 'research queued',
  running: 'researching…',
  succeeded: 'research ready',
  failed: 'research failed',
  skipped: 'no research',
};

export function ResearchStatusBadge({
  status,
  className,
}: {
  status: ResearchStatus;
  className?: string;
}) {
  return (
    <span className={cn(base, RESEARCH_STATUS_STYLES[status], className)}>
      {RESEARCH_STATUS_LABELS[status]}
    </span>
  );
}
