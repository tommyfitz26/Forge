import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { format } from 'date-fns';
import { createClient } from '@/lib/supabase/server';
import { KindBadge } from '@/components/ui/badge';
import { renderMarkdownToHtml } from '@/lib/email/markdown';
import type { CaptureKind } from '@/lib/capture/kinds';

// SPEC §4.5 — In-app review screen. Per the post-2026-04-28 §4.6 rewrite,
// this is now a digest with links into the develop-export flow, not a
// stateful Q&A interface. Renders the same `email_content_md` Stage 1
// stored, plus a list of "ready to develop" captures with deep links to
// `/capture/:id` (where the develop panel lives).

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Params = Promise<{ weekId: string }>;

export default async function WeeklyReviewPage({ params }: { params: Params }) {
  const { weekId } = await params;
  if (!UUID_RE.test(weekId)) notFound();

  const supabase = await createClient();
  const { data: row } = await supabase
    .from('weekly_summaries')
    .select(
      'id, week_of, status, email_content_md, captures_included, patterns_detected, sent_at, generated_at',
    )
    .eq('id', weekId)
    .maybeSingle();

  if (!row) notFound();

  // Captures that were summarized — load kind + title for the "Open in Forge"
  // links. captures_included is uuid[] so .in() is the right filter.
  const captureIds: string[] = Array.isArray(row.captures_included)
    ? row.captures_included
    : [];
  const { data: captureRows } = captureIds.length
    ? await supabase
        .from('captures')
        .select('id, kind, title, state, created_at')
        .in('id', captureIds)
    : { data: [] as Array<{ id: string; kind: string; title: string; state: string; created_at: string }> };

  const captures = (captureRows ?? []).sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );

  const html = row.email_content_md ? renderMarkdownToHtml(row.email_content_md) : null;

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

      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Week of {format(new Date(`${row.week_of}T00:00:00`), 'MMMM d, yyyy')}
        </h1>
        <p className="text-xs text-neutral-500">
          {row.status === 'sent' && row.sent_at
            ? `Sent ${format(new Date(row.sent_at), 'EEE MMM d, h:mm a')}`
            : row.status === 'composing'
              ? 'Drafting…'
              : 'Ready to send.'}
        </p>
      </header>

      {html ? (
        <article
          className="prose prose-neutral max-w-none rounded-md border border-neutral-200 bg-white p-5 text-sm leading-relaxed dark:prose-invert dark:border-neutral-800 dark:bg-neutral-950"
          // Markdown is generated server-side from the model's structured
          // output by composeWeeklyReviewEmail; no untrusted HTML enters here.
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <div className="rounded-md border border-dashed border-neutral-300 p-4 text-sm text-neutral-500 dark:border-neutral-700">
          Email content is still being composed. Refresh in a moment.
        </div>
      )}

      {captures.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Open in Forge
          </h2>
          <ul className="divide-y divide-neutral-200 rounded-md border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
            {captures.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 p-3">
                <div className="flex min-w-0 items-center gap-2">
                  <KindBadge kind={c.kind as CaptureKind} />
                  <span className="truncate text-sm">{c.title}</span>
                </div>
                <Link
                  href={`/capture/${c.id}`}
                  className="text-xs text-neutral-500 underline-offset-2 hover:text-neutral-700 hover:underline dark:hover:text-neutral-300"
                >
                  Develop →
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
