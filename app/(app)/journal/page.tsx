import Link from 'next/link';
import { JournalComposer } from '@/components/journal/JournalComposer';
import { DeleteEntryButton } from '@/components/journal/DeleteEntryButton';
import { PinButton } from '@/components/projects/PinButton';
import { listJournalEntries } from '@/lib/db/journal';
import { pinnedSetForOwner } from '@/lib/db/pins';
import type { JournalEntry } from '@/lib/types/journal';

export default async function JournalPage() {
  const today = new Date().toISOString().slice(0, 10);

  const [entries, pinned] = await Promise.all([
    listJournalEntries({ limit: 200 }),
    pinnedSetForOwner(),
  ]);

  const grouped = groupByMonth(entries);

  return (
    <div className="forge-journal">
      <div className="forge-page-header" style={{ borderBottom: 'none', marginBottom: 18 }}>
        <h1>Journal</h1>
        <span className="forge-page-header__meta">where you keep yourself</span>
      </div>

      <JournalComposer defaultDate={today} />

      {entries.length === 0 ? (
        <div
          className="forge-empty rounded-xl border"
          style={{ borderColor: 'var(--line)', background: 'var(--bg-2)' }}
        >
          <div className="forge-empty__msg">
            Nothing in the journal yet. Write something above and hit save — your first day starts the streak.
          </div>
        </div>
      ) : (
        <div>
          {grouped.map((g) => (
            <section key={g.label} className="forge-journal-month">
              <div className="forge-journal-month__head">{g.label}</div>
              {g.entries.map((e) => {
                const isPinned = pinned.has(`journal_entry:${e.id}`);
                return (
                  <article key={e.id} id={e.id} className="forge-journal-entry">
                    <div className="forge-journal-entry__date">
                      {prettyDate(e.written_at)}
                      <span className="weekday">{weekday(e.written_at)}</span>
                      <span className="forge-journal-entry__date-actions">
                        <PinButton
                          sourceKind="journal_entry"
                          sourceId={e.id}
                          initiallyPinned={isPinned}
                        />
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
                          >
                            #{t}
                          </Link>
                        ))}
                      </div>
                    )}
                  </article>
                );
              })}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function groupByMonth(entries: JournalEntry[]): Array<{ label: string; entries: JournalEntry[] }> {
  const buckets = new Map<string, JournalEntry[]>();
  for (const e of entries) {
    const monthKey = e.written_at.slice(0, 7); // YYYY-MM
    const list = buckets.get(monthKey) ?? [];
    list.push(e);
    buckets.set(monthKey, list);
  }
  return [...buckets.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, entriesInMonth]) => ({ label: monthLabel(key), entries: entriesInMonth }));
}

function monthLabel(key: string): string {
  const [yyyy, mm] = key.split('-');
  if (!yyyy || !mm) return key;
  const d = new Date(Number(yyyy), Number(mm) - 1, 1);
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function prettyDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function weekday(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return `· ${d.toLocaleDateString('en-US', { weekday: 'long' })}`;
}
