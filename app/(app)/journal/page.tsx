import { Plus, PenLine } from 'lucide-react';

export default function JournalPage() {
  // Phase 4.1: empty state. Phase 4.3 backs this with the `journal_entries` table.
  return (
    <div className="space-y-6">
      <div className="forge-page-header">
        <h1>Journal</h1>
        <span className="forge-page-header__meta">where you keep yourself</span>
        <div className="forge-page-header__actions">
          <button type="button" className="forge-btn forge-btn--primary">
            <Plus size={14} /> New entry
          </button>
        </div>
      </div>

      <div
        className="forge-empty rounded-xl border"
        style={{ borderColor: 'var(--line)', background: 'var(--bg-2)' }}
      >
        <div className="forge-empty__glyph">
          <PenLine size={32} className="mx-auto" />
        </div>
        <div className="forge-empty__msg">
          A daily place for what doesn&apos;t yet have a project. Three lines is enough. The serif is intentional — write
          here like you&apos;re writing a letter to a future you.
          <br />
          <span className="text-xs" style={{ fontFamily: 'var(--mono)' }}>
            (Phase 4.3 ships the journal table + entry editor.)
          </span>
        </div>
      </div>
    </div>
  );
}
