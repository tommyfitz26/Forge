import { Bookmark } from 'lucide-react';

export default function TopOfMindPage() {
  // Phase 4.1: empty state. Phase 4.3 wires in the `pins` table.
  return (
    <div className="space-y-6">
      <div className="forge-page-header">
        <h1>Top of mind</h1>
        <span className="forge-page-header__meta">what you&apos;re holding right now</span>
      </div>

      <div
        className="forge-empty rounded-xl border"
        style={{ borderColor: 'var(--line)', background: 'var(--bg-2)' }}
      >
        <div className="forge-empty__glyph"><Bookmark size={32} className="mx-auto" /></div>
        <div className="forge-empty__msg">
          Nothing pinned yet. Pin from any list with the bookmark icon — it&apos;ll show up here so you don&apos;t lose it.
        </div>
      </div>
    </div>
  );
}
