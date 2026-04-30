import Link from 'next/link';
import { ChevronLeft, ChevronRight, PenLine, Flame } from 'lucide-react';
import {
  getWeekData,
  resolveWeekStart,
  formatWeekRange,
  mondayOf,
  type WeekDay,
} from '@/lib/db/this-week';
import type { CaptureKind } from '@/lib/capture/kinds';

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function isoOfMonday(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function shiftWeek(weekStartIso: string, deltaDays: number): string {
  const d = new Date(`${weekStartIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return isoOfMonday(d);
}

export default async function ThisWeekPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const weekParam = typeof sp.week === 'string' ? sp.week : null;
  const weekStart = resolveWeekStart(weekParam);
  const data = await getWeekData(weekStart);

  const prevHref = `/this-week?week=${shiftWeek(data.weekStart, -7)}`;
  const nextHref = `/this-week?week=${shiftWeek(data.weekStart, 7)}`;
  const todayHref = `/this-week?week=${isoOfMonday(mondayOf(new Date()))}`;

  return (
    <div className="space-y-6">
      <div className="forge-page-header">
        <h1>This week</h1>
        <span className="forge-page-header__meta">
          {formatWeekRange(data.weekStart, data.weekEnd)}
        </span>
        <div className="forge-page-header__actions">
          <Link
            href={prevHref}
            className="forge-btn"
            aria-label="Previous week"
            style={{ textDecoration: 'none' }}
          >
            <ChevronLeft size={14} />
          </Link>
          {!data.isCurrentWeek && (
            <Link
              href={todayHref}
              className="forge-btn"
              style={{ textDecoration: 'none' }}
            >
              Today
            </Link>
          )}
          <Link
            href={nextHref}
            className="forge-btn"
            aria-label="Next week"
            style={{ textDecoration: 'none' }}
          >
            <ChevronRight size={14} />
          </Link>
        </div>
      </div>

      <div className="forge-week-grid">
        {data.days.map((d) => (
          <DayCell key={d.iso} day={d} />
        ))}
      </div>

      <WeekFooter data={data} />
    </div>
  );
}

function DayCell({ day }: { day: WeekDay }) {
  const empty =
    !day.focus && day.captures.length === 0 && day.journal.length === 0;
  return (
    <div
      className="forge-week-day"
      data-today={day.isToday ? 'true' : 'false'}
      data-future={day.isFuture ? 'true' : 'false'}
    >
      <div className="forge-week-day__header">
        <div className="forge-week-day__name">{day.dayName}</div>
        <div className="forge-week-day__num">{day.label}</div>
      </div>

      {day.focus && (
        <div className="forge-week-day__focus">
          <Flame size={11} className="forge-week-day__focus-ico" />
          <span>{day.focus}</span>
        </div>
      )}

      {day.captures.length > 0 && (
        <ul className="forge-week-day__captures">
          {day.captures.map((c) => (
            <li key={c.id}>
              <Link
                href={`/capture/${c.id}`}
                className="forge-week-day__cap"
                data-kind={c.kind}
                title={`${kindLabel(c.kind)} · ${c.title}`}
              >
                <span className="forge-week-day__dot" data-kind={c.kind} />
                <span className="forge-week-day__cap-title">{c.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {day.journal.length > 0 && (
        <Link
          href="/journal"
          className="forge-week-day__journal"
          aria-label={`${day.journal.length} journal entries`}
        >
          <PenLine size={11} />
          <span>
            {day.journal.length === 1
              ? '1 page'
              : `${day.journal.length} pages`}
          </span>
        </Link>
      )}

      {empty && (
        <div className="forge-week-day__empty">
          {day.isFuture ? '—' : 'quiet'}
        </div>
      )}
    </div>
  );
}

function WeekFooter({ data }: { data: Awaited<ReturnType<typeof getWeekData>> }) {
  const { aggregates } = data;
  if (
    aggregates.captureTotal === 0 &&
    aggregates.focusSetDays === 0 &&
    aggregates.journalDays === 0
  ) {
    return null;
  }
  return (
    <div className="forge-week-footer">
      <div className="forge-week-footer__strip">
        <span className="forge-week-footer__stat">
          <strong>{aggregates.captureTotal}</strong>{' '}
          {aggregates.captureTotal === 1 ? 'capture' : 'captures'}
        </span>
        <span className="forge-week-footer__sep">·</span>
        <span className="forge-week-footer__stat">
          <strong>{aggregates.focusSetDays}</strong> / 7 focuses set
        </span>
        <span className="forge-week-footer__sep">·</span>
        <span className="forge-week-footer__stat">
          <strong>{aggregates.journalDays}</strong>{' '}
          {aggregates.journalDays === 1 ? 'journal day' : 'journal days'}
        </span>
      </div>
      {aggregates.captureTotal > 0 && (
        <div className="forge-week-footer__kinds">
          {(['idea', 'problem', 'observation', 'research'] as CaptureKind[])
            .filter((k) => aggregates.byKind[k] > 0)
            .map((k) => (
              <span key={k} className="forge-week-footer__kind" data-kind={k}>
                <span className="forge-week-day__dot" data-kind={k} />
                {k} · {aggregates.byKind[k]}
              </span>
            ))}
        </div>
      )}
    </div>
  );
}

function kindLabel(kind: CaptureKind): string {
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}
