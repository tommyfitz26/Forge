import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { format } from 'date-fns';
import { createClient } from '@/lib/supabase/server';
import { renderMarkdownToHtml } from '@/lib/email/markdown';
import type { CaptureKind } from '@/lib/capture/kinds';

// SPEC §4.5 — In-app review screen. Per the post-2026-04-28 §4.6 rewrite,
// this is now a digest with links into the develop-export flow, not a
// stateful Q&A interface. Renders the same `email_content_md` Stage 1
// stored, plus a list of "ready to develop" captures with deep links to
// `/capture/:id` (where the develop panel lives).

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Params = Promise<{ weekId: string }>;

function kindPillClass(kind: CaptureKind): string {
  return `forge-pill forge-pill--${kind}`;
}

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
    <div className="forge-detail">
      <Link href="/today" className="forge-detail__back">
        <ArrowLeft size={12} />
        Today
      </Link>

      <div className="forge-detail__meta">
        <span className="forge-pill">weekly review</span>
        <span>
          {row.status === 'sent' && row.sent_at
            ? `Sent ${format(new Date(row.sent_at), 'EEE MMM d, h:mm a')}`
            : row.status === 'composing'
              ? 'Drafting…'
              : 'Ready to send.'}
        </span>
      </div>

      <h1 className="forge-detail__title">
        Week of {format(new Date(`${row.week_of}T00:00:00`), 'MMMM d, yyyy')}
      </h1>

      {html ? (
        <article
          className="forge-detail__panel forge-prose"
          // Markdown is generated server-side from the model's structured
          // output by composeWeeklyReviewEmail; no untrusted HTML enters here.
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <div
          className="forge-empty rounded-xl"
          style={{ border: '1px dashed var(--line)', background: 'var(--bg-2)' }}
        >
          <div className="forge-empty__msg">
            Email content is still being composed. Refresh in a moment.
          </div>
        </div>
      )}

      {captures.length > 0 && (
        <section className="mt-6">
          <h2
            className="mb-3"
            style={{ fontFamily: 'var(--serif)', fontSize: 19, fontWeight: 500, color: 'var(--ink-0)' }}
          >
            Open in Forge
          </h2>
          <div className="forge-list-card">
            {captures.map((c) => (
              <Link key={c.id} href={`/capture/${c.id}`} className="forge-list-row">
                <div className="forge-list-row__icon">
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 14 }}>≡</span>
                </div>
                <div className="forge-list-row__body">
                  <div className="forge-list-row__title">{c.title}</div>
                </div>
                <div className="forge-list-row__right">
                  <span className={kindPillClass(c.kind as CaptureKind)}>{c.kind}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
