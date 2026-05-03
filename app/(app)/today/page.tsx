import Link from 'next/link';
import { Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getTodaysIntention } from '@/lib/db/intentions';
import { listProjects } from '@/lib/db/projects';
import { listJournalEntries } from '@/lib/db/journal';
import { TodayFocusCard } from '@/components/today/TodayFocusCard';
import { ProjectCover } from '@/components/projects/ProjectCover';
import { gradientKeyForKind } from '@/lib/types/projects';
import type { CaptureKind } from '@/lib/capture/kinds';

const RECENT_CAPTURES_LIMIT = 5;
const ON_BENCH_LIMIT = 3;
const RECENT_JOURNAL_LIMIT = 3;

function greeting(now: Date): string {
  const h = now.getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default async function TodayPage() {
  const supabase = await createClient();

  const [intention, projects, recentJournal, capturesRes, userRes] = await Promise.all([
    getTodaysIntention(),
    listProjects({ status: 'active', limit: ON_BENCH_LIMIT }),
    listJournalEntries({ limit: RECENT_JOURNAL_LIMIT }),
    supabase
      .from('captures')
      .select('id, title, kind, created_at')
      .neq('state', 'archived')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(RECENT_CAPTURES_LIMIT),
    supabase.auth.getUser(),
  ]);

  const captures = (capturesRes.data ?? []) as Array<{
    id: string;
    title: string;
    kind: CaptureKind;
    created_at: string;
  }>;

  const firstName =
    (userRes.data.user?.user_metadata?.['full_name'] as string | undefined)?.split(' ')[0] ||
    userRes.data.user?.email?.split('@')[0] ||
    'friend';

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1
            className="text-3xl font-medium tracking-tight"
            style={{ fontFamily: 'var(--serif)' }}
          >
            {greeting(new Date())},{' '}
            <em style={{ color: 'var(--ember)', fontStyle: 'italic' }}>{firstName}</em>.
          </h1>
          <p
            className="mt-1 text-sm italic text-ink-2"
            style={{ fontFamily: 'var(--serif)', fontSize: 15 }}
          >
            What&apos;s on the bench today?
          </p>
        </div>
        <Link href="/capture" className="forge-btn forge-btn--primary">
          <Plus size={14} /> Capture
        </Link>
      </div>

      <TodayFocusCard initialBody={intention?.body ?? null} />

      {/* On the bench — top 3 active projects */}
      <section>
        <div className="mb-3 flex items-baseline gap-3">
          <h2
            style={{ fontFamily: 'var(--serif)', fontSize: 22, fontWeight: 500 }}
          >
            On the bench
          </h2>
          {projects.length === 0 ? (
            <span
              style={{
                fontFamily: 'var(--serif)',
                fontStyle: 'italic',
                fontSize: 14,
                color: 'var(--ink-2)',
              }}
            >
              no projects yet
            </span>
          ) : (
            <Link
              href="/workshop"
              className="ml-auto text-xs text-ink-2 hover:text-ember"
              style={{ fontFamily: 'var(--mono)' }}
            >
              open Workshop →
            </Link>
          )}
        </div>

        {projects.length === 0 ? (
          <div
            className="forge-empty rounded-xl border"
            style={{ borderColor: 'var(--line)', background: 'var(--bg-2)' }}
          >
            <div className="forge-empty__glyph">◆</div>
            <div className="forge-empty__msg">
              Projects emerge from captures. Start a capture in Stream, then promote it to a project once it has weight.
            </div>
            <div className="mt-4">
              <Link href="/capture" className="forge-btn forge-btn--primary">
                <Plus size={14} /> Start a capture
              </Link>
            </div>
          </div>
        ) : (
          <div className="forge-bench-grid">
            {projects.map((p) => {
              const gradient = p.cover_gradient_key ?? gradientKeyForKind(p.kind_seed);
              const stage = p.stage ?? 'Active';
              return (
                <Link
                  key={p.id}
                  href={`/projects/${p.id}`}
                  className="forge-proj"
                  style={{ display: 'block', color: 'inherit', textDecoration: 'none' }}
                >
                  <ProjectCover gradientKey={gradient} stage={stage} />
                  <div className="forge-proj__body">
                    <h3 className="forge-proj__title">{p.title}</h3>
                    {p.deck && <div className="forge-proj__deck">{p.deck}</div>}
                    <div className="forge-proj__meta">
                      {p.kind_seed && <span>#{p.kind_seed}</span>}
                      {p.kind_seed && <span className="dot" />}
                      <span>
                        last activity{' '}
                        {new Date(p.last_activity_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* Recently caught */}
      <section>
        <div className="mb-3 flex items-baseline gap-3">
          <h2
            style={{ fontFamily: 'var(--serif)', fontSize: 22, fontWeight: 500 }}
          >
            Recently caught
          </h2>
          <Link
            href="/stream"
            className="ml-auto text-xs text-ink-2 hover:text-ember"
            style={{ fontFamily: 'var(--mono)' }}
          >
            open Stream →
          </Link>
        </div>
        {captures.length === 0 ? (
          <div
            className="forge-empty rounded-xl border"
            style={{ borderColor: 'var(--line)', background: 'var(--bg-2)' }}
          >
            <div className="forge-empty__msg">
              Captures show up in{' '}
              <Link href="/stream" style={{ color: 'var(--ember)' }}>
                Stream
              </Link>{' '}
              first.
            </div>
          </div>
        ) : (
          <ul className="forge-today-list">
            {captures.map((c) => (
              <li key={c.id} className="forge-today-list__row">
                <Link
                  href={`/capture/${c.id}`}
                  className="forge-today-list__link"
                >
                  <span className="forge-today-list__kind">{c.kind}</span>
                  <span className="forge-today-list__title">{c.title}</span>
                  <time
                    className="forge-today-list__time"
                    dateTime={c.created_at}
                  >
                    {timeAgo(c.created_at)}
                  </time>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Today's pages — last few journal entries */}
      <section>
        <div className="mb-3 flex items-baseline gap-3">
          <h2
            style={{ fontFamily: 'var(--serif)', fontSize: 22, fontWeight: 500 }}
          >
            Today&apos;s pages
          </h2>
          <Link
            href="/journal"
            className="ml-auto text-xs text-ink-2 hover:text-ember"
            style={{ fontFamily: 'var(--mono)' }}
          >
            open Journal →
          </Link>
        </div>
        {recentJournal.length === 0 ? (
          <div
            className="forge-empty rounded-xl border"
            style={{ borderColor: 'var(--line)', background: 'var(--bg-2)' }}
          >
            <div className="forge-empty__msg">
              Three lines is enough. Open the{' '}
              <Link href="/journal" style={{ color: 'var(--ember)' }}>
                Journal
              </Link>{' '}
              when you&apos;re ready.
            </div>
          </div>
        ) : (
          <ul className="forge-today-pages">
            {recentJournal.map((e) => (
              <li key={e.id} className="forge-today-pages__row">
                <time
                  className="forge-today-pages__date"
                  dateTime={e.written_at}
                >
                  {formatDate(e.written_at)}
                </time>
                <p className="forge-today-pages__body">
                  {previewLine(e.body)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.max(0, Math.round((now - then) / 1000));
  if (diffSec < 60) return 'just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

function formatDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function previewLine(body: string): string {
  const oneLine = body.replace(/\s+/g, ' ').trim();
  return oneLine.length > 180 ? oneLine.slice(0, 180) + '…' : oneLine;
}
