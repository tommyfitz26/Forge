export default function ThisWeekPage() {
  // Phase 4.1: static 7-day grid with the current day highlighted.
  // Phase 4.3 wires in derived data from captures + intentions and Google
  // Calendar sync per UI-REDESIGN-SPEC.md §10 Open #7.
  const days = weekDaysAround(new Date());

  return (
    <div className="space-y-6">
      <div className="forge-page-header">
        <h1>This week</h1>
        <span className="forge-page-header__meta">{rangeLabel(days)}</span>
        <div className="forge-page-header__actions">
          <button type="button" className="forge-btn">◀</button>
          <button type="button" className="forge-btn">Today</button>
          <button type="button" className="forge-btn">▶</button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-3">
        {days.map((d) => (
          <div
            key={d.iso}
            className="rounded-xl border p-3"
            style={{
              borderColor: d.today ? 'var(--ember-soft)' : 'var(--line)',
              background: d.today
                ? 'linear-gradient(135deg, var(--ember-soft), var(--bg-2) 60%)'
                : 'var(--bg-2)',
              minHeight: 220,
            }}
          >
            <div className="text-[10px] uppercase tracking-[0.14em] text-ink-3" style={{ fontFamily: 'var(--mono)' }}>
              {d.dayName}
            </div>
            <div
              className="mt-0.5 font-medium leading-none"
              style={{
                fontFamily: 'var(--serif)',
                fontSize: 22,
                color: d.today ? 'var(--ember)' : 'var(--ink-0)',
              }}
            >
              {d.label}
            </div>
            <div className="mt-3 italic text-xs text-ink-3" style={{ fontFamily: 'var(--serif)', fontSize: 13 }}>
              {d.today ? 'No events yet — Calendar sync arrives in Phase 4.3.' : '—'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function weekDaysAround(now: Date) {
  const day = now.getDay(); // 0..6, Sun..Sat
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((day + 6) % 7)); // step back to Monday
  const out: Array<{ iso: string; dayName: string; label: string; today: boolean }> = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    out.push({
      iso: d.toISOString().slice(0, 10),
      dayName: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i] ?? '',
      label: i === 4 ? `${monthShort(d)} ${d.getDate()}` : String(d.getDate()),
      today: sameDay(d, now),
    });
  }
  return out;
}

function rangeLabel(days: ReturnType<typeof weekDaysAround>): string {
  const first = days[0];
  const last = days[days.length - 1];
  if (!first || !last) return '';
  const a = new Date(first.iso);
  const b = new Date(last.iso);
  return `${monthShort(a)} ${a.getDate()} – ${monthShort(b)} ${b.getDate()}, ${b.getFullYear()}`;
}

function sameDay(a: Date, b: Date) {
  return a.toDateString() === b.toDateString();
}
function monthShort(d: Date) {
  return d.toLocaleString('en-US', { month: 'short' });
}
