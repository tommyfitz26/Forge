import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { KindBadge, StateBadge } from '@/components/ui/badge';
import { StateControls } from './StateControls';
import { ResearchPanel } from './ResearchPanel';
import type {
  CaptureKind,
  CaptureState,
  ResearchStatus,
} from '@/lib/capture/kinds';

const SIGNED_URL_TTL_SECONDS = 3600;

type Params = Promise<{ id: string }>;

export default async function CaptureDetail({ params }: { params: Params }) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: capture, error } = await supabase
    .from('captures')
    .select(
      'id, title, kind, state, content, created_at, updated_at, archive_reason, source, research_status',
    )
    .eq('id', id)
    .single();

  if (error || !capture) {
    notFound();
  }

  const { data: research } = await supabase
    .from('research')
    .select(
      'competitors, market_context, recent_news, angles, confidence, sources_count, generated_at',
    )
    .eq('capture_id', id)
    .maybeSingle();

  const { data: attachments } = await supabase
    .from('attachments')
    .select('id, kind, storage_path, created_at')
    .eq('capture_id', id)
    .order('created_at', { ascending: true });

  const photos = await Promise.all(
    (attachments ?? [])
      .filter((a) => a.kind === 'photo')
      .map(async (a) => {
        const { data } = await supabase.storage
          .from('attachments')
          .createSignedUrl(a.storage_path, SIGNED_URL_TTL_SECONDS);
        return { id: a.id, url: data?.signedUrl ?? null };
      }),
  );

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

      {photos.length > 0 && (
        <div className="space-y-3">
          {photos.map((p) =>
            p.url ? (
              <div
                key={p.id}
                className="overflow-hidden rounded-md border border-neutral-200 dark:border-neutral-800"
              >
                <Image
                  src={p.url}
                  alt="Capture attachment"
                  width={1200}
                  height={900}
                  unoptimized
                  className="h-auto w-full object-contain"
                />
              </div>
            ) : (
              <div
                key={p.id}
                className="rounded-md border border-dashed border-neutral-300 p-4 text-sm text-neutral-500 dark:border-neutral-700"
              >
                Attached photo unavailable.
              </div>
            ),
          )}
        </div>
      )}

      {capture.content && (
        <div className="whitespace-pre-wrap rounded-md border border-neutral-200 bg-neutral-50 p-4 text-sm dark:border-neutral-800 dark:bg-neutral-900">
          {capture.content}
        </div>
      )}

      {capture.archive_reason && (
        <div className="rounded-md border border-neutral-200 p-3 text-sm text-neutral-600 dark:border-neutral-800 dark:text-neutral-400">
          <span className="font-medium">Archive reason:</span> {capture.archive_reason}
        </div>
      )}

      <ResearchPanel
        captureId={capture.id}
        status={(capture.research_status ?? 'pending') as ResearchStatus}
        research={research ?? null}
      />

      <div className="border-t border-neutral-200 pt-6 dark:border-neutral-800">
        <StateControls id={capture.id} state={capture.state as CaptureState} />
      </div>
    </div>
  );
}
