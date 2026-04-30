import { ScrollText } from 'lucide-react';

export default function ScrapsPage() {
  // Phase 4.1: empty state. Phase 4.3 wires this to captures with state='raw'
  // and is_project=false, plus a future `sketches` table for explicit drafts.
  return (
    <div className="space-y-6">
      <div className="forge-page-header">
        <h1>Scraps</h1>
        <span className="forge-page-header__meta">drafts, fragments, and seeds</span>
      </div>

      <div
        className="forge-empty rounded-xl border"
        style={{ borderColor: 'var(--line)', background: 'var(--bg-2)' }}
      >
        <div className="forge-empty__glyph">
          <ScrollText size={32} className="mx-auto" />
        </div>
        <div className="forge-empty__msg">
          Half-formed things, low pressure. Captures still in <code style={{ fontFamily: 'var(--mono)' }}>raw</code>{' '}
          state and not yet anchored to a project show here.
          <br />
          <span className="text-xs" style={{ fontFamily: 'var(--mono)' }}>
            (Phase 4.3 ships the filter view.)
          </span>
        </div>
      </div>
    </div>
  );
}
