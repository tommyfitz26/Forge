import { Trash2 } from 'lucide-react';
import { listTrash } from '@/lib/db/trash';
import { TrashRow } from '@/components/trash/TrashRow';

export default async function TrashPage() {
  const items = await listTrash();
  const oldestDays = items.reduce((m, it) => Math.max(m, it.ageDays), 0);

  return (
    <div className="space-y-6">
      <div className="forge-page-header">
        <h1>Trash</h1>
        <span className="forge-page-header__meta">
          {items.length === 0
            ? 'auto-deletes after 30 days'
            : items.length === 1
              ? `1 item · oldest ${oldestDays} ${oldestDays === 1 ? 'day' : 'days'} old`
              : `${items.length} items · oldest ${oldestDays} ${oldestDays === 1 ? 'day' : 'days'} old`}
        </span>
      </div>

      {items.length === 0 ? (
        <div
          className="forge-empty rounded-xl border"
          style={{ borderColor: 'var(--line)', background: 'var(--bg-2)' }}
        >
          <div className="forge-empty__glyph">
            <Trash2 size={32} className="mx-auto" />
          </div>
          <div className="forge-empty__msg">
            Trash is empty. Soft-deleted captures, journal entries, threads,
            and projects land here for 30 days before they&apos;re purged.
          </div>
        </div>
      ) : (
        <div className="forge-trash-list">
          {items.map((it) => (
            <TrashRow key={`${it.kind}:${it.id}`} item={it} />
          ))}
        </div>
      )}
    </div>
  );
}
