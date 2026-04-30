import { AlignLeft } from 'lucide-react';

export default function ThreadsPage() {
  // Phase 4.1: empty state. Phase 4.3 backs this with the `threads` table —
  // kind-aware structured-expansion canvases on top of captures.
  return (
    <div className="space-y-6">
      <div className="forge-page-header">
        <h1>Threads</h1>
        <span className="forge-page-header__meta">the long-form expansion of an idea</span>
      </div>

      <div
        className="forge-empty rounded-xl border"
        style={{ borderColor: 'var(--line)', background: 'var(--bg-2)' }}
      >
        <div className="forge-empty__glyph">
          <AlignLeft size={32} className="mx-auto" />
        </div>
        <div className="forge-empty__msg">
          A thread is the structured-expansion view of a capture — same kind-specific sections as the develop-prompt:
          <em> customer / wedge / counter / what-must-be-true</em> for an idea, <em>scope / cost / prior attempts</em>{' '}
          for a problem, etc.
          <br />
          <span className="text-xs" style={{ fontFamily: 'var(--mono)' }}>
            (Phase 4.3 ships threads + the per-capture canvas.)
          </span>
        </div>
      </div>
    </div>
  );
}
