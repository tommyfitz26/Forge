import Link from 'next/link';
import { Plus, Hammer } from 'lucide-react';

export default function WorkshopPage() {
  // Phase 4.1: empty state. Phase 4.3 backs this with the `projects` table
  // and the right-click-on-capture promotion flow.
  return (
    <div className="space-y-6">
      <div className="forge-page-header">
        <h1>Workshop</h1>
        <span className="forge-page-header__meta">your projects, on the bench</span>
        <div className="forge-page-header__actions">
          <button type="button" className="forge-btn">
            <Plus size={14} /> New project
          </button>
        </div>
      </div>

      <div
        className="forge-empty rounded-xl border"
        style={{ borderColor: 'var(--line)', background: 'var(--bg-2)' }}
      >
        <div className="forge-empty__glyph">
          <Hammer size={32} className="mx-auto" />
        </div>
        <div className="forge-empty__msg">
          Projects emerge from material. The usual flow: capture an idea or problem, work on it, and when it has weight,
          right-click → &ldquo;Make this a project.&rdquo;
          <br />
          <span className="text-xs" style={{ fontFamily: 'var(--mono)' }}>
            (Phase 4.3 ships projects + the promote-from-capture flow.)
          </span>
        </div>
        <div className="mt-4">
          <Link href="/capture" className="forge-btn forge-btn--primary">
            <Plus size={14} /> Start a capture
          </Link>
        </div>
      </div>
    </div>
  );
}
