'use client';

import { useRouter } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { ScrollText } from 'lucide-react';
import {
  CaptureContextMenuProvider,
  CaptureRow,
} from '@/components/projects/CaptureContextMenu';
import type { CaptureKind, CaptureState } from '@/lib/capture/kinds';

export type StreamRowData = {
  id: string;
  title: string;
  content: string;
  kind: CaptureKind;
  state: CaptureState;
  created_at: string;
  is_project: boolean;
  project_id: string | null;
};

function kindPillClass(kind: CaptureKind): string {
  switch (kind) {
    case 'idea':
      return 'forge-tag-pill';
    case 'problem':
      return 'forge-tag-pill forge-tag-pill--plum';
    case 'observation':
      return 'forge-tag-pill forge-tag-pill--sky';
    case 'research':
      return 'forge-tag-pill forge-tag-pill--gold';
  }
}

function previewText(s: string | null): string {
  if (!s) return '';
  const oneLine = s.replace(/\s+/g, ' ').trim();
  return oneLine.length > 120 ? oneLine.slice(0, 120) + '…' : oneLine;
}

export function StreamRows({ captures }: { captures: StreamRowData[] }) {
  const router = useRouter();

  return (
    <CaptureContextMenuProvider>
      <div className="forge-list-card">
        {captures.map((c) => (
          <CaptureRow
            key={c.id}
            target={{
              id: c.id,
              title: c.title,
              kind: c.kind,
              state: c.state,
              isProject: c.is_project,
              projectId: c.project_id,
            }}
            className="forge-list-row"
            onClick={() => router.push(`/capture/${c.id}`)}
          >
            <div className="forge-list-row__icon">
              <ScrollText size={14} />
            </div>
            <div className="forge-list-row__body">
              <div className="forge-list-row__title">{c.title}</div>
              <div className="forge-list-row__preview">{previewText(c.content)}</div>
            </div>
            <div className="forge-list-row__right">
              <span className="forge-list-row__when">
                {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
              </span>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                {c.is_project && (
                  <span className="forge-tag-pill forge-tag-pill--moss">project</span>
                )}
                <span className={kindPillClass(c.kind)}>#{c.kind}</span>
              </div>
            </div>
          </CaptureRow>
        ))}
      </div>
    </CaptureContextMenuProvider>
  );
}
