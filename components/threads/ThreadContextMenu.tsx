'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowUpRight,
  Archive,
  ArchiveRestore,
  Bookmark,
  BookmarkCheck,
  CheckCircle2,
  Circle,
  Link2,
  Trash2,
} from 'lucide-react';
import {
  ContextMenuItem,
  ContextMenuPopover,
  ContextMenuSeparator,
  ContextMenuTrigger,
  useContextMenuState,
  type UseContextMenuStateApi,
} from '@/components/ui/ContextMenu';
import { togglePin } from '@/app/(app)/top-of-mind/actions';
import {
  archiveThread,
  restoreThread,
  markThreadComplete,
} from '@/app/(app)/threads/actions';
import { trashThread } from '@/app/(app)/trash/actions';
import { LinkPalette } from '@/components/links/LinkPalette';

export type ThreadStatus = 'in_progress' | 'complete' | 'archived';

export type ThreadMenuTarget = {
  id: string;
  status: ThreadStatus;
  isPinned: boolean;
};

const Ctx = createContext<UseContextMenuStateApi<ThreadMenuTarget> | null>(null);

export function ThreadContextMenuProvider({ children }: { children: ReactNode }) {
  const api = useContextMenuState<ThreadMenuTarget>();
  const router = useRouter();
  const [linkSource, setLinkSource] = useState<{ id: string } | null>(null);

  return (
    <Ctx.Provider value={api}>
      {children}
      {linkSource && (
        <LinkPalette
          open
          onClose={() => setLinkSource(null)}
          source={{ kind: 'thread', id: linkSource.id }}
        />
      )}
      <ContextMenuPopover state={api.state} onClose={api.close}>
        {api.state.open && (
          <>
            <ContextMenuItem
              primary
              onSelect={() => {
                router.push(`/threads/${api.state.open ? api.state.target.id : ''}`);
                api.close();
              }}
            >
              <ArrowUpRight size={14} /> Open thread
            </ContextMenuItem>

            <ContextMenuItem
              onSelect={() => {
                if (!api.state.open) return;
                const fd = new FormData();
                fd.set('source_kind', 'thread');
                fd.set('source_id', api.state.target.id);
                void togglePin(fd);
                api.close();
              }}
            >
              {api.state.target.isPinned ? (
                <>
                  <BookmarkCheck size={14} /> Unpin from Top of mind
                </>
              ) : (
                <>
                  <Bookmark size={14} /> Pin to Top of mind
                </>
              )}
            </ContextMenuItem>

            <ContextMenuItem
              onSelect={() => {
                if (!api.state.open) return;
                setLinkSource({ id: api.state.target.id });
                api.close();
              }}
            >
              <Link2 size={14} /> Link to…
            </ContextMenuItem>

            <ContextMenuSeparator />

            {api.state.target.status === 'in_progress' && (
              <ContextMenuItem
                onSelect={() => {
                  if (!api.state.open) return;
                  void markThreadComplete(api.state.target.id);
                  api.close();
                }}
              >
                <CheckCircle2 size={14} /> Mark complete
              </ContextMenuItem>
            )}

            {api.state.target.status === 'complete' && (
              <ContextMenuItem
                onSelect={() => {
                  if (!api.state.open) return;
                  void restoreThread(api.state.target.id);
                  api.close();
                }}
              >
                <Circle size={14} /> Mark in-progress
              </ContextMenuItem>
            )}

            {api.state.target.status === 'archived' ? (
              <ContextMenuItem
                onSelect={() => {
                  if (!api.state.open) return;
                  void restoreThread(api.state.target.id);
                  api.close();
                }}
              >
                <ArchiveRestore size={14} /> Restore from archive
              </ContextMenuItem>
            ) : (
              <ContextMenuItem
                onSelect={() => {
                  if (!api.state.open) return;
                  void archiveThread(api.state.target.id);
                  api.close();
                }}
              >
                <Archive size={14} /> Archive
              </ContextMenuItem>
            )}

            <ContextMenuItem
              destructive
              onSelect={() => {
                if (!api.state.open) return;
                void trashThread(api.state.target.id);
                api.close();
              }}
            >
              <Trash2 size={14} /> Move to trash
            </ContextMenuItem>
          </>
        )}
      </ContextMenuPopover>
    </Ctx.Provider>
  );
}

function useApi(): UseContextMenuStateApi<ThreadMenuTarget> {
  const api = useContext(Ctx);
  if (!api) {
    throw new Error('useThreadContextMenu must be used inside ThreadContextMenuProvider');
  }
  return api;
}

/** Wraps a thread row so right-click opens the menu. */
export function ThreadRow({
  target,
  className,
  children,
  style,
}: {
  target: ThreadMenuTarget;
  className?: string;
  children: ReactNode;
  style?: React.CSSProperties;
}) {
  const api = useApi();
  return (
    <ContextMenuTrigger
      api={api}
      target={target}
      className={className}
      {...(style ? { style } : {})}
    >
      {children}
    </ContextMenuTrigger>
  );
}
