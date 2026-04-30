import Link from 'next/link';
import { Hash } from 'lucide-react';
import { listJournalEntries } from '@/lib/db/journal';
import { DeleteEntryButton } from '@/components/journal/DeleteEntryButton';

type Params = { slug: string };

export default async function TagFilterPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const entries = await listJournalEntries({ tag: slug, limit: 200 });

  return (
    <div className="space-y-6">
      <div className="forge-page-header">
        <h1>
          <span style={{ color: 'var(--ember)' }}>#</span>
          {slug}
        </h1>
        <span className="forge-page-header__meta">
          {entries.length === 0
            ? 'no journal entries with this tag yet'
            : `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`}
        </span>
      </div>

      {entries.length === 0 ? (
        <div
          className="forge-empty rounded-xl border"
          style={{ borderColor: 'var(--line)', background: 'var(--bg-2)' }}
        >
          <div className="forge-empty__glyph">
            <Hash size={32} className="mx-auto" />
          </div>
          <div className="forge-empty__msg">
            Nothing tagged <span style={{ color: 'var(--ember)' }}>#{slug}</span> yet.
            <br />
            <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>
              v1: only journal entries can be tagged. Capture and thread tagging arrive in a later micro-slice.
            </span>
          </div>
        </div>
      ) : (
        <div className="forge-journal" style={{ marginLeft: 0 }}>
          {entries.map((e) => (
            <article key={e.id} className="forge-journal-entry">
              <div className="forge-journal-entry__date">
                {prettyDate(e.written_at)}
                <span className="weekday">{weekday(e.written_at)}</span>
                <span className="forge-journal-entry__date-actions">
                  <DeleteEntryButton id={e.id} />
                </span>
              </div>
              <div className="forge-journal-entry__body">{e.body}</div>
              {e.tags.length > 0 && (
                <div className="forge-journal-entry__tags">
                  {e.tags.map((t) => (
                    <Link
                      key={t}
                      href={`/tags/${encodeURIComponent(t)}`}
                      className="forge-journal-entry__tag"
                      style={
                        t === slug ? { color: 'var(--ink-0)', fontWeight: 500 } : undefined
                      }
                    >
                      #{t}
                    </Link>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function prettyDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function weekday(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return `· ${d.toLocaleDateString('en-US', { weekday: 'long' })}`;
}
