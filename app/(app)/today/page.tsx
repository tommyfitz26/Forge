import Link from 'next/link';
import { Plus, Flame } from 'lucide-react';

export default function TodayPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-medium tracking-tight" style={{ fontFamily: 'var(--serif)' }}>
            Good evening, <em style={{ color: 'var(--ember)', fontStyle: 'italic' }}>Thomas</em>.
          </h1>
          <p className="mt-1 text-sm italic text-ink-2" style={{ fontFamily: 'var(--serif)', fontSize: 15 }}>
            What&apos;s on the bench today?
          </p>
        </div>
        <Link href="/capture" className="forge-btn forge-btn--primary">
          <Plus size={14} /> Capture
        </Link>
      </div>

      {/* Today's focus card — placeholder for Phase 4.3 (intentions table) */}
      <div
        className="relative overflow-hidden rounded-xl border p-5"
        style={{
          background:
            'linear-gradient(135deg, var(--ember-soft) 0%, transparent 60%), var(--bg-2)',
          borderColor: 'var(--line)',
          boxShadow: 'var(--shadow-1)',
        }}
      >
        <div className="flex items-center gap-4">
          <div
            className="grid h-9 w-9 place-items-center rounded-full"
            style={{
              background: 'radial-gradient(circle at 50% 60%, #f4c388 0%, #c47840 70%, transparent 95%)',
              boxShadow: '0 0 24px var(--ember-glow)',
            }}
          >
            <Flame size={16} style={{ color: '#1a0f08' }} />
          </div>
          <div className="flex-1">
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3 mb-1">
              Today&apos;s focus
            </div>
            <div className="italic" style={{ fontFamily: 'var(--serif)', fontSize: 18, color: 'var(--ink-1)' }}>
              Set when ready — a morning nudge will ask if you haven&apos;t.
            </div>
          </div>
          <button type="button" className="forge-btn">Set focus</button>
        </div>
      </div>

      {/* On the bench — empty state for Phase 4.1 (no projects yet) */}
      <section>
        <div className="mb-3 flex items-baseline gap-3">
          <h2 style={{ fontFamily: 'var(--serif)', fontSize: 22, fontWeight: 500 }}>On the bench</h2>
          <span style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 14, color: 'var(--ink-2)' }}>
            no projects yet
          </span>
        </div>
        <div className="forge-empty rounded-xl border" style={{ borderColor: 'var(--line)', background: 'var(--bg-2)' }}>
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
      </section>

      {/* Recent captures hint */}
      <section>
        <div className="mb-3 flex items-baseline gap-3">
          <h2 style={{ fontFamily: 'var(--serif)', fontSize: 22, fontWeight: 500 }}>Recently caught</h2>
          <Link href="/stream" className="ml-auto text-xs text-ink-2 hover:text-ember" style={{ fontFamily: 'var(--mono)' }}>
            open Stream →
          </Link>
        </div>
        <div className="forge-empty rounded-xl border" style={{ borderColor: 'var(--line)', background: 'var(--bg-2)' }}>
          <div className="forge-empty__msg">
            Captures show up in <Link href="/stream" style={{ color: 'var(--ember)' }}>Stream</Link> first.
          </div>
        </div>
      </section>
    </div>
  );
}
