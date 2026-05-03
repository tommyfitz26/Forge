import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { ArrowLeft, ScrollText } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getThread } from '@/lib/db/threads';
import { ThreadSectionEditor } from '@/components/threads/ThreadSectionEditor';
import { ConnectionsPanel } from '@/components/links/ConnectionsPanel';
import { SuggestionsPanel } from '@/components/links/SuggestionsPanel';
import { PostSaveAutoRefresh } from '@/components/links/PostSaveAutoRefresh';
import { ThreadActions } from '@/components/threads/ThreadActions';
import type { CaptureKind } from '@/lib/capture/kinds';

type Params = Promise<{ id: string }>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ThreadDetail({ params }: { params: Params }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const thread = await getThread(id);
  if (!thread) notFound();

  // Pull the seed capture for the title + back-link.
  const supabase = await createClient();
  const { data: capture } = await supabase
    .from('captures')
    .select('id, title, kind, content, project_id')
    .eq('id', thread.capture_id)
    .maybeSingle();

  const captureTitle = capture?.title ?? '(untitled)';
  const projectId = (capture as { project_id?: string | null } | null)?.project_id ?? null;

  // Fetch the project title if linked, so the meta strip can show it.
  let projectLabel: string | null = null;
  if (projectId) {
    const { data: proj } = await supabase
      .from('projects')
      .select('title')
      .eq('id', projectId)
      .maybeSingle();
    projectLabel = (proj as { title?: string } | null)?.title ?? null;
  }

  return (
    <div className="forge-thread">
      <PostSaveAutoRefresh />
      <div className="forge-detail__topbar">
        <Link href="/threads" className="forge-thread__back">
          <ArrowLeft size={12} />
          Threads
        </Link>
        <ThreadActions threadId={thread.id} status={thread.status} />
      </div>

      <div className="forge-thread__meta">
        <span className={`forge-pill forge-pill--${thread.kind as CaptureKind}`}>{thread.kind}</span>
        <span className="forge-pill">{thread.status.replace('_', ' ')}</span>
        <span>updated {formatDistanceToNow(new Date(thread.updated_at), { addSuffix: true })}</span>
        {projectLabel && projectId && (
          <>
            <span>·</span>
            <Link
              href={`/projects/${projectId}`}
              style={{ color: 'var(--ember)', textDecoration: 'none' }}
            >
              {projectLabel}
            </Link>
          </>
        )}
      </div>

      <h1 className="forge-thread__title">{captureTitle}</h1>

      <div className="forge-thread__sections">
        {thread.sections.map((s) => (
          <ThreadSectionEditor
            key={s.key}
            threadId={thread.id}
            sectionKey={s.key}
            title={s.title}
            initialBody={s.body}
          />
        ))}
      </div>

      <SuggestionsPanel source={{ kind: 'thread', id: thread.id }} />

      <ConnectionsPanel source={{ kind: 'thread', id: thread.id }} />

      {capture && (
        <div className="forge-thread__seed">
          <div className="forge-thread__seed-label">Seed capture</div>
          <Link href={`/capture/${capture.id}`} className="forge-list-row" style={{ borderRadius: 8 }}>
            <div className="forge-list-row__icon">
              <ScrollText size={14} />
            </div>
            <div className="forge-list-row__body">
              <div className="forge-list-row__title">{capture.title}</div>
              <div className="forge-list-row__preview">
                {previewText(capture.content)}
              </div>
            </div>
            <div className="forge-list-row__right">
              <span className={`forge-pill forge-pill--${capture.kind as CaptureKind}`}>{capture.kind}</span>
            </div>
          </Link>
        </div>
      )}
    </div>
  );
}

function previewText(s: string | null): string {
  if (!s) return '';
  const oneLine = s.replace(/\s+/g, ' ').trim();
  return oneLine.length > 140 ? oneLine.slice(0, 140) + '…' : oneLine;
}
