import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { createClient } from '@/lib/supabase/server';
import { KindBadge } from '@/components/ui/badge';
import type { CaptureKind } from '@/lib/capture/kinds';

export default async function ArchivePage() {
  const supabase = await createClient();
  const { data: captures } = await supabase
    .from('captures')
    .select('id, title, kind, created_at, archive_reason')
    .eq('state', 'archived')
    .order('created_at', { ascending: false });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Archive</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Archived captures. Restore or delete forever from the detail page.
        </p>
      </div>

      {!captures || captures.length === 0 ? (
        <div className="rounded-md border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500 dark:border-neutral-700">
          No archived captures.
        </div>
      ) : (
        <ul className="divide-y divide-neutral-200 overflow-hidden rounded-md border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {captures.map((c) => (
            <li key={c.id}>
              <Link
                href={`/capture/${c.id}`}
                className="flex items-center justify-between gap-3 p-4 hover:bg-neutral-50 dark:hover:bg-neutral-900"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{c.title}</div>
                  <div className="mt-0.5 text-xs text-neutral-500">
                    {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                    {c.archive_reason && ` · ${c.archive_reason}`}
                  </div>
                </div>
                <KindBadge kind={c.kind as CaptureKind} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
