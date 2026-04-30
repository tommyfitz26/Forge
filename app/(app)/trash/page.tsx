import { Trash2 } from 'lucide-react';

export default function TrashPage() {
  // Phase 4.1: empty state. Phase 4.3 wires this to soft-deleted captures
  // (deleted_at is not null AND deleted_at > now() - 30 days).
  return (
    <div className="space-y-6">
      <div className="forge-page-header">
        <h1>Trash</h1>
        <span className="forge-page-header__meta">auto-deletes after 30 days</span>
        <div className="forge-page-header__actions">
          <button type="button" className="forge-btn" disabled aria-disabled>Restore all</button>
          <button type="button" className="forge-btn" disabled aria-disabled>Empty trash</button>
        </div>
      </div>

      <div
        className="forge-empty rounded-xl border"
        style={{ borderColor: 'var(--line)', background: 'var(--bg-2)' }}
      >
        <div className="forge-empty__glyph">
          <Trash2 size={32} className="mx-auto" />
        </div>
        <div className="forge-empty__msg">
          Trash is empty.
          <br />
          <span className="text-xs" style={{ fontFamily: 'var(--mono)' }}>
            (Phase 4.3 wires soft-delete + the 30-day window.)
          </span>
        </div>
      </div>
    </div>
  );
}
