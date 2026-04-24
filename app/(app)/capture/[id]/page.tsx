import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { KindBadge, StateBadge } from '@/components/ui/badge';
import { StateControls } from './StateControls';
import type { CaptureKind, CaptureState } from '@/lib/capture/kinds';

type Params = Promise<{ id: string }>;

export default async function CaptureDetail({ params }: { params: Params }) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: capture, error } = await supabase
    .from('captures')
    .select(
      'id, title, kind, state, content, created_at, updated_at, archive_reason, source',
    )
    .eq('id', id)
    .single();

  if (error || !capture) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
        >
          <ArrowLeft className="h-3 w-3" />
          Dashboard
        </Link>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <KindBadge kind={capture.kind as CaptureKind} />
          <StateBadge state={capture.state as CaptureState} />
          <span className="text-xs text-neutral-500">
            {formatDistanceToNow(new Date(capture.created_at), { addSuffix: true })}
          </span>
          {capture.source !== 'web' && (
            <span className="text-xs text-neutral-500">· via {capture.source}</span>
          )}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{capture.title}</h1>
      </div>

      <div className="whitespace-pre-wrap rounded-md border border-neutral-200 bg-neutral-50 p-4 text-sm dark:border-neutral-800 dark:bg-neutral-900">
        {capture.content}
      </div>

      {capture.archive_reason && (
        <div className="rounded-md border border-neutral-200 p-3 text-sm text-neutral-600 dark:border-neutral-800 dark:text-neutral-400">
          <span className="font-medium">Archive reason:</span> {capture.archive_reason}
        </div>
      )}

      <div className="border-t border-neutral-200 pt-6 dark:border-neutral-800">
        <StateControls id={capture.id} state={capture.state as CaptureState} />
      </div>
    </div>
  );
}
