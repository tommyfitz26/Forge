import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { KindBadge, StateBadge } from '@/components/ui/badge';
import { StateControls } from './StateControls';
import { ResearchPanel } from './ResearchPanel';
import { DevelopPanel } from './DevelopPanel';
import { NudgeBanner } from './NudgeBanner';
import { buildDevelopPrompt } from '@/lib/develop/prompt';
import { ResearchSchema } from '@/lib/ai/research-schema';
import { logger } from '@/lib/logger';
import type {
  CaptureKind,
  CaptureState,
  ResearchStatus,
} from '@/lib/capture/kinds';

const SIGNED_URL_TTL_SECONDS = 3600;

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CaptureDetail({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const rawNudgeParam = typeof sp.nudge === 'string' ? sp.nudge : null;
  const nudgeIdFromUrl = rawNudgeParam && UUID_RE.test(rawNudgeParam) ? rawNudgeParam : null;

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

  // SPEC §4.4 — when arriving via push notification (?nudge=:id) mark the
  // nudge responded_at if it isn't already. This is what gates the 48-hour
  // debounce on subsequent eligibility checks. Errors are non-fatal: failing
  // to write responded_at means the nudge would re-pick this capture next
  // slot, which is annoying but not broken.
  let nudgeForBanner: { id: string; question: string; alreadyResponded: boolean } | null = null;
  if (nudgeIdFromUrl) {
    const { data: nudgeRow } = await supabase
      .from('nudges')
      .select('id, question, responded_at, capture_id')
      .eq('id', nudgeIdFromUrl)
      .maybeSingle();
    if (nudgeRow && nudgeRow.capture_id === id) {
      const alreadyResponded = nudgeRow.responded_at !== null;
      if (!alreadyResponded) {
        const { error: updErr } = await supabase
          .from('nudges')
          .update({ responded_at: new Date().toISOString() })
          .eq('id', nudgeRow.id);
        if (updErr) {
          logger.warn('nudge.responded_at.write_failed', {
            nudgeId: nudgeRow.id,
            err: updErr.message,
          });
        }
      }
      nudgeForBanner = {
        id: nudgeRow.id,
        question: nudgeRow.question,
        alreadyResponded,
      };
    }
  }

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

      {nudgeForBanner && (
        <NudgeBanner
          nudgeId={nudgeForBanner.id}
          question={nudgeForBanner.question}
          alreadyResponded={nudgeForBanner.alreadyResponded}
        />
      )}

      <ResearchPanel
        captureId={capture.id}
        status={(capture.research_status ?? 'pending') as ResearchStatus}
        research={research ?? null}
      />

      <DevelopPanel
        captureId={capture.id}
        state={capture.state as CaptureState}
        prompt={buildDevelopPrompt({
          capture: {
            kind: capture.kind as CaptureKind,
            title: capture.title,
            content: capture.content ?? '',
          },
          // research is jsonb in Postgres → loose-typed; re-validate so a stale
          // row (pre-schema) can't crash prompt generation. Failed parse =
          // treat as no research, same UX as research_status='skipped'.
          research: research ? (ResearchSchema.safeParse(research).data ?? null) : null,
        })}
      />

      <div className="border-t border-neutral-200 pt-6 dark:border-neutral-800">
        <StateControls id={capture.id} state={capture.state as CaptureState} />
      </div>
    </div>
  );
}
